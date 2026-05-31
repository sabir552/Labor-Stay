/**
 * Financial reports (E4). Admin-only.
 *
 *   GET /admin/finance/profit-loss        — P&L by month/year
 *   GET /admin/finance/commission-report  — commission earnings breakdown
 *   GET /admin/finance/vat-report         — VAT collected (ZATCA format)
 *   GET /admin/finance/outstanding        — unpaid/overdue invoices
 *   GET /admin/finance/refunds            — all refunds
 *   GET /admin/finance/payout-requests    — owner payout requests
 */
const express = require('express');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, requireRole('admin'));

function monthExpr(col = 'created_at') {
  return db.driver === 'postgres'
    ? `TO_CHAR(${col}::date, 'YYYY-MM')`
    : `strftime('%Y-%m', ${col})`;
}

// ─── P&L (monthly) ─────────────────────────────────────────────────
router.get('/profit-loss', async (req, res, next) => {
  try {
    const m = monthExpr('p.paid_at');
    const { rows } = await db.query(
      `SELECT ${m} AS month,
              COUNT(p.id) AS payments,
              COALESCE(SUM(p.amount),0) AS gross_revenue,
              COALESCE(SUM(b.commission_amount),0) AS platform_commission,
              COALESCE(SUM(b.vat_amount),0) AS vat_collected,
              COALESCE(SUM(b.net_to_owner),0) AS owner_payouts_due
       FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id
       WHERE p.status='paid'
       GROUP BY ${m} ORDER BY month DESC LIMIT 24`
    );
    const totals = rows.reduce((acc, r) => ({
      gross_revenue:       acc.gross_revenue + parseFloat(r.gross_revenue),
      platform_commission: acc.platform_commission + parseFloat(r.platform_commission),
      vat_collected:       acc.vat_collected + parseFloat(r.vat_collected),
      owner_payouts_due:   acc.owner_payouts_due + parseFloat(r.owner_payouts_due),
      payments:            acc.payments + parseInt(r.payments, 10),
    }), { gross_revenue: 0, platform_commission: 0, vat_collected: 0, owner_payouts_due: 0, payments: 0 });
    // Round all
    for (const k of ['gross_revenue', 'platform_commission', 'vat_collected', 'owner_payouts_due']) {
      totals[k] = Math.round(totals[k] * 100) / 100;
    }
    res.json({ months: rows, totals });
  } catch (e) { next(e); }
});

// ─── Commission breakdown (by camp / owner) ─────────────────────────
router.get('/commission-report', async (req, res, next) => {
  try {
    const start = req.query.start || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const end   = req.query.end   || new Date().toISOString().slice(0, 10);

    const { rows: byOwner } = await db.query(
      `SELECT u.id AS owner_id, u.full_name AS owner_name, op.company_name,
              COUNT(b.id) AS bookings,
              COALESCE(SUM(b.total_amount),0) AS gross,
              COALESCE(SUM(b.commission_amount),0) AS commission,
              COALESCE(SUM(b.net_to_owner),0) AS net_to_owner
       FROM bookings b
       JOIN payments p ON p.booking_id = b.id AND p.status='paid'
       JOIN camps c ON c.id = b.camp_id
       JOIN users u ON u.id = c.owner_id
       LEFT JOIN owner_profiles op ON op.user_id = u.id
       WHERE p.paid_at >= $1 AND p.paid_at <= $2
       GROUP BY u.id, u.full_name, op.company_name
       ORDER BY commission DESC LIMIT 50`,
      [start + ' 00:00:00', end + ' 23:59:59']
    );
    const { rows: byCity } = await db.query(
      `SELECT c.city, COUNT(b.id) AS bookings,
              COALESCE(SUM(b.commission_amount),0) AS commission
       FROM bookings b
       JOIN payments p ON p.booking_id = b.id AND p.status='paid'
       JOIN camps c ON c.id = b.camp_id
       WHERE p.paid_at >= $1 AND p.paid_at <= $2
       GROUP BY c.city ORDER BY commission DESC LIMIT 20`,
      [start + ' 00:00:00', end + ' 23:59:59']
    );
    const total = byOwner.reduce((s, r) => s + parseFloat(r.commission || 0), 0);
    res.json({ range: { start, end }, total_commission: Math.round(total * 100) / 100, by_owner: byOwner, by_city: byCity });
  } catch (e) { next(e); }
});

