/**
 * Auth routes: register (worker / owner / provider), login, logout,
 * forgot/reset password (token-based), me, update-profile.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, signToken } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/auditLog');
const ipBlocking   = require('../middleware/ipBlocking');
const sessions     = require('../utils/sessions');
const { sendEmail, templates, notify } = require('../utils/emailService');
const { ROLES } = require('../config/constants');

const router = express.Router();

// In-memory password-reset token store (dev). In prod, store in DB or Redis.
const resetTokens = new Map(); // token -> { userId, expires }

function validate(req, res) {
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errs.array() });
    return false;
  }
  return true;
}

// ---------------- REGISTER ----------------
router.post(
  '/register',
  authLimiter,
  [
    body('role').isIn(['worker', 'owner', 'provider']).withMessage('role must be worker, owner, or provider'),
    body('full_name').isString().isLength({ min: 2 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('phone').optional().isString(),
    body('preferred_language').optional().isIn(['en', 'ar', 'ur']),
    body('consent').equals('true').withMessage('PDPL consent is required'),
  ],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const {
        role, full_name, email, password, phone,
        preferred_language = 'en',
        // worker fields
        nationality, iqama_number, iqama_expiry,
        // owner fields
        company_name, cr_number, vat_number, address,
      } = req.body;

      const exists = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (exists.rows.length) return res.status(409).json({ error: 'Email already registered' });

      const hash = await bcrypt.hash(password, 10);
      const ins = await db.query(
        `INSERT INTO users (role, full_name, email, password_hash, phone, preferred_language, is_active, is_verified)
         VALUES ($1,$2,$3,$4,$5,$6,1,0) RETURNING *`,
        [role, full_name, email, hash, phone || null, preferred_language]
      );
      const user = ins.rows[0];

      // Profile rows
      if (role === ROLES.WORKER) {
        await db.query(
          `INSERT INTO worker_profiles (user_id, nationality, iqama_number, iqama_expiry)
           VALUES ($1,$2,$3,$4)`,
          [user.id, nationality || null, iqama_number || null, iqama_expiry || null]
        );
      } else if (role === ROLES.OWNER || role === ROLES.PROVIDER) {
        await db.query(
          `INSERT INTO owner_profiles (user_id, company_name, cr_number, vat_number, address)
           VALUES ($1,$2,$3,$4,$5)`,
          [user.id, company_name || null, cr_number || null, vat_number || null, address || null]
        );
      }

      const token = signToken(user);
      const tpl = templates.welcome(full_name);
      sendEmail({ to: email, subject: tpl.subject, html: tpl.html }).catch(() => {});
      notify(user.id, { type: 'welcome', title: 'Welcome to LaborStay', body: tpl.subject, link: '/' });
      auditLog(req, 'register', 'user', user.id, { role });

      res.status(201).json({ user: sanitize(user), token });
    } catch (err) { next(err); }
  }
);

// ---------------- LOGIN ----------------
router.post(
  '/login',
  authLimiter,
  ipBlocking.guard,
  [body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const { email, password, twofa_token } = req.body;
      const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      const user = rows[0];
      if (!user) { await req.ipFailed?.(); return res.status(401).json({ error: 'Invalid credentials' }); }
      if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) { await req.ipFailed?.(); return res.status(401).json({ error: 'Invalid credentials' }); }

      // F1 — 2FA challenge: if enabled for this user, require the second factor.
      try {
        const { rows: tfa } = await db.query('SELECT secret, is_enabled, backup_codes FROM user_2fa WHERE user_id=$1', [user.id]);
        if (tfa[0] && tfa[0].is_enabled) {
          const twoFA = require('../utils/twoFactor');
          if (!twofa_token) {
            return res.status(200).json({ requires_2fa: true, user_id: user.id, message: 'Re-call /api/auth/login with twofa_token.' });
          }
          // Try TOTP first, then backup codes.
          let pass = twoFA.verifyToken(tfa[0].secret, twofa_token);
          if (!pass) {
            let hashed = []; try { hashed = JSON.parse(tfa[0].backup_codes || '[]'); } catch {}
            const match = await twoFA.verifyBackupCode(hashed, twofa_token);
            if (match) {
              pass = true;
              await db.query('UPDATE user_2fa SET backup_codes=$1 WHERE user_id=$2',
                [JSON.stringify(match.remaining), user.id]);
            }
          }
          if (!pass) { await req.ipFailed?.(); return res.status(401).json({ error: 'Invalid 2FA code' }); }
        } else if (false) {
          // 2FA required for admins in production — block login until set up.
          return res.status(403).json({ error: '2FA setup required for admin accounts.', code: '2FA_SETUP_REQUIRED' });
        }
      } catch (e) { /* user_2fa table may not exist in older deploys — fall through */ }

      const token = signToken(user);
      await req.ipSucceeded?.();
      try { await sessions.create(user.id, token, req); } catch {}
      auditLog(req, 'login', 'user', user.id);
      res.json({ user: sanitize(user), token });
    } catch (err) { next(err); }
  }
);

