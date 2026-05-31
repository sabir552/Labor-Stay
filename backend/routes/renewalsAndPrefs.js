/**
 * Booking renewal flow (C3) + Notification preferences (H10).
 *
 * C3 — Renewal stored as a `worker_service_request` with a structured
 * description (we don't need a new table). New booking is auto-created on
 * approval. Mounted at /api so the paths match the prompt exactly.
 *
 * Endpoints
 *   POST /api/bookings/:id/renewal-request           — worker requests extension
 *   PUT  /api/bookings/:id/renewal-request/approve   — owner approves → creates new booking
 *   PUT  /api/bookings/:id/renewal-request/reject    — owner rejects
 *
 *   GET  /api/notifications/preferences              — get my prefs
 *   PUT  /api/notifications/preferences              — bulk-update my prefs
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify, sendEmail } = require('../utils/emailService');
const { computeBooking } = require('../utils/vatCalculator');
const { priceStay } = require('../utils/dynamicPricing');

const router = express.Router();

const NOTIF_CATEGORIES = ['booking', 'payment', 'promotion', 'reminder', 'survey', 'system'];
const NOTIF_CHANNELS   = ['in_app', 'email', 'sms', 'whatsapp'];

const code = (prefix) => `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;

// ─── C3 — RENEWAL REQUEST ───
router.post(
  '/bookings/:id/renewal-request',
  authRequired,
  requireRole('worker', 'admin'),
  [
    body('new_end_date').isString().notEmpty().withMessage('new_end_date YYYY-MM-DD required'),
    body('reason').optional().isString().isLength({ max: 1000 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows: bk } = await db.query(
        `SELECT b.*, c.owner_id, c.name AS camp_name, r.name AS room_name
         FROM bookings b JOIN camps c ON c.id=b.camp_id JOIN rooms r ON r.id=b.room_id
         WHERE b.id=$1`, [id]
      );
      const b = bk[0];
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && b.worker_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your booking' });
      }
      if (!['confirmed', 'checked_in'].includes(b.status)) {
        return res.status(400).json({ error: `Cannot request renewal from status ${b.status}` });
      }
      if (new Date(req.body.new_end_date) <= new Date(b.end_date)) {
        return res.status(400).json({ error: 'new_end_date must be after current end_date' });
      }

      // De-dup: don't allow a 2nd pending renewal for the same booking
      const { rows: ex } = await db.query(
        `SELECT id FROM worker_service_requests
         WHERE booking_id=$1 AND request_type='contract_extension' AND status='pending' LIMIT 1`, [id]
      );
      if (ex[0]) return res.status(409).json({ error: 'A renewal request is already pending', request_id: ex[0].id });

      const title = `Extend stay until ${req.body.new_end_date}`;
      const description = JSON.stringify({
        kind: 'renewal',
        original_booking_id: id,
        current_end_date: b.end_date,
        new_end_date: req.body.new_end_date,
        reason: req.body.reason || '',
      });

      const { rows: ins } = await db.query(
        `INSERT INTO worker_service_requests
           (worker_id, camp_id, booking_id, request_type, title, description, priority, status)
         VALUES ($1,$2,$3,'contract_extension',$4,$5,'medium','pending') RETURNING *`,
        [req.user.id, b.camp_id, id, title, description]
      );

      notify(b.owner_id, {
        type: 'renewal_request',
        title: `Renewal request — ${b.booking_code}`,
        body: `Extend ${b.room_name} until ${req.body.new_end_date}`,
        link: '/owner/requests',
      });
      auditLog(req, 'renewal_request', 'worker_service_requests', ins[0].id, {
        booking_id: id, new_end_date: req.body.new_end_date,
      });
      res.status(201).json({ request: ins[0] });
    } catch (e) { next(e); }
  }
);

// ─── C3 — APPROVE (owner) → creates a new booking ───
router.put(
  '/bookings/:id/renewal-request/approve',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      // Find the pending renewal for this booking
      const { rows: wsr } = await db.query(
        `SELECT wsr.*, c.owner_id, b.room_id, b.occupants, b.booking_type,
                b.worker_id, b.end_date AS current_end_date, r.price_per_day,
                r.available_beds
         FROM worker_service_requests wsr
         JOIN bookings b ON b.id = wsr.booking_id
         JOIN camps    c ON c.id = wsr.camp_id
         JOIN rooms    r ON r.id = b.room_id
         WHERE wsr.booking_id=$1 AND wsr.request_type='contract_extension'
           AND wsr.status='pending' LIMIT 1`, [id]
      );
      const ren = wsr[0];
      if (!ren) return res.status(404).json({ error: 'No pending renewal for this booking' });
      if (req.user.role !== 'admin' && ren.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }

      const meta = JSON.parse(ren.description);
      const newStart = ren.current_end_date;        // start where current booking ends
      const newEnd   = meta.new_end_date;

      // Bed availability check
      if (ren.available_beds < (ren.occupants || 1)) {
        return res.status(409).json({ error: 'Not enough beds available for the extension' });
      }

      // Price the new period using dynamic pricing
      const stay = await priceStay({
        roomId: ren.room_id,
        startDate: newStart,
        endDate: newEnd,
        pricePerDay: ren.price_per_day,
      });
      const totals = computeBooking(stay.base * (ren.occupants || 1));
      const newCode = code('BK');

      const { rows: newBk } = await db.query(
        `INSERT INTO bookings (booking_code, worker_id, room_id, camp_id, booking_type,
           start_date, end_date, occupants,
           base_amount, vat_amount, commission_amount, total_amount, net_to_owner,
           status, qr_code, agreement_signed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14,0) RETURNING *`,
        [
          newCode, ren.worker_id, ren.room_id, ren.camp_id, ren.booking_type || 'monthly',
          newStart, newEnd, ren.occupants || 1,
          totals.base, totals.vat, totals.commission, totals.total, totals.netToOwner,
          newCode,
        ]
      );
      // Reserve beds optimistically (will be released if not paid in 24h via cron)
      await db.query(
        `UPDATE rooms SET available_beds = MAX(0, available_beds - $1) WHERE id=$2`,
        [ren.occupants || 1, ren.room_id]
      );

      // Mark the renewal request resolved
      await db.query(
        `UPDATE worker_service_requests
         SET status='resolved', response_notes=$1, resolved_at=CURRENT_TIMESTAMP,
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [`Approved. New booking created: ${newCode}`, ren.id]
      );

      notify(ren.worker_id, {
        type: 'renewal_approved',
        title: '✅ Stay extension approved',
        body: `New booking ${newCode} — pay within 24h to confirm.`,
        link: `/worker/bookings/${newBk[0].id}`,
      });
      sendEmail({
        to: '',  // best-effort; the email service falls back to console
        subject: `Renewal approved — ${newCode}`,
        html: `<p>Your stay has been extended.</p><p>New booking: <b>${newCode}</b> · ${newStart} → ${newEnd} · total SAR ${totals.total}.</p>`,
      }).catch(() => {});

      auditLog(req, 'renewal_approved', 'worker_service_requests', ren.id, {
        new_booking_id: newBk[0].id,
      });
      res.json({ ok: true, new_booking: newBk[0], totals });
    } catch (e) { next(e); }
  }
);

// ─── C3 — REJECT ───
router.put(
  '/bookings/:id/renewal-request/reject',
  authRequired,
  requireRole('owner', 'admin'),
  [body('reason').optional().isString().isLength({ max: 1000 })],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: wsr } = await db.query(
        `SELECT wsr.*, c.owner_id FROM worker_service_requests wsr
         JOIN camps c ON c.id = wsr.camp_id
         WHERE wsr.booking_id=$1 AND wsr.request_type='contract_extension'
           AND wsr.status='pending' LIMIT 1`, [id]
      );
      const ren = wsr[0];
      if (!ren) return res.status(404).json({ error: 'No pending renewal for this booking' });
      if (req.user.role !== 'admin' && ren.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      await db.query(
        `UPDATE worker_service_requests SET status='rejected', response_notes=$1,
           resolved_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [req.body.reason || 'Rejected by owner', ren.id]
      );
      notify(ren.worker_id, {
        type: 'renewal_rejected',
        title: 'Stay extension rejected',
        body: req.body.reason || 'Owner did not approve the extension.',
        link: `/worker/bookings/${id}`,
      });
      auditLog(req, 'renewal_rejected', 'worker_service_requests', ren.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ════════════════════════════════════════════════════════════════════
// H10 — NOTIFICATION PREFERENCES
// ════════════════════════════════════════════════════════════════════

// Helper: return defaults for any (category, channel) combo not yet stored
function defaultsFor() {
  const out = [];
  for (const c of NOTIF_CATEGORIES) {
    for (const ch of NOTIF_CHANNELS) {
      out.push({
        category: c,
        channel: ch,
        // sensible defaults: in_app + email on for everything;
        // sms + whatsapp on only for booking & reminder; promotion off by default everywhere
        is_enabled:
          c === 'promotion' ? (ch === 'email') :
          ch === 'in_app' || ch === 'email' ? true :
          (c === 'booking' || c === 'reminder'),
      });
    }
  }
  return out;
}

router.get('/notifications/preferences', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT category, channel, is_enabled FROM notification_preferences WHERE user_id=$1`,
      [req.user.id]
    );
    const stored = new Map();
    for (const r of rows) stored.set(`${r.category}:${r.channel}`, !!r.is_enabled);

    // Merge with defaults
    const prefs = defaultsFor().map((d) => {
      const key = `${d.category}:${d.channel}`;
      return stored.has(key) ? { ...d, is_enabled: stored.get(key) } : d;
    });
    res.json({
      preferences: prefs,
      categories: NOTIF_CATEGORIES,
      channels: NOTIF_CHANNELS,
    });
  } catch (e) { next(e); }
});

router.put('/notifications/preferences',
  authRequired,
  [body('preferences').isArray()],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const valid = (req.body.preferences || []).filter((p) =>
        NOTIF_CATEGORIES.includes(p.category) && NOTIF_CHANNELS.includes(p.channel)
      );

      // Upsert one row per (user, category, channel)
      for (const p of valid) {
        const { rows: ex } = await db.query(
          `SELECT id FROM notification_preferences WHERE user_id=$1 AND category=$2 AND channel=$3`,
          [req.user.id, p.category, p.channel]
        );
        if (ex[0]) {
          await db.query(
            `UPDATE notification_preferences SET is_enabled=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
            [p.is_enabled ? 1 : 0, ex[0].id]
          );
        } else {
          await db.query(
            `INSERT INTO notification_preferences (user_id, category, channel, is_enabled)
             VALUES ($1,$2,$3,$4)`,
            [req.user.id, p.category, p.channel, p.is_enabled ? 1 : 0]
          );
        }
      }
      auditLog(req, 'update_notification_prefs', 'user', req.user.id, { count: valid.length });
      res.json({ ok: true, updated: valid.length });
    } catch (e) { next(e); }
  }
);

// Helper for other modules: check if a user has enabled a (category, channel)
async function isChannelEnabled(userId, category, channel) {
  try {
    const { rows } = await db.query(
      `SELECT is_enabled FROM notification_preferences WHERE user_id=$1 AND category=$2 AND channel=$3 LIMIT 1`,
      [userId, category, channel]
    );
    if (!rows[0]) {
      // fall back to defaults
      const d = defaultsFor().find((x) => x.category === category && x.channel === channel);
      return d ? d.is_enabled : true;
    }
    return !!rows[0].is_enabled;
  } catch (e) { return true; }
}

module.exports = router;
module.exports.isChannelEnabled = isChannelEnabled;
module.exports.NOTIF_CATEGORIES = NOTIF_CATEGORIES;
module.exports.NOTIF_CHANNELS = NOTIF_CHANNELS;
