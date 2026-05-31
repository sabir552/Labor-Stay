/**
 * Camp comparison (H3) + Badges (H5).
 *
 *   GET /api/camps/compare?ids=1,2,3      — side-by-side comparison
 *   GET /api/badges/camp/:id              — badges for a camp
 *   GET /api/badges/worker/:id            — badges for a worker
 *
 * Badges are auto-computed from camp/booking/review data; we also cache
 * them in the `badges` table (Piece 13 v2) for fast lookup elsewhere.
 *
 * Camp badges:
 *   top_rated     — rating >= 4.5 with >= 10 reviews
 *   most_popular  — 50+ completed bookings
 *   verified      — status='approved'
 *   new           — listed within last 30 days
 *   budget_pick   — lowest min_price_day in its city for its room_type
 *   family_friendly — family_allowed=1 AND rating >= 4
 *
 * Worker badges:
 *   trusted_tenant — 5+ completed bookings AND 0 disputes
 *   loyal_guest    — Gold loyalty tier (2000+ points)
 *   verified_worker — is_verified=1 (Iqama verified)
 */
const express = require('express');
const db = require('../config/database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

async function loadCamp(id) {
  const { rows } = await db.query('SELECT * FROM camps WHERE id=$1', [id]);
  if (!rows[0]) return null;
  const c = rows[0];
  c.amenities = parseJSON(c.amenities, []);
  c.nearby_pois = parseJSON(c.nearby_pois, []);
  c.nationality_preference = parseJSON(c.nationality_preference, []);
  // Get cheapest active room price + room count
  const { rows: rp } = await db.query(
    `SELECT MIN(price_per_day) AS min_price, COUNT(*) AS rooms
     FROM rooms WHERE camp_id=$1 AND is_active=1`, [id]
  );
  c.min_price_day = rp[0]?.min_price ? parseFloat(rp[0].min_price) : null;
  c.room_count = parseInt(rp[0]?.rooms || 0, 10);
  // Total capacity / available beds
  const { rows: bp } = await db.query(
    `SELECT COALESCE(SUM(capacity),0) AS cap, COALESCE(SUM(available_beds),0) AS avail
     FROM rooms WHERE camp_id=$1 AND is_active=1`, [id]
  );
  c.total_capacity = parseInt(bp[0]?.cap || 0, 10);
  c.available_beds = parseInt(bp[0]?.avail || 0, 10);
  return c;
}

// ─── COMPARE ───
router.get('/camps/compare', async (req, res, next) => {
  try {
    const idStrs = String(req.query.ids || '').split(',').map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (idStrs.length < 1) return res.status(400).json({ error: 'Provide 1-3 ids in ?ids=1,2,3' });
    if (idStrs.length > 3) return res.status(400).json({ error: 'Maximum 3 camps can be compared' });

    const camps = [];
    for (const id of idStrs) {
      const c = await loadCamp(id);
      if (c) camps.push(c);
    }
    if (!camps.length) return res.status(404).json({ error: 'No camps found' });

    // Build comparison rows (frontend renders the table)
    res.json({ camps, comparing: camps.length });
  } catch (e) { next(e); }
});

// ─── BADGES helpers ───
async function computeCampBadges(camp) {
  const badges = [];
  const today = new Date();

  if (camp.rating >= 4.5 && (camp.review_count || 0) >= 10) badges.push({ key: 'top_rated', label: 'Top Rated', icon: '⭐', color: 'gold' });
  if (camp.status === 'approved') badges.push({ key: 'verified', label: 'Verified', icon: '✓', color: 'emerald' });

  // Most popular
  try {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS c FROM bookings WHERE camp_id=$1 AND status IN ('checked_out','confirmed','checked_in')`,
      [camp.id]
    );
    if (parseInt(rows[0].c, 10) >= 50) badges.push({ key: 'most_popular', label: 'Most Popular', icon: '🔥', color: 'rose' });
  } catch (e) {}

  // New (last 30 days)
  if (camp.created_at) {
    const ageDays = Math.floor((today - new Date(camp.created_at)) / 86400000);
    if (ageDays <= 30) badges.push({ key: 'new', label: 'New', icon: '🆕', color: 'blue' });
  }

  // Budget pick: cheapest active room in the city
  try {
    const { rows } = await db.query(
      `SELECT c.id, MIN(r.price_per_day) AS price
       FROM camps c JOIN rooms r ON r.camp_id=c.id
       WHERE c.city=$1 AND c.status='approved' AND r.is_active=1
       GROUP BY c.id ORDER BY price ASC LIMIT 1`,
      [camp.city]
    );
    if (rows[0] && rows[0].id === camp.id) badges.push({ key: 'budget_pick', label: 'Budget Pick', icon: '💰', color: 'navy' });
  } catch (e) {}

  // Family friendly
  if (camp.family_allowed && camp.rating >= 4) badges.push({ key: 'family_friendly', label: 'Family Friendly', icon: '👨‍👩‍👧', color: 'emerald' });

  return badges;
}

async function computeWorkerBadges(workerId) {
  const badges = [];
  // Trusted tenant
  try {
    const { rows: c } = await db.query(
      `SELECT COUNT(*) AS c FROM bookings WHERE worker_id=$1 AND status='checked_out'`, [workerId]
    );
    let disputes = 0;
    try {
      const { rows: d } = await db.query(
        `SELECT COUNT(*) AS c FROM disputes WHERE raised_by=$1`, [workerId]
      );
      disputes = parseInt(d[0].c, 10);
    } catch (e) {}
    if (parseInt(c[0].c, 10) >= 5 && disputes === 0) {
      badges.push({ key: 'trusted_tenant', label: 'Trusted Tenant', icon: '🤝', color: 'emerald' });
    }
  } catch (e) {}

  // Loyal guest (Gold tier — 2000+ pts)
  try {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(points),0) AS total FROM loyalty_points WHERE user_id=$1`, [workerId]
    );
    if (parseInt(rows[0].total, 10) >= 2000) {
      badges.push({ key: 'loyal_guest', label: 'Loyal Guest', icon: '👑', color: 'gold' });
    }
  } catch (e) {}

  // Verified worker
  try {
    const { rows: u } = await db.query('SELECT is_verified FROM users WHERE id=$1', [workerId]);
    if (u[0]?.is_verified) {
      badges.push({ key: 'verified_worker', label: 'Verified Worker', icon: '✓', color: 'blue' });
    }
  } catch (e) {}

  return badges;
}

async function cacheBadges(entityType, entityId, badges) {
  try {
    await db.query('DELETE FROM badges WHERE entity_type=$1 AND entity_id=$2', [entityType, entityId]);
    for (const b of badges) {
      await db.query(
        `INSERT INTO badges (entity_type, entity_id, badge_type) VALUES ($1,$2,$3)`,
        [entityType, entityId, b.key]
      );
    }
  } catch (e) { /* ignore */ }
}

router.get('/badges/camp/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const camp = await loadCamp(id);
    if (!camp) return res.status(404).json({ error: 'Camp not found' });
    const badges = await computeCampBadges(camp);
    cacheBadges('camp', id, badges).catch(() => {});
    res.json({ badges });
  } catch (e) { next(e); }
});

router.get('/badges/worker/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const badges = await computeWorkerBadges(id);
    cacheBadges('worker', id, badges).catch(() => {});
    res.json({ badges });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.computeCampBadges = computeCampBadges;
module.exports.computeWorkerBadges = computeWorkerBadges;
