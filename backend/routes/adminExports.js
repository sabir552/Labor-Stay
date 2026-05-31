/**
 * Admin CSV exports (I4).
 *   GET /api/admin/export/bookings?format=csv
 *   GET /api/admin/export/users?format=csv
 *   GET /api/admin/export/revenue?format=csv
 *   GET /api/admin/export/service-requests?format=csv
 *   GET /api/admin/export/payments?format=csv
 *   GET /api/admin/export/camps?format=csv
 *
 * format=json (default) returns JSON; format=csv streams CSV download.
 */
const express = require('express');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { sendCsv } = require('../utils/csvExport');

const router = express.Router();
router.use(authRequired, requireRole('admin'));

function send(res, format, rows, name) {
  if ((format || '').toLowerCase() === 'csv') return sendCsv(res, rows, { filename: name });
  res.json({ rows, count: rows.length });
}

router.get('/bookings', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT b.id, b.booking_code, b.status, b.start_date, b.end_date, b.occupants,
              b.base_amount, b.vat_amount, b.commission_amount, b.total_amount,
              c.name AS camp_name, c.city, r.name AS room_name, u.full_name AS worker_name, u.email AS worker_email,
              b.created_at
       FROM bookings b
       JOIN camps c ON c.id=b.camp_id
       JOIN rooms r ON r.id=b.room_id
       JOIN users u ON u.id=b.worker_id
       ORDER BY b.created_at DESC LIMIT 5000`
    );
    send(res, req.query.format, rows, 'bookings');
  } catch (e) { next(e); }
});

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, role, full_name, email, phone, preferred_language,
              is_active, is_verified, created_at FROM users ORDER BY id ASC`
    );
    send(res, req.query.format, rows, 'users');
  } catch (e) { next(e); }
});

router.get('/revenue', async (req, res, next) => {
  try {
    const dayExpr = db.driver === 'postgres'
      ? "TO_CHAR(p.paid_at::date, 'YYYY-MM-DD')"
      : "strftime('%Y-%m-%d', p.paid_at)";
    const { rows } = await db.query(
      `SELECT ${dayExpr} AS day,
              COUNT(*) AS payments,
              COALESCE(SUM(p.amount),0) AS gross,
              COALESCE(SUM(b.commission_amount),0) AS commission,
              COALESCE(SUM(b.vat_amount),0) AS vat
       FROM payments p LEFT JOIN bookings b ON b.id=p.booking_id
       WHERE p.status='paid'
       GROUP BY ${dayExpr} ORDER BY day ASC`
    );
    send(res, req.query.format, rows, 'revenue');
  } catch (e) { next(e); }
});

router.get('/payments', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.invoice_number, p.amount, p.method, p.status, p.gateway_ref,
              p.paid_at, p.created_at, b.booking_code, u.full_name AS payer, u.email
       FROM payments p
       LEFT JOIN bookings b ON b.id=p.booking_id
       LEFT JOIN users u ON u.id=p.user_id
       ORDER BY p.created_at DESC LIMIT 5000`
    );
    send(res, req.query.format, rows, 'payments');
  } catch (e) { next(e); }
});

router.get('/camps', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.name, c.city, c.region, c.camp_type, c.status,
              c.is_featured, c.rating, c.review_count, c.capacity, u.full_name AS owner_name
       FROM camps c LEFT JOIN users u ON u.id=c.owner_id ORDER BY c.id ASC`
    );
    send(res, req.query.format, rows, 'camps');
  } catch (e) { next(e); }
});

router.get('/service-requests', async (req, res, next) => {
  try {
    // Try worker_service_requests first (v2), then legacy service_requests
    let rows = [];
    try {
      const r = await db.query(
        `SELECT wsr.id, wsr.request_type, wsr.title, wsr.priority, wsr.status,
                wsr.created_at, u.full_name AS worker, c.name AS camp_name
         FROM worker_service_requests wsr
         LEFT JOIN users u ON u.id=wsr.worker_id
         LEFT JOIN camps c ON c.id=wsr.camp_id ORDER BY wsr.created_at DESC LIMIT 5000`
      );
      rows = r.rows;
    } catch (e) {
      const r = await db.query(
        `SELECT id, request_code, description, status, quoted_price, created_at
         FROM service_requests ORDER BY created_at DESC LIMIT 5000`
      );
      rows = r.rows;
    }
    send(res, req.query.format, rows, 'service-requests');
  } catch (e) { next(e); }
});

module.exports = router;
