/**
 * Iqama / Passport expiry alerts (D4).
 *
 * The actual sending is done by the cron in utils/scheduler.js (Piece 13).
 * This route just provides admin/owner visibility.
 *
 *   GET /api/admin/expiry-alerts                   — all expiring docs (admin)
 *   GET /api/owner/expiry-alerts/camp/:campId      — for a specific camp's staff
 *
 * Query: ?days=30 (default 60) — show docs expiring within N days
 *        ?include_expired=true — also show overdue documents
 */
const express = require('express');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

function daysBetween(a, b) {
  return Math.ceil((new Date(a) - new Date(b)) / 86400000);
}

function classify(expiry, now) {
  const d = daysBetween(expiry, now);
  if (d < 0) return { status: 'expired', days_overdue: -d };
  if (d <= 7) return { status: 'urgent', days_remaining: d };
  if (d <= 30) return { status: 'soon', days_remaining: d };
  if (d <= 60) return { status: 'upcoming', days_remaining: d };
  return null;
}

async function gatherAlerts({ daysAhead, includeExpired, campId, ownerId }) {
  const today = new Date();
  const horizon = new Date(today.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
  const past = new Date(0).toISOString().slice(0, 10);
  const lowerBound = includeExpired ? past : today.toISOString().slice(0, 10);

  const alerts = [];

  // Workers (Iqama only)
  try {
    const params = [lowerBound, horizon];
    let sql = `SELECT u.id AS user_id, u.full_name, u.email, u.phone, u.role,
                      wp.iqama_number AS doc_number, wp.iqama_expiry AS expiry
               FROM users u JOIN worker_profiles wp ON wp.user_id=u.id
               WHERE u.is_active=1 AND wp.iqama_expiry IS NOT NULL
                 AND wp.iqama_expiry >= $1 AND wp.iqama_expiry <= $2`;
    if (ownerId) {
      // Show workers who have an active booking at this owner's camps
      params.push(ownerId);
      sql += ` AND EXISTS (
        SELECT 1 FROM bookings b JOIN camps c ON c.id=b.camp_id
        WHERE b.worker_id=u.id AND c.owner_id=$${params.length}
          AND b.status IN ('confirmed','checked_in')
      )`;
    }
    const { rows } = await db.query(sql, params);
    for (const r of rows) {
      const c = classify(r.expiry, today);
      if (c) alerts.push({ kind: 'worker_iqama', subject: r.full_name, contact: r.email || r.phone,
                           doc_type: 'Iqama', doc_number: r.doc_number, expiry: r.expiry, ...c,
                           subject_id: r.user_id });
    }
  } catch (e) { /* table may be missing in fresh deploys */ }

  // Staff (Iqama + Passport)
  try {
    const params = [lowerBound, horizon, lowerBound, horizon];
    let sql = `SELECT s.id, s.full_name, s.phone, s.email, s.iqama_number, s.iqama_expiry,
                      s.passport_number, s.passport_expiry, s.camp_id, c.name AS camp_name, c.owner_id
               FROM camp_staff s JOIN camps c ON c.id=s.camp_id
               WHERE s.is_active=1 AND (
                 (s.iqama_expiry    IS NOT NULL AND s.iqama_expiry >= $1    AND s.iqama_expiry <= $2) OR
                 (s.passport_expiry IS NOT NULL AND s.passport_expiry >= $3 AND s.passport_expiry <= $4)
               )`;
    if (campId)  { params.push(campId);  sql += ` AND s.camp_id=$${params.length}`; }
    if (ownerId) { params.push(ownerId); sql += ` AND c.owner_id=$${params.length}`; }
    const { rows } = await db.query(sql, params);
    for (const r of rows) {
      for (const [field, label, num] of [
        ['iqama_expiry',    'Iqama',    r.iqama_number],
        ['passport_expiry', 'Passport', r.passport_number],
      ]) {
        if (!r[field]) continue;
        const c = classify(r[field], today);
        if (c) alerts.push({
          kind: 'staff_doc', subject: r.full_name, contact: r.email || r.phone,
          camp_id: r.camp_id, camp_name: r.camp_name,
          doc_type: label, doc_number: num, expiry: r[field], ...c,
          subject_id: r.id,
        });
      }
    }
  } catch (e) { /* table may be missing */ }

  // Sort by urgency (expired first, then by days remaining)
  alerts.sort((a, b) => {
    const order = { expired: 0, urgent: 1, soon: 2, upcoming: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return (a.days_remaining || 0) - (b.days_remaining || 0);
  });

  // Group summary
  const summary = { total: alerts.length, expired: 0, urgent: 0, soon: 0, upcoming: 0 };
  for (const a of alerts) summary[a.status] = (summary[a.status] || 0) + 1;
  return { alerts, summary };
}

// ─── ADMIN: all ───
router.get('/admin/expiry-alerts',
  authRequired, requireRole('admin'),
  async (req, res, next) => {
    try {
      const daysAhead = Math.min(180, parseInt(req.query.days || 60, 10));
      const includeExpired = req.query.include_expired === 'true';
      const result = await gatherAlerts({ daysAhead, includeExpired });
      res.json({ ...result, range: { days_ahead: daysAhead, include_expired: includeExpired } });
    } catch (e) { next(e); }
  }
);

// ─── OWNER: per-camp ───
router.get('/owner/expiry-alerts/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      if (req.user.role !== 'admin') {
        const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
        if (!rows[0]) return res.status(404).json({ error: 'Camp not found' });
        if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
      }
      const daysAhead = Math.min(180, parseInt(req.query.days || 60, 10));
      const includeExpired = req.query.include_expired === 'true';
      const result = await gatherAlerts({ daysAhead, includeExpired, campId });
      res.json({ ...result, range: { days_ahead: daysAhead, include_expired: includeExpired }, camp_id: campId });
    } catch (e) { next(e); }
  }
);

// ─── OWNER: all my camps combined ───
router.get('/owner/expiry-alerts',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const daysAhead = Math.min(180, parseInt(req.query.days || 60, 10));
      const includeExpired = req.query.include_expired === 'true';
      const result = await gatherAlerts({
        daysAhead, includeExpired,
        ownerId: req.user.role === 'admin' ? null : req.user.id,
      });
      res.json({ ...result, range: { days_ahead: daysAhead, include_expired: includeExpired } });
    } catch (e) { next(e); }
  }
);

module.exports = router;
