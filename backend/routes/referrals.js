/**
 * Referrals (H1).
 *
 * Each user gets a unique 8-char referral code on first use. When a new
 * user signs up with someone's code, the referrer earns SAR 50 credit
 * (loyalty system handles the actual credit). Reward is created at signup;
 * marked rewarded after the referred user completes their first booking.
 *
 * Tables (Piece 13 v2): referrals  +  users.referral_code, users.referred_by_code
 *
 *   GET    /my-code          — get / generate my code
 *   POST   /apply            — apply a code (during/after registration)
 *   GET    /stats            — my referrals + earnings
 *   GET    /leaderboard      — admin: top referrers
 *
 * Reward = SAR 50 (configurable via env REFERRAL_REWARD_SAR)
 */
const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();
const REWARD_AMOUNT = parseFloat(process.env.REFERRAL_REWARD_SAR || 50);

function generateCode(seed = '') {
  // Friendly 8-char code: 4 alphanum chars + last 4 of email/name
  const seedPart = String(seed).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4) || 'USER';
  const rnd = crypto.randomBytes(2).toString('hex').toUpperCase();
  return (seedPart + rnd).slice(0, 8);
}

async function ensureCode(userId) {
  const { rows } = await db.query('SELECT referral_code, email FROM users WHERE id=$1', [userId]);
  if (!rows[0]) return null;
  if (rows[0].referral_code) return rows[0].referral_code;
  // Try up to 5 times to get a unique code
  for (let i = 0; i < 5; i++) {
    const code = generateCode(rows[0].email);
    const { rows: ex } = await db.query('SELECT id FROM users WHERE referral_code=$1', [code]);
    if (!ex[0]) {
      await db.query('UPDATE users SET referral_code=$1 WHERE id=$2', [code, userId]);
      return code;
    }
  }
  return null;
}

// ─── MY CODE ───
router.get('/my-code', authRequired, async (req, res, next) => {
  try {
    const code = await ensureCode(req.user.id);
    if (!code) return res.status(500).json({ error: 'Could not generate code' });
    const link = `${process.env.FRONTEND_URL || ''}/register?ref=${code}`;
    res.json({ code, link, reward_amount: REWARD_AMOUNT, currency: 'SAR' });
  } catch (e) { next(e); }
});

// ─── APPLY CODE (called by the referred user after signup) ───
router.post('/apply',
  authRequired,
  [body('code').isString().isLength({ min: 4, max: 16 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const code = String(req.body.code).toUpperCase().trim();

      // Look up the referrer
      const { rows: refUser } = await db.query('SELECT id, full_name FROM users WHERE referral_code=$1', [code]);
      if (!refUser[0]) return res.status(404).json({ error: 'Invalid referral code' });
      if (refUser[0].id === req.user.id) return res.status(400).json({ error: 'Cannot refer yourself' });

      // Already used a code?
      const { rows: me } = await db.query('SELECT referred_by_code FROM users WHERE id=$1', [req.user.id]);
      if (me[0]?.referred_by_code) return res.status(409).json({ error: 'You have already used a referral code' });

      // De-dup: this referred user shouldn't have a row already
      const { rows: dup } = await db.query('SELECT id FROM referrals WHERE referred_id=$1 LIMIT 1', [req.user.id]);
      if (dup[0]) return res.status(409).json({ error: 'Already linked to a referral' });

      await db.query('UPDATE users SET referred_by_code=$1 WHERE id=$2', [code, req.user.id]);
      const { rows: ins } = await db.query(
        `INSERT INTO referrals (referrer_id, referred_id, referral_code, status, reward_amount, reward_credited)
         VALUES ($1,$2,$3,'pending',$4,0) RETURNING *`,
        [refUser[0].id, req.user.id, code, REWARD_AMOUNT]
      );
      notify(refUser[0].id, {
        type: 'referral_new',
        title: '🎁 New referral signup!',
        body: `Someone signed up using your code. You'll earn SAR ${REWARD_AMOUNT} after their first booking.`,
        link: '/worker/referrals',
      });
      auditLog(req, 'apply_referral', 'referrals', ins[0].id);
      res.status(201).json({ referral: ins[0], message: 'Referral linked! Reward credited after your first booking.' });
    } catch (e) { next(e); }
  }
);

// ─── STATS (mine) ───
router.get('/stats', authRequired, async (req, res, next) => {
  try {
    const code = await ensureCode(req.user.id);
    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS referred_name, u.email AS referred_email
       FROM referrals r LEFT JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id=$1 ORDER BY r.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const summary = rows.reduce((acc, r) => {
      if (r.status === 'rewarded') { acc.rewarded++; acc.earned += parseFloat(r.reward_amount || 0); }
      else if (r.status === 'completed') acc.completed++;
      else acc.pending++;
      return acc;
    }, { rewarded: 0, completed: 0, pending: 0, earned: 0 });
    res.json({ code, link: `${process.env.FRONTEND_URL || ''}/register?ref=${code}`,
               referrals: rows, summary, reward_amount: REWARD_AMOUNT });
  } catch (e) { next(e); }
});

// ─── LEADERBOARD (admin) ───
router.get('/leaderboard', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.full_name, u.email, u.referral_code,
              COUNT(r.id) AS total_referrals,
              SUM(CASE WHEN r.status='rewarded' THEN 1 ELSE 0 END) AS rewarded,
              COALESCE(SUM(CASE WHEN r.status='rewarded' THEN r.reward_amount ELSE 0 END),0) AS total_earned
       FROM users u LEFT JOIN referrals r ON r.referrer_id = u.id
       WHERE u.referral_code IS NOT NULL
       GROUP BY u.id, u.full_name, u.email, u.referral_code
       HAVING COUNT(r.id) > 0
       ORDER BY total_referrals DESC, total_earned DESC LIMIT 50`
    );
    res.json({ leaderboard: rows });
  } catch (e) { next(e); }
});

// Internal helper — called by booking flow when a booking is paid
async function maybeCreditReferral(referredUserId) {
  try {
    const { rows } = await db.query(
      `SELECT * FROM referrals WHERE referred_id=$1 AND status IN ('pending','completed') LIMIT 1`,
      [referredUserId]
    );
    if (!rows[0]) return null;
    const r = rows[0];
    if (r.reward_credited) return r;

    await db.query(
      `UPDATE referrals SET status='rewarded', reward_credited=1 WHERE id=$1`, [r.id]
    );
    // Credit loyalty points via direct insert (avoid circular require)
    try {
      await db.query(
        `INSERT INTO loyalty_points (user_id, points, transaction_type, reference_type, reference_id, description)
         VALUES ($1,$2,'bonus','referral',$3,$4)`,
        [r.referrer_id, Math.round(parseFloat(r.reward_amount) * 10), r.id,
         `Referral reward: SAR ${r.reward_amount} (1pt = SAR 0.10)`]
      );
    } catch (e) { /* table missing */ }
    return r;
  } catch (e) { return null; }
}

module.exports = router;
module.exports.maybeCreditReferral = maybeCreditReferral;