// ─── VAT report (ZATCA format) ──────────────────────────────────────
router.get('/vat-report', async (req, res, next) => {
  try {
    const start = req.query.start || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const end   = req.query.end   || new Date().toISOString().slice(0, 10);

    // Per-invoice line items, suitable for ZATCA submission
    const { rows: invoices } = await db.query(
      `SELECT p.invoice_number, p.amount AS total_inc_vat, p.method, p.paid_at,
              b.base_amount AS taxable_base, b.vat_amount AS vat_amount,
              u.full_name AS payer_name, u.email AS payer_email
       FROM payments p
       LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.status='paid' AND p.paid_at >= $1 AND p.paid_at <= $2
       ORDER BY p.paid_at ASC LIMIT 1000`,
      [start + ' 00:00:00', end + ' 23:59:59']
    );

    const totals = invoices.reduce((acc, r) => ({
      taxable_base: acc.taxable_base + parseFloat(r.taxable_base || 0),
      vat_amount:   acc.vat_amount + parseFloat(r.vat_amount || 0),
      total:        acc.total + parseFloat(r.total_inc_vat || 0),
    }), { taxable_base: 0, vat_amount: 0, total: 0 });

    res.json({
      header: {
        seller_name: 'LaborStay Platform',
        seller_vat: process.env.PLATFORM_VAT_NUMBER || '300000000000003',
        report_period: { start, end },
        currency: 'SAR',
        zatca_compliant: true,
      },
      totals: {
        taxable_base: Math.round(totals.taxable_base * 100) / 100,
        vat_amount:   Math.round(totals.vat_amount * 100) / 100,
        total_inc_vat: Math.round(totals.total * 100) / 100,
        vat_rate: '15%',
      },
      line_items: invoices,
    });
  } catch (e) { next(e); }
});

// ─── Outstanding (unpaid invoices, both corporate + bookings) ───────
router.get('/outstanding', async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Corporate invoices
    let corp = [];
    try {
      const { rows } = await db.query(
        `SELECT ci.*, ca.company_name FROM corporate_invoices ci
         JOIN corporate_accounts ca ON ca.id=ci.corporate_id
         WHERE ci.status != 'paid' ORDER BY ci.due_date ASC LIMIT 100`
      );
      corp = rows.map((r) => ({ ...r, is_overdue: r.due_date && r.due_date < today }));
    } catch (e) { /* table may not exist */ }

    // Unpaid bookings (pending bookings with no successful payment yet)
    const { rows: unpaidBookings } = await db.query(
      `SELECT b.id, b.booking_code, b.total_amount, b.created_at, b.status,
              c.name AS camp_name, u.full_name AS worker_name
       FROM bookings b
       JOIN camps c ON c.id=b.camp_id
       JOIN users u ON u.id=b.worker_id
       WHERE b.status IN ('pending','confirmed')
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='paid')
       ORDER BY b.created_at ASC LIMIT 100`
    );

    const corpOutstanding = corp.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
    const bookingOutstanding = unpaidBookings.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);

    res.json({
      corporate_invoices: corp,
      unpaid_bookings: unpaidBookings,
      totals: {
        corporate_outstanding: Math.round(corpOutstanding * 100) / 100,
        bookings_outstanding:  Math.round(bookingOutstanding * 100) / 100,
        grand_total:           Math.round((corpOutstanding + bookingOutstanding) * 100) / 100,
      },
    });
  } catch (e) { next(e); }
});

// ─── Refunds ────────────────────────────────────────────────────────
router.get('/refunds', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.*, b.booking_code, c.name AS camp_name, u.full_name AS user_name
       FROM payments p
       LEFT JOIN bookings b ON b.id=p.booking_id
       LEFT JOIN camps c ON c.id=b.camp_id
       LEFT JOIN users u ON u.id=p.user_id
       WHERE p.status='refunded'
       ORDER BY p.created_at DESC LIMIT 200`
    );
    const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    res.json({ refunds: rows, total: Math.round(total * 100) / 100, count: rows.length });
  } catch (e) { next(e); }
});

// ─── Payout requests (read-only mirror of /api/payouts) ─────────────
router.get('/payout-requests', async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.status) { params.push(req.query.status); where.push(`pr.status=$${params.length}`); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT pr.*, u.full_name AS owner_name, op.company_name FROM payout_requests pr
       LEFT JOIN users u ON u.id=pr.owner_id
       LEFT JOIN owner_profiles op ON op.user_id=u.id
       ${whereSql} ORDER BY pr.created_at DESC LIMIT 200`, params
    );
    const totals = rows.reduce((acc, r) => {
      const a = parseFloat(r.amount || 0);
      if (r.status === 'paid') acc.paid += a;
      else if (r.status === 'pending') acc.pending += a;
      else if (r.status === 'rejected') acc.rejected += a;
      return acc;
    }, { paid: 0, pending: 0, rejected: 0 });
    res.json({ requests: rows, totals });
  } catch (e) { next(e); }
});

module.exports = router;
