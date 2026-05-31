/**
 * Disputes (H8).
 *
 * Builds on existing `disputes` table (v1 schema):
 *   POST /                      — worker raises dispute
 *   GET  /mine                  — worker's disputes
 *   GET  /                      — admin sees all
 *   PUT  /:id/respond           — owner responds
 *   PUT  /:id/resolve           — admin resolves with optional refund
 *   PUT  /:id/escalate          — escalate (mark as urgent for admin attention)
 *   POST /:id/evidence          — add evidence URLs
 *
 * v1 already has /api/admin/disputes (admin list). This module is the
 * worker-facing + owner-response layer.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const CATEGORIES = ['overcharging', 'false_listing', 'poor_conditions', 'no_show',
                    'safety_issue', 'harassment', 'other'];

// ─── CREATE (worker) ───
router.post('/',
  authRequired,
  [
    body('booking_id').isInt({ min: 1 }),
    body('subject').isString().isLength({ min: 5, max: 200 }),
    body('description').isString().isLength({ min: 10, max: 4000 }),
    body('category').optional().isIn(CATEGORIES),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;
      const { rows: bk } = await db.query(
        `SELECT b.*, c.owner_id FROM bookings b
         JOIN camps c ON c.id = b.camp_id WHERE b.id=$1`, [b.booking_id]
      );
      if (!bk[0]) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && bk[0].worker_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your booking' });
      }

      const { rows } = await db.query(
        `INSERT INTO disputes (booking_id, raised_by, subject, description, status)
         VALUES ($1,$2,$3,$4,'open') RETURNING *`,
        [b.booking_id, req.user.id, b.subject, b.description]
      );
      notify(bk[0].owner_id, {
        type: 'dispute_raised', title: `⚠️ Dispute raised — ${bk[0].booking_code}`,
        body: b.subject, link: '/owner/disputes',
      });
      auditLog(req, 'raise_dispute', 'disputes', rows[0].id, { booking_id: b.booking_id, category: b.category });
      res.status(201).json({ dispute: rows[0] });
    } catch (e) { next(e); }
  }
);

// ─── MINE ───
router.get('/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, b.booking_code, c.name AS camp_name
       FROM disputes d
       LEFT JOIN bookings b ON b.id = d.booking_id
       LEFT JOIN camps c ON c.id = b.camp_id
       WHERE d.raised_by=$1 ORDER BY d.created_at DESC LIMIT 100`, [req.user.id]
    );
    res.json({ disputes: rows });
  } catch (e) { next(e); }
});

// ─── OWNER: for my camps ───
router.get('/owner', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, b.booking_code, c.name AS camp_name, u.full_name AS raised_by_name
       FROM disputes d
       JOIN bookings b ON b.id = d.booking_id
       JOIN camps c ON c.id = b.camp_id
       LEFT JOIN users u ON u.id = d.raised_by
       WHERE c.owner_id=$1 ORDER BY d.created_at DESC LIMIT 200`, [req.user.id]
    );
    res.json({ disputes: rows });
  } catch (e) { next(e); }
});

// ─── OWNER RESPONDS ───
router.put('/:id/respond',
  authRequired, requireRole('owner', 'admin'),
  [body('response').isString().isLength({ min: 5, max: 4000 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT d.*, c.owner_id FROM disputes d
         JOIN bookings b ON b.id = d.booking_id
         JOIN camps c ON c.id = b.camp_id WHERE d.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Dispute not found' });
      if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      await db.query(
        `UPDATE disputes SET resolution=$1, status='open' WHERE id=$2`,
        [`OWNER REPLY: ${req.body.response}`, id]
      );
      notify(rows[0].raised_by, {
        type: 'dispute_response', title: 'Owner responded to your dispute',
        body: req.body.response.slice(0, 100), link: '/worker/disputes',
      });
      auditLog(req, 'dispute_owner_respond', 'disputes', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── ADMIN RESOLVES ───
router.put('/:id/resolve',
  authRequired, requireRole('admin'),
  [
    body('decision').isString().isLength({ min: 5, max: 4000 }),
    body('refund_amount').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query('SELECT * FROM disputes WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Dispute not found' });

      await db.query(
        `UPDATE disputes SET resolution=$1, status='resolved' WHERE id=$2`,
        [req.body.decision, id]
      );

      // Auto-refund if specified
      let refundResult = null;
      if (parseFloat(req.body.refund_amount || 0) > 0) {
        try {
          const { rows: payments } = await db.query(
            `SELECT id FROM payments WHERE booking_id=$1 AND status='paid' LIMIT 1`,
            [rows[0].booking_id]
          );
          if (payments[0]) {
            await db.query(`UPDATE payments SET status='refunded' WHERE id=$1`, [payments[0].id]);
            refundResult = { payment_id: payments[0].id, amount: parseFloat(req.body.refund_amount) };
            // Notify worker
            notify(rows[0].raised_by, {
              type: 'refund_issued',
              title: `💸 Refund issued — SAR ${req.body.refund_amount}`,
              body: 'Your dispute was resolved in your favour.',
              link: '/worker/disputes',
            });
          }
        } catch (e) { /* ignore */ }
      }
      notify(rows[0].raised_by, {
        type: 'dispute_resolved', title: 'Your dispute was resolved',
        body: req.body.decision.slice(0, 150), link: '/worker/disputes',
      });
      auditLog(req, 'dispute_resolved', 'disputes', id, { refund: req.body.refund_amount });
      res.json({ ok: true, refund: refundResult });
    } catch (e) { next(e); }
  }
);

// ─── ESCALATE ───
router.put('/:id/escalate', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM disputes WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Dispute not found' });
    if (req.user.role !== 'admin' && rows[0].raised_by !== req.user.id) {
      return res.status(403).json({ error: 'Not your dispute' });
    }
    // Mark with an "ESCALATED:" prefix and re-set to open if resolved
    await db.query(
      `UPDATE disputes SET resolution=$1, status='open' WHERE id=$2`,
      [`ESCALATED: ${req.body.reason || 'Unresolved >7d'}\n${rows[0].resolution || ''}`, id]
    );
    auditLog(req, 'dispute_escalated', 'disputes', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
