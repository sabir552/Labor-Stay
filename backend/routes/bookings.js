/**
 * Bookings routes
 *   POST   /api/bookings                    — worker creates a booking
 *   GET    /api/bookings/my-bookings        — worker's bookings (or owner's incoming)
 *   GET    /api/bookings/:id                — booking detail
 *   PUT    /api/bookings/:id/status         — owner approve/reject
 *   PUT    /api/bookings/:id/checkin        — owner check-in (QR scan)
 *   PUT    /api/bookings/:id/checkout       — owner check-out
 *   PUT    /api/bookings/:id/cancel         — worker cancels
 *   GET    /api/bookings/:id/receipt        — PDF receipt
 *   GET    /api/bookings/:id/contract       — PDF contract
 *   GET    /api/bookings/:id/qr-code        — QR data URL
 *
 * Auto-cancellation: if a pending booking is not paid within 24h, it is
 * marked 'cancelled' by a lightweight periodic job (runs on boot + every 30 min).
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { sendEmail, templates, notify } = require('../utils/emailService');
const { priceStay } = require('../utils/dynamicPricing');
const { computeBooking } = require('../utils/vatCalculator');
const { generateQR } = require('../utils/qrGenerator');
const { streamBookingReceipt, streamBookingContract } = require('../utils/pdfGenerator');
const { BOOKING_STATUS } = require('../config/constants');

const router = express.Router();

const code = (prefix) => `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;

// ============ CREATE BOOKING ============
router.post(
  '/',
  authRequired,
  requireRole('worker', 'admin'),
  [
    body('room_id').isInt({ min: 1 }),
    body('start_date').isString().notEmpty(),
    body('end_date').isString().notEmpty(),
    body('booking_type').optional().isIn(['daily', 'weekly', 'monthly', 'contract']),
    body('occupants').optional().isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { room_id, start_date, end_date, booking_type = 'monthly', occupants = 1 } = req.body;
      if (new Date(end_date) <= new Date(start_date)) {
        return res.status(400).json({ error: 'end_date must be after start_date' });
      }

      // Load room + camp
      const { rows: rRows } = await db.query('SELECT * FROM rooms WHERE id = $1', [room_id]);
      const room = rRows[0];
      if (!room) return res.status(404).json({ error: 'Room not found' });
      if (!room.is_active) return res.status(400).json({ error: 'Room not available for booking' });

      // Availability check
      if (room.available_beds < occupants) {
        // Auto-add to waiting list
        await db.query(
          `INSERT INTO waiting_list (worker_id, room_id, requested_date, status)
           VALUES ($1,$2,$3,'active')`,
          [req.user.id, room_id, start_date]
        );
        notify(req.user.id, {
          type: 'waiting_list',
          title: 'Added to waiting list',
          body: `No beds currently available in ${room.name}. We'll notify you when a bed opens.`,
          link: '/worker/waiting-list',
        });
        return res.status(202).json({
          status: 'waiting_list',
          message: 'No beds available — you have been added to the waiting list.',
        });
      }

      // Price the stay
      const stay = await priceStay({
        roomId: room_id, startDate: start_date, endDate: end_date, pricePerDay: room.price_per_day,
      });
      const totals = computeBooking(stay.base * occupants);

      const bookingCode = code('BK');
      const { rows: ins } = await db.query(
        `INSERT INTO bookings (booking_code, worker_id, room_id, camp_id, booking_type,
                               start_date, end_date, occupants,
                               base_amount, vat_amount, commission_amount, total_amount, net_to_owner,
                               status, qr_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',$14) RETURNING *`,
        [
          bookingCode, req.user.id, room_id, room.camp_id, booking_type,
          start_date, end_date, occupants,
          totals.base, totals.vat, totals.commission, totals.total, totals.netToOwner,
          bookingCode,
        ]
      );
      const booking = ins[0];

      // Reserve beds optimistically (will be released on cancel/reject)
      await db.query(
        `UPDATE rooms SET available_beds = MAX(0, available_beds - $1) WHERE id = $2`,
        [occupants, room_id]
      );

      // Notify owner
      const { rows: camp } = await db.query('SELECT owner_id, name FROM camps WHERE id = $1', [room.camp_id]);
      if (camp[0]) {
        notify(camp[0].owner_id, {
          type: 'booking_request',
          title: `New booking request — ${bookingCode}`,
          body: `${req.user.full_name} requested ${room.name} (${start_date} → ${end_date}).`,
          link: `/owner/bookings/${booking.id}`,
        });
        const { rows: ownerRow } = await db.query('SELECT email FROM users WHERE id = $1', [camp[0].owner_id]);
        if (ownerRow[0]) {
          sendEmail({
            to: ownerRow[0].email,
            subject: `New booking request — ${bookingCode}`,
            html: `<p>A new booking request has been received for <b>${camp[0].name}</b>.</p>
                   <p>Please review it in your dashboard.</p>`,
          }).catch(() => {});
        }
      }

      auditLog(req, 'create_booking', 'booking', booking.id);
      res.status(201).json({ booking, totals, breakdown: stay.breakdown });
    } catch (e) { next(e); }
  }
);

// ============ WORKER BOOKINGS ============
// Worker's own bookings. Admins also allowed (see all bookings via /api/admin/bookings).
router.get('/my-bookings', authRequired, async (req, res, next) => {
  try {
    // Role-aware behaviour preserved for back-compat:
    //   worker   → own bookings
    //   owner    → 308 redirect hint to /owner-bookings (kept working for safety)
    //   admin    → all bookings (capped)
    if (req.user.role === 'owner') {
      return res.redirect(308, '/api/bookings/owner-bookings');
    }
    let sql, params;
    if (req.user.role === 'admin') {
      sql = `SELECT b.*, r.name AS room_name, c.name AS camp_name, c.city,
                    u.full_name AS worker_name
             FROM bookings b
             JOIN rooms r ON r.id = b.room_id
             JOIN camps c ON c.id = b.camp_id
             JOIN users u ON u.id = b.worker_id
             ORDER BY b.created_at DESC LIMIT 500`;
      params = [];
    } else {
      sql = `SELECT b.*, r.name AS room_name, c.name AS camp_name, c.city
             FROM bookings b
             JOIN rooms r ON r.id = b.room_id
             JOIN camps c ON c.id = b.camp_id
             WHERE b.worker_id = $1 ORDER BY b.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ============ OWNER BOOKINGS ============
// Dedicated endpoint: bookings made AT camps owned by this user.
router.get('/owner-bookings', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    // Admin may pass ?owner_id= to inspect a specific owner's incoming bookings.
    const ownerId = req.user.role === 'admin' && req.query.owner_id
      ? parseInt(req.query.owner_id, 10) : req.user.id;
    const { rows } = await db.query(
      `SELECT b.*, r.name AS room_name, c.name AS camp_name, c.city,
              u.full_name AS worker_name, u.email AS worker_email, u.phone AS worker_phone
       FROM bookings b
       JOIN rooms r ON r.id = b.room_id
       JOIN camps c ON c.id = b.camp_id
       JOIN users u ON u.id = b.worker_id
       WHERE c.owner_id = $1
       ORDER BY b.created_at DESC`,
      [ownerId]
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ============ DETAIL ============
async function fetchBookingFull(id) {
  const { rows } = await db.query(
    `SELECT b.*, r.name AS room_name, r.room_type, r.price_per_day,
            c.name AS camp_name, c.city, c.address, c.owner_id,
            u.full_name AS worker_name, u.email AS worker_email, u.phone AS worker_phone
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     JOIN camps c ON c.id = b.camp_id
     JOIN users u ON u.id = b.worker_id
     WHERE b.id = $1`, [id]
  );
  return rows[0] || null;
}

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to view this booking' });
    }
    // Payments for this booking
    const { rows: payments } = await db.query(
      'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC',
      [id]
    );
    res.json({ booking: b, payments });
  } catch (e) { next(e); }
});

// ============ STATUS (owner approves / rejects) ============
router.put(
  '/:id/status',
  authRequired,
  requireRole('owner', 'admin'),
  [body('status').isIn(['confirmed', 'rejected'])],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { status, rejection_reason } = req.body;
      const b = await fetchBookingFull(id);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && b.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your booking' });
      }
      if (b.status !== 'pending') {
        return res.status(400).json({ error: `Cannot change status from ${b.status}` });
      }

      await db.query(
        `UPDATE bookings SET status = $1, rejection_reason = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
        [status, rejection_reason || null, id]
      );

      if (status === 'rejected') {
        // release beds
        await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id = $2', [b.occupants, b.room_id]);
        const tpl = templates.bookingRejected(b, rejection_reason);
        sendEmail({ to: b.worker_email, ...tpl }).catch(() => {});
        notify(b.worker_id, { type: 'booking_rejected', title: tpl.subject, body: rejection_reason || '', link: `/worker/bookings/${id}` });
      } else {
        const tpl = templates.bookingConfirmed(b);
        sendEmail({ to: b.worker_email, ...tpl }).catch(() => {});
        notify(b.worker_id, { type: 'booking_confirmed', title: tpl.subject, body: `Total ${b.total_amount} SAR`, link: `/worker/bookings/${id}` });
      }
      auditLog(req, `booking_${status}`, 'booking', id);
      res.json({ ok: true, status });
    } catch (e) { next(e); }
  }
);

// ============ CHECK-IN ============
router.put('/:id/checkin', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your booking' });
    }
    if (b.status !== 'confirmed') {
      return res.status(400).json({ error: `Cannot check-in from status ${b.status}` });
    }
    await db.query(
      `UPDATE bookings SET status = 'checked_in', checked_in_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    notify(b.worker_id, { type: 'check_in', title: 'Checked in', body: `Welcome to ${b.camp_name}.`, link: `/worker/bookings/${id}` });
    auditLog(req, 'check_in', 'booking', id);
    res.json({ ok: true, status: 'checked_in' });
  } catch (e) { next(e); }
});

// ============ CHECK-OUT ============
router.put('/:id/checkout', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your booking' });
    }
    if (b.status !== 'checked_in') {
      return res.status(400).json({ error: `Cannot check-out from status ${b.status}` });
    }
    await db.query(
      `UPDATE bookings SET status = 'checked_out', checked_out_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [id]
    );
    // release beds
    await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id = $2', [b.occupants, b.room_id]);

    // Notify any waiting-list workers
    const { rows: wl } = await db.query(
      `SELECT * FROM waiting_list WHERE room_id = $1 AND status = 'active' ORDER BY created_at ASC LIMIT 5`,
      [b.room_id]
    );
    for (const w of wl) {
      notify(w.worker_id, {
        type: 'bed_available',
        title: 'A bed is available!',
        body: `A bed has opened up in ${b.room_name}. Book it now before it's gone.`,
        link: `/camps/${b.camp_id}`,
      });
      await db.query(`UPDATE waiting_list SET notified_at = CURRENT_TIMESTAMP WHERE id = $1`, [w.id]);
    }
    notify(b.worker_id, { type: 'check_out', title: 'Checked out', body: `Thanks for staying at ${b.camp_name}.`, link: `/worker/bookings/${id}` });
    auditLog(req, 'check_out', 'booking', id);
    res.json({ ok: true, status: 'checked_out' });
  } catch (e) { next(e); }
});

// ============ CANCEL ============
router.put('/:id/cancel', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!['pending', 'confirmed'].includes(b.status)) {
      return res.status(400).json({ error: `Cannot cancel from status ${b.status}` });
    }
    await db.query(
      `UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]
    );
    await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id = $2', [b.occupants, b.room_id]);
    notify(b.worker_id, { type: 'booking_cancelled', title: `Booking ${b.booking_code} cancelled`, body: '', link: `/worker/bookings/${id}` });
    auditLog(req, 'cancel_booking', 'booking', id);
    res.json({ ok: true, status: 'cancelled' });
  } catch (e) { next(e); }
});

// ============ QR CODE ============
router.get('/:id/qr-code', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const payload = JSON.stringify({ code: b.booking_code, id: b.id, worker: b.worker_id, room: b.room_id });
    const dataUrl = await generateQR(payload);
    res.json({ qr: dataUrl, code: b.booking_code });
  } catch (e) { next(e); }
});

// ============ RECEIPT PDF ============
router.get('/:id/receipt', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { rows: room } = await db.query('SELECT * FROM rooms WHERE id = $1', [b.room_id]);
    const { rows: camp } = await db.query('SELECT * FROM camps WHERE id = $1', [b.camp_id]);
    const { rows: worker } = await db.query('SELECT full_name, email, phone FROM users WHERE id = $1', [b.worker_id]);
    const { rows: owner } = await db.query(
      `SELECT u.full_name, op.company_name, op.cr_number, op.vat_number
       FROM users u LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [b.owner_id]
    );
    const { rows: payment } = await db.query(
      `SELECT * FROM payments WHERE booking_id = $1 AND status = 'paid' ORDER BY paid_at DESC LIMIT 1`, [id]
    );
    await streamBookingReceipt(res, {
      booking: b, camp: camp[0], room: room[0], worker: worker[0], owner: owner[0], payment: payment[0] || null,
    });
  } catch (e) { next(e); }
});

// ============ CONTRACT PDF ============
router.get('/:id/contract', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { rows: room } = await db.query('SELECT * FROM rooms WHERE id = $1', [b.room_id]);
    const { rows: camp } = await db.query('SELECT * FROM camps WHERE id = $1', [b.camp_id]);
    const { rows: worker } = await db.query('SELECT full_name, email, phone FROM users WHERE id = $1', [b.worker_id]);
    const { rows: owner } = await db.query(
      `SELECT u.full_name, op.company_name, op.cr_number FROM users u
       LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [b.owner_id]
    );
    await streamBookingContract(res, {
      booking: b, camp: camp[0], room: room[0], worker: worker[0], owner: owner[0],
    });
  } catch (e) { next(e); }
});

// ============ AUTO-CANCEL JOB ============
async function autoCancelStalePending() {
  try {
    // Postgres syntax: NOW() - interval; SQLite: datetime('now','-1 day')
    const driver = db.driver;
    let sql;
    if (driver === 'postgres') {
      sql = `SELECT b.*, r.id AS rid FROM bookings b
             JOIN rooms r ON r.id = b.room_id
             WHERE b.status = 'pending'
               AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'paid')
               AND b.created_at < NOW() - INTERVAL '24 hours'`;
    } else {
      sql = `SELECT b.*, r.id AS rid FROM bookings b
             JOIN rooms r ON r.id = b.room_id
             WHERE b.status = 'pending'
               AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'paid')
               AND b.created_at < datetime('now','-1 day')`;
    }
    const { rows } = await db.query(sql, []);
    for (const b of rows) {
      await db.query(
        `UPDATE bookings SET status = 'cancelled', rejection_reason = 'auto-cancelled: payment not received within 24h', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [b.id]
      );
      await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id = $2', [b.occupants || 1, b.room_id]);
    }
    if (rows.length) console.log(`[auto-cancel] released ${rows.length} stale pending bookings`);
  } catch (err) {
    console.warn('[auto-cancel] failed:', err.message);
  }
}

// Run shortly after boot, then every 30 minutes
setTimeout(() => autoCancelStalePending(), 5000);
setInterval(autoCancelStalePending, 30 * 60 * 1000);

module.exports = router;
module.exports.fetchBookingFull = fetchBookingFull;
