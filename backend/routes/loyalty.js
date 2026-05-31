/**
 * Loyalty points (H2).
 *
 * Rules:
 *   - Earn 1 point per SAR 10 spent (rounded)
 *   - 100 points = SAR 10 discount  → 1 point = SAR 0.10
 *   - Bonuses: 50pts first booking, 25pts per review, custom via /credit
 *   - Tiers: Bronze (0-499), Silver (500-1999, 5% off), Gold (2000+, 10% off + priority)
 *   - Expire on 12 months of inactivity (cron in scheduler.js, future enhancement)
 *
 * Table: loyalty_points
 *
 *   GET    /balance          — current points + SAR value + tier
 *   GET    /history          — transactions
 *   POST   /redeem           — redeem points (returns discount info)
 *   GET    /tiers            — tier metadata
 *   POST   /credit           — admin: manually credit
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

const POINTS_PER_SAR = 0.1;     // 1 pt = SAR 0.10
const SAR_PER_POINT_SPEND = 10; // 1 pt earned per SAR 10 spent

const TIERS = [
  { key: 'bronze', label: 'Bronze', min: 0,    max: 499,  discount_pct: 0 },
  { key: 'silver', label: 'Silver', min: 500,  max: 1999, discount_pct: 5 },
  { key: 'gold',   label: 'Gold',   min: 2000, max: null, discount_pct: 10 },
];

function tierFor(points) {
  for (const t of TIERS) {
    if (points >= t.min && (t.max === null || points <= t.max)) return t;
  }
  return TIERS[0];
}

async function getBalance(userId) {
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(points),0) AS total FROM loyalty_points WHERE user_id=$1`,
    [userId]
  );
  return parseInt(rows[0].total || 0, 10);
}

// ─── BALANCE ───
router.get('/balance', authRequired, async (req, res, next) => {
  try {
    const total = await getBalance(req.user.id);
    const tier = tierFor(total);
    const nextTier = TIERS.find((t) => t.min > total);
    res.json({
      points: total,
      sar_value: Math.round(total * POINTS_PER_SAR * 100) / 100,
      tier: tier.key,
      tier_label: tier.label,
      discount_pct: tier.discount_pct,
      next_tier: nextTier ? { key: nextTier.key, points_needed: nextTier.min - total } : null,
    });
  } catch (e) { next(e); }
});

// ─── HISTORY ───
router.get('/history', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM loyalty_points WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200`,
      [req.user.id]
    );
    res.json({ transactions: rows });
  } catch (e) { next(e); }
});

// ─── REDEEM ───
router.post('/redeem',
  authRequired,
  [body('points').isInt({ min: 100 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const points = parseInt(req.body.points, 10);
      const balance = await getBalance(req.user.id);
      if (balance < points) return res.status(400).json({ error: 'Insufficient points', balance });

      const discountSar = Math.round(points * POINTS_PER_SAR * 100) / 100;
      await db.query(
        `INSERT INTO loyalty_points (user_id, points, transaction_type, description)
         VALUES ($1,$2,'redeemed',$3)`,
        [req.user.id, -points, `Redeemed ${points}pts for SAR ${discountSar} discount`]
      );
      auditLog(req, 'redeem_loyalty', 'loyalty_points', null, { points, discount_sar: discountSar });
      res.json({ ok: true, redeemed_points: points, discount_sar: discountSar, new_balance: balance - points });
    } catch (e) { next(e); }
  }
);

// ─── TIERS ───
router.get('/tiers', (_req, res) => res.json({ tiers: TIERS }));

// ─── ADMIN: credit ───
router.post('/credit',
  authRequired, requireRole('admin'),
  [
    body('user_id').isInt({ min: 1 }),
    body('points').isInt({ min: 1, max: 100000 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { rows } = await db.query(
        `INSERT INTO loyalty_points (user_id, points, transaction_type, description)
         VALUES ($1,$2,'bonus',$3) RETURNING *`,
        [req.body.user_id, req.body.points, req.body.reason || 'Manual admin credit']
      );
      auditLog(req, 'credit_loyalty', 'loyalty_points', rows[0].id, { user_id: req.body.user_id, points: req.body.points });
      res.status(201).json({ entry: rows[0] });
    } catch (e) { next(e); }
  }
);

// Internal helpers
async function earnPointsForBooking(userId, totalSar, bookingId) {
  const points = Math.round(parseFloat(totalSar || 0) / SAR_PER_POINT_SPEND);
  if (points <= 0) return 0;
  try {
    await db.query(
      `INSERT INTO loyalty_points (user_id, points, transaction_type, reference_type, reference_id, description)
       VALUES ($1,$2,'earned','booking',$3,$4)`,
      [userId, points, bookingId, `Earned ${points}pts from SAR ${totalSar} booking`]
    );
  } catch (e) { /* ignore */ }
  return points;
}

async function bonusFirstBooking(userId) {
  try {
    const { rows } = await db.query(
      `SELECT id FROM loyalty_points WHERE user_id=$1 AND description LIKE '%First booking bonus%' LIMIT 1`, [userId]
    );
    if (rows[0]) return false;
    await db.query(
      `INSERT INTO loyalty_points (user_id, points, transaction_type, description)
       VALUES ($1,50,'bonus','First booking bonus — 50 points')`,
      [userId]
    );
    return true;
  } catch (e) { return false; }
}

module.exports = router;
module.exports.earnPointsForBooking = earnPointsForBooking;
module.exports.bonusFirstBooking = bonusFirstBooking;
module.exports.TIERS = TIERS;
module.exports.tierFor = tierFor;
module.exports.getBalance = getBalance;
