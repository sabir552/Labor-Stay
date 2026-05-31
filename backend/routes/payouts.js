/**
 * Payout requests (E5).
 *
 * Table: payout_requests (Piece 13 v2)
 *
 *   POST   /request           — owner requests payout
 *   GET    /my-requests       — owner's history
 *   GET    /                  — admin: all payout requests (filterable)
 *   PUT    /:id/approve       — admin approves + marks paid
 *   PUT    /:id/reject        — admin rejects with reason
 *   GET    /summary/owner/:id — owner earnings summary (helper)
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

async function ownerEarnings(ownerId) {
  // Net-to-owner from all paid bookings minus already-paid payouts
  const { rows: earned } = await db.query(
    `SELECT COALESCE(SUM(b.net_to_owner),0) AS earned
     FROM bookings b
     JOIN camps c ON c.id = b.camp_id
     JOIN payments p ON p.booking_id = b.id
     WHERE c.owner_id=$1 AND p.status='paid'`,
    [ownerId]
  );
  const { rows: paid } = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS paid_out
     FROM payout_requests WHERE owner_id=$1 AND status='paid'`,
    [ownerId]
  );
  const { rows: pending } = await db.query(
    `SELECT COALESCE(SUM(amount),0) AS pending
     FROM payout_requests WHERE owner_id=$1 AND status IN ('pending','approved')`,
    [ownerId]
  );
  return {
    earned: parseFloat(earned[0].earned || 0),
    paid_out: parseFloat(paid[0].paid_out || 0),
    pending: parseFloat(pending[0].pending || 0),
    available: parseFloat(earned[0].earned || 0) - parseFloat(paid[0].paid_out || 0) - parseFloat(pending[0].pending || 0),
  };
}

// ─── REQUEST (owner) ───
router.post('/request',
  authRequired, requireRole('owner', 'admin'),
  [
    body('amount').isFloat({ min: 1 }),
    body('bank_name').optional().isString(),
    body('iban').optional().isString(),
    body('account_holder').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const ownerId = req.user.id;
      const e = await ownerEarnings(ownerId);
      const amt = parseFloat(req.body.amount);
      if (amt > e.available) {
        return res.status(400).json({
          error: 'Requested amount exceeds available balance',
          requested: amt, available: e.available,
        });
      }
      const { rows } = await db.query(
        `INSERT INTO payout_requests
           (owner_id, amount, bank_name, iban, account_holder, status)
         VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
        [ownerId, amt, req.body.bank_name || null, req.body.iban || null, req.body.account_holder || null]
      );
      auditLog(req, 'request_payout', 'payout_requests', rows[0].id, { amount: amt });
      res.status(201).json({ request: rows[0], earnings: { ...e, available: e.available - amt } });
    } catch (e) { next(e); }
  }
);

// ─── MY (owner) ───
router.get('/my-requests', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM payout_requests WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const e = await ownerEarnings(req.user.id);
    res.json({ requests: rows, earnings: e });
  } catch (e) { next(e); }
});

// ─── ADMIN: all ───
router.get('/', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.status) { params.push(req.query.status); where.push(`pr.status=$${params.length}`); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT pr.*, u.full_name AS owner_name, u.email AS owner_email, op.company_name
       FROM payout_requests pr
       LEFT JOIN users u ON u.id = pr.owner_id
       LEFT JOIN owner_profiles op ON op.user_id = u.id
       ${whereSql} ORDER BY pr.created_at DESC LIMIT 200`, params
    );
    res.json({ requests: rows });
  } catch (e) { next(e); }
});

// ─── ADMIN: approve / mark paid ───
router.put('/:id/approve',
  authRequired, requireRole('admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query('SELECT * FROM payout_requests WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (rows[0].status === 'paid') return res.json({ ok: true, already_paid: true });

      await db.query(
        `UPDATE payout_requests SET status='paid', processed_at=CURRENT_TIMESTAMP, admin_notes=$1 WHERE id=$2`,
        [req.body.notes || null, id]
      );
      notify(rows[0].owner_id, {
        type: 'payout_paid',
        title: `💰 Payout approved — SAR ${rows[0].amount}`,
        body: 'Funds will land in your IBAN within 1-3 business days.',
        link: '/owner/earnings',
      });
      auditLog(req, 'approve_payout', 'payout_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── ADMIN: reject ───
router.put('/:id/reject',
  authRequired, requireRole('admin'),
  [body('reason').optional().isString().isLength({ max: 1000 })],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query('SELECT * FROM payout_requests WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });

      await db.query(
        `UPDATE payout_requests SET status='rejected', processed_at=CURRENT_TIMESTAMP, admin_notes=$1 WHERE id=$2`,
        [req.body.reason || 'Rejected by admin', id]
      );
      notify(rows[0].owner_id, {
        type: 'payout_rejected',
        title: `Payout rejected — SAR ${rows[0].amount}`,
        body: req.body.reason || 'Please contact support.',
        link: '/owner/earnings',
      });
      auditLog(req, 'reject_payout', 'payout_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── SUMMARY (helper) ───
router.get('/summary/owner/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ error: 'Not your earnings' });
    }
    const e = await ownerEarnings(id);
    res.json(e);
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.ownerEarnings = ownerEarnings;
