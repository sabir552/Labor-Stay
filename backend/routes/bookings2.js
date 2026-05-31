/**
 * Bookings v2 (Piece 14) — additive endpoints for the existing booking flow.
 *
 *   PUT /api/bookings/:id/sign-agreement   — A1: digitally sign rental agreement
 *   GET /api/bookings/:id/agreement        — download signed agreement PDF
 *   POST /api/waiting-list/notify/:roomId  — A3: internal trigger to notify waitlist
 *
 * Mounted at /api in server.js so the paths resolve as-is.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify, sendEmail } = require('../utils/emailService');
const { generateSignedAgreement, AGREEMENT_DIR } = require('../utils/agreementGenerator');

const router = express.Router();

// ─── helpers ───────────────────────────────────────────────────────
async function fetchBookingFull(id) {
  const { rows } = await db.query(
    `SELECT b.*, r.name AS room_name, r.room_type, r.price_per_day,
            c.name AS camp_name, c.city, c.address, c.rules, c.camp_type, c.owner_id,
            u.full_name AS worker_name, u.email AS worker_email, u.phone AS worker_phone
     FROM bookings b
     JOIN rooms r ON r.id = b.room_id
     JOIN camps c ON c.id = b.camp_id
     JOIN users u ON u.id = b.worker_id
     WHERE b.id = $1`, [id]
  );
  return rows[0] || null;
}

async function fetchOwner(ownerId) {
  const { rows } = await db.query(
    `SELECT u.full_name, op.company_name, op.cr_number, op.vat_number
     FROM users u LEFT JOIN owner_profiles op ON op.user_id=u.id
     WHERE u.id=$1`, [ownerId]
  );
  return rows[0] || null;
}

// ─── A1: Sign agreement ────────────────────────────────────────────
router.put(
  '/bookings/:id/sign-agreement',
  authRequired,
  [
    body('typed_name').isString().isLength({ min: 3, max: 200 }),
    body('accept').custom((v) => v === true || v === 'true').withMessage('You must accept the agreement.'),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const b = await fetchBookingFull(id);
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && b.worker_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your booking' });
      }
      if (b.status === 'cancelled' || b.status === 'rejected') {
        return res.status(400).json({ error: `Cannot sign a ${b.status} booking` });
      }
      if (b.agreement_signed) {
        return res.json({ ok: true, message: 'Already signed', agreement_url: b.agreement_url });
      }

      // Sanity check: typed name should roughly match the worker's name
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm(req.body.typed_name) !== norm(b.worker_name)
          && !norm(b.worker_name).includes(norm(req.body.typed_name).split(' ')[0])
          && req.user.role !== 'admin') {
        return res.status(400).json({
          error: 'Typed name does not match account name.',
          expected: b.worker_name,
        });
      }

      const { rows: room } = await db.query('SELECT * FROM rooms WHERE id=$1', [b.room_id]);
      const { rows: camp } = await db.query('SELECT * FROM camps WHERE id=$1', [b.camp_id]);
      const { rows: worker } = await db.query('SELECT full_name, email, phone FROM users WHERE id=$1', [b.worker_id]);
      const owner = await fetchOwner(b.owner_id);

      const signature = {
        typed_name: req.body.typed_name,
        signed_at: new Date().toISOString(),
        ip: (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim(),
        user_agent: req.headers['user-agent'] || '',
      };

      const { url: agreementUrl } = await generateSignedAgreement({
        booking: b, camp: camp[0], room: room[0], worker: worker[0], owner, signature,
      });

      const signedAt = signature.signed_at;
      await db.query(
        `UPDATE bookings SET agreement_signed=1, agreement_url=$1, agreement_signed_at=$2,
           updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
        [agreementUrl, signedAt, id]
      );

      notify(b.worker_id, {
        type: 'agreement_signed',
        title: 'Rental agreement signed ✍️',
        body: `Your agreement for ${b.camp_name} is signed and saved.`,
        link: `/worker/bookings/${id}`,
      });
      notify(b.owner_id, {
        type: 'agreement_signed_by_worker',
        title: `Worker signed agreement — ${b.booking_code}`,
        body: `${b.worker_name} signed the rental agreement.`,
        link: `/owner/bookings/${id}`,
      });
      sendEmail({
        to: b.worker_email,
        subject: `Agreement signed — ${b.booking_code}`,
        html: `<p>Hi ${b.worker_name},</p>
               <p>Your rental agreement for <b>${b.camp_name}</b> has been signed.</p>
               <p>You can now proceed to payment in your dashboard.</p>`,
      }).catch(() => {});

      auditLog(req, 'sign_agreement', 'booking', id, { typed_name: req.body.typed_name });
      res.json({ ok: true, agreement_url: agreementUrl, signed_at: signedAt });
    } catch (e) { next(e); }
  }
);

// ─── A1: Download signed agreement PDF ─────────────────────────────
router.get('/bookings/:id/agreement', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const b = await fetchBookingFull(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && b.worker_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (!b.agreement_signed || !b.agreement_url) {
      return res.status(404).json({ error: 'No signed agreement on file' });
    }
    const filename = path.basename(b.agreement_url);
    const filePath = path.join(AGREEMENT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Agreement file missing on disk' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});

// ─── A3: Waiting list auto-notification (internal trigger) ─────────
router.post('/waiting-list/notify/:roomId',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const roomId = parseInt(req.params.roomId, 10);
      const { rows: room } = await db.query(
        `SELECT r.*, c.name AS camp_name, c.owner_id, c.id AS camp_id
         FROM rooms r JOIN camps c ON c.id=r.camp_id WHERE r.id=$1`, [roomId]
      );
      if (!room[0]) return res.status(404).json({ error: 'Room not found' });
      if (req.user.role !== 'admin' && room[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your room' });
      }

      const { rows: wl } = await db.query(
        `SELECT wl.*, u.full_name, u.email, u.phone
         FROM waiting_list wl JOIN users u ON u.id=wl.worker_id
         WHERE wl.room_id=$1 AND wl.status='active'
         ORDER BY wl.created_at ASC`,
        [roomId]
      );

      let notified = 0;
      for (const entry of wl) {
        notify(entry.worker_id, {
          type: 'bed_available',
          title: '🎉 A bed just opened up!',
          body: `${room[0].room_name || room[0].name} in ${room[0].camp_name} is available. Book within 2 hours.`,
          link: `/camps/${room[0].camp_id}`,
        });
        sendEmail({
          to: entry.email,
          subject: 'A bed is available at ' + room[0].camp_name,
          html: `<p>Hi ${entry.full_name},</p>
                 <p>A bed in <b>${room[0].name}</b> at <b>${room[0].camp_name}</b> just became available.</p>
                 <p>You were on the waiting list — first to book wins. Book within 2 hours: <a href="${process.env.FRONTEND_URL || ''}/camps/${room[0].camp_id}">click here</a>.</p>`,
        }).catch(() => {});
        // WhatsApp placeholder — wired up in Piece 21
        await db.query(`UPDATE waiting_list SET notified_at=CURRENT_TIMESTAMP WHERE id=$1`, [entry.id]);
        notified++;
      }
      auditLog(req, 'notify_waiting_list', 'room', roomId, { notified });
      res.json({ ok: true, notified, total_on_list: wl.length });
    } catch (e) { next(e); }
  }
);

// ─── A3 helper: worker can see their position on a room's waiting list ───
router.get('/waiting-list/position/:roomId', authRequired, async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const { rows } = await db.query(
      `SELECT id, worker_id FROM waiting_list WHERE room_id=$1 AND status='active'
       ORDER BY created_at ASC`, [roomId]
    );
    const idx = rows.findIndex((r) => r.worker_id === req.user.id);
    if (idx < 0) return res.json({ on_list: false, position: null, total: rows.length });
    res.json({
      on_list: true,
      position: idx + 1,
      total: rows.length,
      // Rough estimate: 1 week per person ahead (display only)
      estimated_wait_days: idx * 7,
    });
  } catch (e) { next(e); }
});

module.exports = router;