// ---------------- LOGOUT ----------------
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// ---------------- ME ----------------
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const profile = await loadFullProfile(req.user.id);
    res.json({ user: profile });
  } catch (err) { next(err); }
});

// ---------------- UPDATE PROFILE ----------------
router.put('/update-profile', authRequired, async (req, res, next) => {
  try {
    const { full_name, phone, preferred_language, avatar_url } = req.body;
    await db.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         preferred_language = COALESCE($3, preferred_language),
         avatar_url = COALESCE($4, avatar_url),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [full_name || null, phone || null, preferred_language || null, avatar_url || null, req.user.id]
    );

    // Role-specific updates
    if (req.user.role === 'worker') {
      const { nationality, iqama_number, iqama_expiry } = req.body;
      await db.query(
        `UPDATE worker_profiles SET
           nationality = COALESCE($1, nationality),
           iqama_number = COALESCE($2, iqama_number),
           iqama_expiry = COALESCE($3, iqama_expiry)
         WHERE user_id = $4`,
        [nationality || null, iqama_number || null, iqama_expiry || null, req.user.id]
      );
    } else if (req.user.role === 'owner' || req.user.role === 'provider') {
      const { company_name, cr_number, vat_number, address } = req.body;
      await db.query(
        `UPDATE owner_profiles SET
           company_name = COALESCE($1, company_name),
           cr_number = COALESCE($2, cr_number),
           vat_number = COALESCE($3, vat_number),
           address = COALESCE($4, address)
         WHERE user_id = $5`,
        [company_name || null, cr_number || null, vat_number || null, address || null, req.user.id]
      );
    }

    auditLog(req, 'update_profile', 'user', req.user.id);
    const profile = await loadFullProfile(req.user.id);
    res.json({ user: profile });
  } catch (err) { next(err); }
});

// ---------------- FORGOT PASSWORD ----------------
router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const { rows } = await db.query('SELECT id, full_name, email FROM users WHERE email = $1', [req.body.email]);
      // Always respond OK to avoid email enumeration
      if (rows[0]) {
        const token = crypto.randomBytes(24).toString('hex');
        resetTokens.set(token, { userId: rows[0].id, expires: Date.now() + 30 * 60 * 1000 });
        const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
        sendEmail({
          to: rows[0].email,
          subject: 'Reset your LaborStay password',
          html: `<p>Hi ${rows[0].full_name},</p>
                 <p>Click the link below to reset your password (expires in 30 min):</p>
                 <p><a href="${link}">${link}</a></p>`,
        }).catch(() => {});
      }
      res.json({ ok: true, message: 'If an account exists, a reset link has been sent.' });
    } catch (err) { next(err); }
  }
);

// ---------------- RESET PASSWORD ----------------
router.post(
  '/reset-password',
  authLimiter,
  [body('token').isString().notEmpty(), body('password').isLength({ min: 6 })],
  async (req, res, next) => {
    try {
      if (!validate(req, res)) return;
      const { token, password } = req.body;
      const entry = resetTokens.get(token);
      if (!entry || entry.expires < Date.now()) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [hash, entry.userId]);
      resetTokens.delete(token);
      auditLog(req, 'reset_password', 'user', entry.userId);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ---------------- helpers ----------------
function sanitize(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

async function loadFullProfile(userId) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = sanitize(rows[0]);
  if (!user) return null;
  if (user.role === 'worker') {
    const { rows: wp } = await db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [userId]);
    user.worker_profile = wp[0] || null;
  } else if (user.role === 'owner' || user.role === 'provider') {
    const { rows: op } = await db.query('SELECT * FROM owner_profiles WHERE user_id = $1', [userId]);
    user.owner_profile = op[0] || null;
  }
  return user;
}

module.exports = router;
module.exports.loadFullProfile = loadFullProfile;
module.exports.sanitize = sanitize;
