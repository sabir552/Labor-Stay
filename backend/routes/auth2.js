/**
 * Auth v2 (Piece 13) — 2FA, sessions, security.
 * Mounted at /api/auth — these endpoints sit alongside existing auth routes.
 *
 *   POST   /api/auth/2fa/setup            — generate TOTP secret + otpauth URL
 *   POST   /api/auth/2fa/enable           — verify first code → enable
 *   POST   /api/auth/2fa/verify           — verify code (post-login)
 *   POST   /api/auth/2fa/disable          — disable (requires password)
 *   GET    /api/auth/2fa/backup-codes     — generate / regenerate 8 codes
 *   GET    /api/auth/2fa/status           — { enabled, available }
 *
 *   GET    /api/auth/sessions             — active sessions for current user
 *   DELETE /api/auth/sessions/:id         — revoke one
 *   DELETE /api/auth/sessions/all         — revoke all
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/auditLog');
const twoFA = require('../utils/twoFactor');
const sessions = require('../utils/sessions');

const router = express.Router();

// ---------- 2FA ----------
router.get('/2fa/status', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT is_enabled FROM user_2fa WHERE user_id = $1', [req.user.id]);
    res.json({ enabled: !!(rows[0] && rows[0].is_enabled), available: twoFA.available });
  } catch (e) { next(e); }
});

router.post('/2fa/setup', authRequired, async (req, res, next) => {
  try {
    const label = req.user.email;
    const { base32, otpauth_url } = twoFA.generateSecret(label);
    // Upsert — overwrite any in-flight not-yet-enabled secret
    const { rows: existing } = await db.query('SELECT id FROM user_2fa WHERE user_id = $1', [req.user.id]);
    if (existing[0]) {
      await db.query('UPDATE user_2fa SET secret=$1, is_enabled=0 WHERE user_id=$2', [base32, req.user.id]);
    } else {
      await db.query('INSERT INTO user_2fa (user_id, secret, is_enabled) VALUES ($1,$2,0)', [req.user.id, base32]);
    }
    res.json({ secret: base32, otpauth_url, message: 'Scan with Google Authenticator / Authy, then POST /2fa/enable with a code.' });
  } catch (e) { next(e); }
});

router.post('/2fa/enable',
  authRequired,
  [body('token').isString().isLength({ min: 6, max: 8 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { rows } = await db.query('SELECT secret FROM user_2fa WHERE user_id = $1', [req.user.id]);
      if (!rows[0]) return res.status(400).json({ error: '2FA not initialized — call /2fa/setup first.' });

      const ok = twoFA.verifyToken(rows[0].secret, req.body.token);
      if (!ok) return res.status(400).json({ error: 'Invalid verification code' });

      const codes = twoFA.generateBackupCodes(8);
      const hashed = await twoFA.hashBackupCodes(codes);
      await db.query(
        `UPDATE user_2fa SET is_enabled=1, enabled_at=CURRENT_TIMESTAMP, backup_codes=$1 WHERE user_id=$2`,
        [JSON.stringify(hashed), req.user.id]
      );
      auditLog(req, 'enable_2fa', 'user', req.user.id);
      res.json({ ok: true, backup_codes: codes, message: 'Save these backup codes — each is one-time use.' });
    } catch (e) { next(e); }
  }
);

// Verify a 2FA code post-login (used during the login flow when 2FA enabled).
router.post('/2fa/verify',
  authLimiter,
  [body('user_id').isInt({ min: 1 }), body('token').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const { user_id, token } = req.body;
      const { rows } = await db.query('SELECT secret, backup_codes FROM user_2fa WHERE user_id=$1 AND is_enabled=1', [user_id]);
      if (!rows[0]) return res.status(400).json({ error: '2FA not enabled for this user.' });

      // Try TOTP first
      if (twoFA.verifyToken(rows[0].secret, token)) {
        return res.json({ ok: true, method: 'totp' });
      }
      // Try backup code
      let hashed = [];
      try { hashed = JSON.parse(rows[0].backup_codes || '[]'); } catch {}
      const match = await twoFA.verifyBackupCode(hashed, token);
      if (match) {
        await db.query('UPDATE user_2fa SET backup_codes=$1 WHERE user_id=$2',
          [JSON.stringify(match.remaining), user_id]);
        return res.json({ ok: true, method: 'backup_code', remaining_codes: match.remaining.length });
      }
      res.status(400).json({ error: 'Invalid 2FA code' });
    } catch (e) { next(e); }
  }
);

router.post('/2fa/disable',
  authRequired,
  [body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      // Admin accounts cannot disable 2FA
      if (req.user.role === 'admin') {
        return res.status(403).json({ error: '2FA is required for admin accounts.' });
      }
      const { rows: u } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      const ok = await bcrypt.compare(req.body.password, u[0]?.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Wrong password' });

      await db.query('DELETE FROM user_2fa WHERE user_id=$1', [req.user.id]);
      auditLog(req, 'disable_2fa', 'user', req.user.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.get('/2fa/backup-codes', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT is_enabled FROM user_2fa WHERE user_id=$1', [req.user.id]);
    if (!rows[0] || !rows[0].is_enabled) return res.status(400).json({ error: '2FA not enabled.' });
    const codes = twoFA.generateBackupCodes(8);
    const hashed = await twoFA.hashBackupCodes(codes);
    await db.query('UPDATE user_2fa SET backup_codes=$1 WHERE user_id=$2', [JSON.stringify(hashed), req.user.id]);
    auditLog(req, 'regenerate_2fa_codes', 'user', req.user.id);
    res.json({ backup_codes: codes });
  } catch (e) { next(e); }
});

// ---------- SESSIONS ----------
router.get('/sessions', authRequired, async (req, res, next) => {
  try {
    const list = await sessions.list(req.user.id);
    res.json({ sessions: list });
  } catch (e) { next(e); }
});

router.delete('/sessions/all', authRequired, async (req, res, next) => {
  try {
    // Keep current token alive
    const current = req.headers.authorization?.replace(/^Bearer /, '') || req.cookies?.token || null;
    await sessions.revokeAll(req.user.id, current);
    auditLog(req, 'revoke_all_sessions', 'user', req.user.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/sessions/:id', authRequired, async (req, res, next) => {
  try {
    const ok = await sessions.revoke(parseInt(req.params.id, 10), req.user.id);
    if (!ok) return res.status(404).json({ error: 'Session not found' });
    auditLog(req, 'revoke_session', 'session', parseInt(req.params.id, 10));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
