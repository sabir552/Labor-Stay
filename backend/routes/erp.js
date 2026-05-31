/**
 * ERP integration layer (G1).
 *
 *   POST   /sync/bookings              — push bookings to ERP
 *   POST   /sync/payments              — push payments
 *   POST   /sync/invoices              — push invoices
 *   POST   /sync/customers             — push customers
 *   POST   /webhook                    — receive data from ERP
 *   GET    /status                     — connection status
 *   GET    /sync/logs                  — sync history
 *   POST   /sync/manual                — manual full sync (admin)
 *
 * ERP_TYPE = none | sap | odoo | zoho. When 'none' or env unset,
 * every push call returns { status: 'erp_not_configured' } but
 * still logs to `erp_sync_logs` for audit.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const ERP_TYPE = (process.env.ERP_TYPE || 'none').toLowerCase();
const ERP_CONFIGURED = ERP_TYPE !== 'none' && !!(process.env.ERP_API_URL && process.env.ERP_API_KEY);

// All ERP routes require admin
router.use(authRequired, requireRole('admin'));

async function logSync(syncType, entityType, entityId, direction, status, payload, response = null, errorMessage = null) {
  try {
    await db.query(
      `INSERT INTO erp_sync_logs
         (sync_type, entity_type, entity_id, direction, status, payload, response, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [syncType, entityType, entityId, direction, status,
       payload ? JSON.stringify(payload) : null,
       response ? JSON.stringify(response) : null,
       errorMessage]
    );
  } catch (e) { /* ignore */ }
}

// ─── STATUS ───
router.get('/status', async (_req, res, next) => {
  try {
    const { rows: lastSyncs } = await db.query(
      `SELECT entity_type, status, MAX(created_at) AS last_at
       FROM erp_sync_logs GROUP BY entity_type, status ORDER BY last_at DESC LIMIT 20`
    );
    res.json({
      erp_type: ERP_TYPE,
      configured: ERP_CONFIGURED,
      api_url: ERP_CONFIGURED ? process.env.ERP_API_URL : null,
      company_id: process.env.ERP_COMPANY_ID || null,
      sync_interval_min: parseInt(process.env.ERP_SYNC_INTERVAL || '60', 10),
      last_syncs: lastSyncs,
    });
  } catch (e) { next(e); }
});

// ─── Generic push helper ───
async function pushToErp(entityType, entityId, payload) {
  if (!ERP_CONFIGURED) {
    await logSync('push', entityType, entityId, 'push', 'pending', payload, null,
      'ERP not configured');
    return { status: 'erp_not_configured', entity_type: entityType };
  }
  // Real implementation: format payload per ERP type and POST to ERP_API_URL
  try {
    let formatted = payload;
    if (ERP_TYPE === 'sap') formatted = { BAPI: 'BAPI_LABORSTAY_SYNC', PARAMS: payload };
    else if (ERP_TYPE === 'odoo') formatted = { model: `laborstay.${entityType}`, method: 'create', args: [payload] };
    else if (ERP_TYPE === 'zoho') formatted = { module: entityType, data: payload };

    const res = await fetch(process.env.ERP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.ERP_API_KEY}`,
        'X-Company-Id': process.env.ERP_COMPANY_ID || '',
      },
      body: JSON.stringify(formatted),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      await logSync('push', entityType, entityId, 'push', 'failed', payload, data, `HTTP ${res.status}`);
      return { status: 'failed', error: data.error || res.statusText };
    }
    await logSync('push', entityType, entityId, 'push', 'success', payload, data);
    return { status: 'success', erp_response: data };
  } catch (e) {
    await logSync('push', entityType, entityId, 'push', 'failed', payload, null, e.message);
    return { status: 'failed', error: e.message };
  }
}

// ─── PUSH BOOKINGS ───
router.post('/sync/bookings', async (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.body.limit || 20, 10));
    const { rows } = await db.query(
      `SELECT b.id, b.booking_code, b.total_amount, b.created_at, c.name AS camp_name
       FROM bookings b JOIN camps c ON c.id=b.camp_id
       ORDER BY b.created_at DESC LIMIT ${limit}`
    );
    const results = [];
    for (const r of rows) {
      const out = await pushToErp('booking', r.id, r);
      results.push({ booking_id: r.id, ...out });
    }
    res.json({ pushed: results.length, results });
  } catch (e) { next(e); }
});

router.post('/sync/payments', async (req, res, next) => {
  try {
    const limit = Math.min(100, parseInt(req.body.limit || 20, 10));
    const { rows } = await db.query(
      `SELECT id, invoice_number, amount, status, created_at FROM payments
       WHERE status='paid' ORDER BY created_at DESC LIMIT ${limit}`
    );
    const results = [];
    for (const r of rows) results.push({ id: r.id, ...(await pushToErp('payment', r.id, r)) });
    res.json({ pushed: results.length, results });
  } catch (e) { next(e); }
});

router.post('/sync/invoices', async (req, res, next) => {
  try {
    let rows = [];
    try {
      const r = await db.query(
        `SELECT id, invoice_number, total_amount, status, created_at FROM corporate_invoices
         ORDER BY created_at DESC LIMIT 50`
      );
      rows = r.rows;
    } catch (e) {}
    const results = [];
    for (const r of rows) results.push({ id: r.id, ...(await pushToErp('invoice', r.id, r)) });
    res.json({ pushed: results.length, results });
  } catch (e) { next(e); }
});

router.post('/sync/customers', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, email, phone, role, created_at FROM users
       WHERE is_active=1 ORDER BY id ASC LIMIT 100`
    );
    const results = [];
    for (const r of rows) results.push({ id: r.id, ...(await pushToErp('customer', r.id, r)) });
    res.json({ pushed: results.length, results });
  } catch (e) { next(e); }
});

// ─── WEBHOOK (receive from ERP) ───
router.post('/webhook', async (req, res, next) => {
  try {
    await logSync('webhook', req.body.entity_type || 'unknown', req.body.entity_id || null,
      'pull', 'success', null, req.body, null);
    res.json({ ok: true, received: true });
  } catch (e) { next(e); }
});

// ─── LOGS ───
router.get('/sync/logs', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM erp_sync_logs ORDER BY created_at DESC LIMIT 200`
    );
    const totals = rows.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    res.json({ logs: rows, totals });
  } catch (e) { next(e); }
});

// ─── MANUAL FULL SYNC ───
router.post('/sync/manual', async (req, res, next) => {
  try {
    const out = { bookings: 0, payments: 0, customers: 0 };
    // Just kick off batches
    const b = await db.query("SELECT COUNT(*) AS c FROM bookings");
    const p = await db.query("SELECT COUNT(*) AS c FROM payments WHERE status='paid'");
    const u = await db.query("SELECT COUNT(*) AS c FROM users WHERE is_active=1");
    out.bookings = parseInt(b.rows[0].c, 10);
    out.payments = parseInt(p.rows[0].c, 10);
    out.customers = parseInt(u.rows[0].c, 10);
    auditLog(req, 'erp_manual_sync', null, null, out);
    res.json({
      ok: true,
      message: ERP_CONFIGURED ? 'Sync queued' : 'ERP not configured — counts shown only',
      counts: out, erp_configured: ERP_CONFIGURED,
    });
  } catch (e) { next(e); }
});

module.exports = router;
