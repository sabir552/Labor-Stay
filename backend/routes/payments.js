/**
 * Payments routes — Tap Payments integration stub.
 * The actual Tap SDK is not used here (placeholder keys); instead we
 * simulate the gateway with /api/payments/initiate returning a fake
 * checkout URL, and /api/payments/callback finalizing the payment.
 *
 *   POST /api/payments/initiate          — start a payment for a booking
 *   POST /api/payments/callback          — gateway webhook (idempotent)
 *   POST /api/payments/:id/mark-paid     — dev-only: instantly mark paid (works in non-prod)
 *   GET  /api/payments/my-payments       — payment history
 *   POST /api/payments/:id/refund        — admin refund
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { sendEmail, templates, notify } = require('../utils/emailService');

const router = express.Router();
const TAP_PUBLIC = process.env.TAP_PUBLIC_KEY || 'pk_test_PLACEHOLDER';

function invoiceNumber() {
  // INV-YYYY-#########
  const y = new Date().getFullYear();
  const seq = uuidv4().replace(/-/g, '').slice(0, 9).toUpperCase();
  return `INV-${y}-${seq}`;
}

// ============ INITIATE ============
router.post(
  '/initiate',
  authRequired,
  [
    body('booking_id').isInt({ min: 1 }),
    body('method').optional().isIn(['mada', 'visa', 'mastercard', 'stcpay', 'bank_transfer', 'sadad']),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { booking_id, method = 'mada' } = req.body;

      const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [booking_id]);
      const b = rows[0];
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && b.worker_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your booking' });
      }
      if (b.status === 'cancelled' || b.status === 'rejected') {
        return res.status(400).json({ error: 'Cannot pay a cancelled or rejected booking' });
      }
      // A1: agreement-signing gate — block payment until agreement is signed.
      // Existing bookings created before Piece 14 that have agreement_signed=NULL
      // are treated as legacy and allowed through.
      if (b.agreement_signed === 0) {
        return res.status(412).json({
          error: 'Please sign the rental agreement before paying.',
          code: 'AGREEMENT_NOT_SIGNED',
        });
      }
      // Already paid?
      const { rows: paid } = await db.query(
        `SELECT id FROM payments WHERE booking_id = $1 AND status = 'paid' LIMIT 1`, [booking_id]
      );
      if (paid[0]) return res.status(400).json({ error: 'This booking is already paid' });

      const invNo = invoiceNumber();
      const gatewayRef = 'TAP_' + uuidv4().replace(/-/g, '').slice(0, 16).toUpperCase();
      const { rows: ins } = await db.query(
        `INSERT INTO payments (booking_id, user_id, amount, method, gateway_ref, status, invoice_number)
         VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING *`,
        [booking_id, req.user.id, b.total_amount, method, gatewayRef, invNo]
      );

      // In production this URL would come from Tap Payments
      const checkoutUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/checkout/simulate?ref=${gatewayRef}&pid=${ins[0].id}`;
      auditLog(req, 'initiate_payment', 'payment', ins[0].id, { method, amount: b.total_amount });
      res.status(201).json({
        payment: ins[0],
        checkout_url: checkoutUrl,
        tap_public_key: TAP_PUBLIC,
        message: 'Redirect the user to checkout_url to complete payment.',
      });
    } catch (e) { next(e); }
  }
);

// ============ CALLBACK (webhook) ============
router.post('/callback', async (req, res, next) => {
  try {
    const { gateway_ref, status = 'paid' } = req.body;
    if (!gateway_ref) return res.status(400).json({ error: 'gateway_ref required' });
    const { rows } = await db.query('SELECT * FROM payments WHERE gateway_ref = $1', [gateway_ref]);
    const p = rows[0];
    if (!p) return res.status(404).json({ error: 'Payment not found' });
    if (p.status === 'paid' && status === 'paid') {
      return res.json({ ok: true, idempotent: true });
    }

    await db.query(
      status === 'paid'
        ? `UPDATE payments SET status = $1, paid_at = CURRENT_TIMESTAMP WHERE id = $2`
        : `UPDATE payments SET status = $1 WHERE id = $2`,
      [status, p.id]
    );

    if (status === 'paid') {
      // Auto-confirm booking when paid
      const { rows: bk } = await db.query('SELECT * FROM bookings WHERE id = $1', [p.booking_id]);
      const b = bk[0];
      if (b && b.status === 'pending') {
        await db.query(`UPDATE bookings SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [b.id]);
        notify(b.worker_id, {
          type: 'payment_received',
          title: `Payment received — ${p.invoice_number}`,
          body: `SAR ${p.amount} received. Your booking is confirmed.`,
          link: `/worker/bookings/${b.id}`,
        });
        const { rows: w } = await db.query('SELECT email FROM users WHERE id = $1', [b.worker_id]);
        if (w[0]) {
          const tpl = templates.paymentReceived(p);
          sendEmail({ to: w[0].email, ...tpl }).catch(() => {});
        }
      }
    }
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

// ============ MARK PAID (dev helper) ============
// Use only in development to simulate a successful Tap callback.
router.post('/:id/mark-paid', authRequired, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Disabled in production' });
    }
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM payments WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment not found' });
    req.body.gateway_ref = rows[0].gateway_ref;
    req.body.status = 'paid';
    // Re-use callback logic
    return router.handle({ ...req, url: '/callback', method: 'POST' }, res, next);
  } catch (e) { next(e); }
});

// ============ MY PAYMENTS ============
router.get('/my-payments', authRequired, async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'admin') {
      sql = `SELECT p.*, b.booking_code, u.full_name AS payer_name
             FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id
             LEFT JOIN users u ON u.id = p.user_id
             ORDER BY p.created_at DESC LIMIT 500`;
      params = [];
    } else if (req.user.role === 'owner') {
      // Payments on bookings of camps owned by this owner
      sql = `SELECT p.*, b.booking_code, b.camp_id, c.name AS camp_name, u.full_name AS payer_name
             FROM payments p
             JOIN bookings b ON b.id = p.booking_id
             JOIN camps c ON c.id = b.camp_id
             JOIN users u ON u.id = p.user_id
             WHERE c.owner_id = $1 ORDER BY p.created_at DESC`;
      params = [req.user.id];
    } else {
      sql = `SELECT p.*, b.booking_code FROM payments p
             LEFT JOIN bookings b ON b.id = p.booking_id
             WHERE p.user_id = $1 ORDER BY p.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ payments: rows });
  } catch (e) { next(e); }
});

// ============ REFUND (admin) ============
router.post('/:id/refund', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM payments WHERE id = $1', [id]);
    const p = rows[0];
    if (!p) return res.status(404).json({ error: 'Payment not found' });
    if (p.status !== 'paid') return res.status(400).json({ error: 'Only paid payments can be refunded' });

    await db.query(`UPDATE payments SET status = 'refunded' WHERE id = $1`, [id]);
    // Cancel underlying booking & release beds
    if (p.booking_id) {
      const { rows: bk } = await db.query('SELECT * FROM bookings WHERE id = $1', [p.booking_id]);
      if (bk[0]) {
        await db.query(`UPDATE bookings SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [p.booking_id]);
        await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id = $2', [bk[0].occupants || 1, bk[0].room_id]);
        notify(bk[0].worker_id, {
          type: 'refund',
          title: `Refund processed — ${p.invoice_number}`,
          body: `SAR ${p.amount} has been refunded.`,
          link: `/worker/bookings/${p.booking_id}`,
        });
      }
    }
    auditLog(req, 'refund_payment', 'payment', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
