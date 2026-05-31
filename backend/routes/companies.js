/**
 * Multi-company & branches (G2).
 *
 *   POST   /                       — admin creates company
 *   GET    /                       — list
 *   GET    /:id                    — detail with branches
 *   PUT    /:id                    — update
 *   POST   /:id/branches           — add branch
 *   GET    /:id/branches           — list branches
 *   PUT    /:id/branches/:bid      — update branch
 *   GET    /:id/bookings           — all bookings for company users
 *   GET    /:id/staff              — all staff across company camps
 *   GET    /:id/analytics          — company-wide stats
 *
 * Note: this is the platform-wide multi-tenant company concept. The existing
 * `corporate_accounts` (Piece 19, E2/E3) is the credit/billing layer for
 * an external client. Both can exist independently.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

router.use(authRequired, requireRole('admin'));

// ─── CREATE COMPANY ───
router.post('/',
  [body('name').isString().isLength({ min: 2 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO companies
           (name, cr_number, vat_number, logo_url, address, city, region,
            phone, email, website, account_manager_id, credit_limit, payment_terms, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1) RETURNING *`,
        [
          b.name, b.cr_number || null, b.vat_number || null, b.logo_url || null,
          b.address || null, b.city || null, b.region || null,
          b.phone || null, b.email || null, b.website || null,
          b.account_manager_id || null,
          parseFloat(b.credit_limit || 0), b.payment_terms || null,
        ]
      );
      auditLog(req, 'create_company', 'companies', rows[0].id);
      res.status(201).json({ company: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*,
              (SELECT COUNT(*) FROM branches b WHERE b.company_id=c.id) AS branch_count,
              (SELECT COUNT(*) FROM users u WHERE u.company_id=c.id) AS user_count,
              (SELECT COUNT(*) FROM camps cp WHERE cp.company_id=c.id) AS camp_count
       FROM companies c ORDER BY c.created_at DESC LIMIT 200`
    );
    res.json({ companies: rows });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: c } = await db.query('SELECT * FROM companies WHERE id=$1', [id]);
    if (!c[0]) return res.status(404).json({ error: 'Company not found' });
    const { rows: branches } = await db.query('SELECT * FROM branches WHERE company_id=$1 ORDER BY id ASC', [id]);
    res.json({ company: c[0], branches });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM companies WHERE id=$1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Company not found' });
    const b = req.body;
    const fields = {
      name: b.name, cr_number: b.cr_number, vat_number: b.vat_number,
      logo_url: b.logo_url, address: b.address, city: b.city, region: b.region,
      phone: b.phone, email: b.email, website: b.website,
      account_manager_id: b.account_manager_id != null ? parseInt(b.account_manager_id, 10) : undefined,
      credit_limit: b.credit_limit != null ? parseFloat(b.credit_limit) : undefined,
      payment_terms: b.payment_terms,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.json({ company: cur[0] });
    vals.push(id);
    await db.query(`UPDATE companies SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM companies WHERE id=$1', [id]);
    auditLog(req, 'update_company', 'companies', id);
    res.json({ company: after[0] });
  } catch (e) { next(e); }
});

// ─── BRANCHES ───
router.post('/:id/branches',
  [body('branch_name').isString().isLength({ min: 2 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const companyId = parseInt(req.params.id, 10);
      const { rows: c } = await db.query('SELECT id FROM companies WHERE id=$1', [companyId]);
      if (!c[0]) return res.status(404).json({ error: 'Company not found' });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO branches
           (company_id, branch_name, address, city, region, manager_name, manager_phone, manager_email, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING *`,
        [companyId, b.branch_name, b.address || null, b.city || null, b.region || null,
         b.manager_name || null, b.manager_phone || null, b.manager_email || null]
      );
      auditLog(req, 'create_branch', 'branches', rows[0].id);
      res.status(201).json({ branch: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/:id/branches', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM branches WHERE company_id=$1 ORDER BY id ASC`,
      [parseInt(req.params.id, 10)]
    );
    res.json({ branches: rows });
  } catch (e) { next(e); }
});

router.put('/:id/branches/:bid', async (req, res, next) => {
  try {
    const bid = parseInt(req.params.bid, 10);
    const { rows: cur } = await db.query('SELECT * FROM branches WHERE id=$1', [bid]);
    if (!cur[0]) return res.status(404).json({ error: 'Branch not found' });
    const b = req.body;
    const fields = {
      branch_name: b.branch_name, address: b.address, city: b.city, region: b.region,
      manager_name: b.manager_name, manager_phone: b.manager_phone, manager_email: b.manager_email,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.json({ branch: cur[0] });
    vals.push(bid);
    await db.query(`UPDATE branches SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM branches WHERE id=$1', [bid]);
    auditLog(req, 'update_branch', 'branches', bid);
    res.json({ branch: after[0] });
  } catch (e) { next(e); }
});

// ─── ROLLUPS ───
router.get('/:id/bookings', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT b.*, c.name AS camp_name, u.full_name AS worker_name
       FROM bookings b
       JOIN users u ON u.id=b.worker_id
       JOIN camps c ON c.id=b.camp_id
       WHERE u.company_id=$1 OR b.company_id=$2
       ORDER BY b.created_at DESC LIMIT 200`, [id, id]
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

router.get('/:id/staff', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    let rows = [];
    try {
      const r = await db.query(
        `SELECT s.*, c.name AS camp_name FROM camp_staff s
         JOIN camps c ON c.id=s.camp_id
         WHERE c.company_id=$1 AND s.is_active=1
         ORDER BY s.full_name ASC LIMIT 500`, [id]
      );
      rows = r.rows;
    } catch (e) {}
    res.json({ staff: rows });
  } catch (e) { next(e); }
});

router.get('/:id/analytics', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const q = async (sql) => (await db.query(sql, [id])).rows[0];
    const stats = {};
    stats.users     = parseInt((await q('SELECT COUNT(*) AS c FROM users WHERE company_id=$1')).c, 10);
    stats.branches  = parseInt((await q('SELECT COUNT(*) AS c FROM branches WHERE company_id=$1')).c, 10);
    stats.camps     = parseInt((await q('SELECT COUNT(*) AS c FROM camps WHERE company_id=$1')).c, 10);
    stats.bookings = parseInt((await db.query('SELECT COUNT(*) AS c FROM bookings WHERE company_id=$1 OR worker_id IN (SELECT id FROM users WHERE company_id=$2)', [id, id])).rows[0].c, 10);
    try {
      stats.staff = parseInt((await q('SELECT COUNT(*) AS c FROM camp_staff WHERE camp_id IN (SELECT id FROM camps WHERE company_id=$1)')).c, 10);
    } catch (e) { stats.staff = 0; }
    res.json({ company_id: id, stats });
  } catch (e) { next(e); }
});

module.exports = router;
