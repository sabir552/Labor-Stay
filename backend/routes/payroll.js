/**
 * Payroll (D6).
 *
 * Table: payroll_records (Piece 13 v2)
 *
 *   POST   /records              — add monthly record (auto-computes net)
 *   GET    /records/camp/:campId — list records for a camp
 *   GET    /records/staff/:staffId — list records for a staff member
 *   PUT    /records/:id          — update (re-computes net)
 *   PUT    /records/:id/pay      — mark paid
 *   GET    /reports/camp/:campId — monthly summary report
 *   POST   /deductions           — add a deduction to a record
 *
 * Net = basic_salary + allowances − deductions − accommodation_deduction
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

function computeNet(basic, allowances, deductions, accomDeduction) {
  return Math.round(
    ((parseFloat(basic || 0) + parseFloat(allowances || 0))
      - parseFloat(deductions || 0) - parseFloat(accomDeduction || 0)) * 100
  ) / 100;
}

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

async function assertStaffOwner(req, staffId) {
  const { rows } = await db.query(
    `SELECT s.*, c.owner_id FROM camp_staff s
     JOIN camps c ON c.id=s.camp_id WHERE s.id=$1`, [staffId]
  );
  if (!rows[0]) return { error: 404, message: 'Staff not found' };
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return { error: 403, message: 'Not your staff' };
  }
  return { ok: true, staff: rows[0] };
}

// ─── CREATE record ───
router.post('/records',
  authRequired, requireRole('owner', 'admin'),
  [
    body('staff_id').isInt({ min: 1 }),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2020, max: 2100 }),
    body('basic_salary').optional().isFloat({ min: 0 }),
    body('allowances').optional().isFloat({ min: 0 }),
    body('deductions').optional().isFloat({ min: 0 }),
    body('accommodation_deduction').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const own = await assertStaffOwner(req, req.body.staff_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      // De-dup: one record per (staff, month, year)
      const { rows: ex } = await db.query(
        `SELECT id FROM payroll_records WHERE staff_id=$1 AND month=$2 AND year=$3`,
        [req.body.staff_id, req.body.month, req.body.year]
      );
      if (ex[0]) return res.status(409).json({ error: 'Payroll record already exists for this month', id: ex[0].id });

      const b = req.body;
      const basic = parseFloat(b.basic_salary != null ? b.basic_salary : own.staff.salary || 0);
      const net = computeNet(basic, b.allowances, b.deductions, b.accommodation_deduction);

      const { rows } = await db.query(
        `INSERT INTO payroll_records
           (camp_id, staff_id, month, year, basic_salary, allowances, deductions,
            accommodation_deduction, net_salary, payment_status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10) RETURNING *`,
        [
          own.staff.camp_id, b.staff_id, b.month, b.year,
          basic, parseFloat(b.allowances || 0), parseFloat(b.deductions || 0),
          parseFloat(b.accommodation_deduction || 0), net, b.notes || null,
        ]
      );
      auditLog(req, 'create_payroll', 'payroll_records', rows[0].id);
      res.status(201).json({ record: rows[0] });
    } catch (e) { next(e); }
  }
);

// ─── LIST by camp ───
router.get('/records/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const where = ['pr.camp_id=$1']; const params = [campId];
      if (req.query.month) { params.push(parseInt(req.query.month, 10)); where.push(`pr.month=$${params.length}`); }
      if (req.query.year)  { params.push(parseInt(req.query.year, 10));  where.push(`pr.year=$${params.length}`); }
      if (req.query.status){ params.push(req.query.status);               where.push(`pr.payment_status=$${params.length}`); }

      const { rows } = await db.query(
        `SELECT pr.*, s.full_name AS staff_name, s.role AS staff_role
         FROM payroll_records pr JOIN camp_staff s ON s.id = pr.staff_id
         WHERE ${where.join(' AND ')}
         ORDER BY pr.year DESC, pr.month DESC, s.full_name ASC LIMIT 500`,
        params
      );

      const totals = rows.reduce(
        (acc, r) => ({
          basic: acc.basic + parseFloat(r.basic_salary || 0),
          allowances: acc.allowances + parseFloat(r.allowances || 0),
          deductions: acc.deductions + parseFloat(r.deductions || 0),
          accommodation: acc.accommodation + parseFloat(r.accommodation_deduction || 0),
          net: acc.net + parseFloat(r.net_salary || 0),
          paid: acc.paid + (r.payment_status === 'paid' ? parseFloat(r.net_salary || 0) : 0),
        }),
        { basic: 0, allowances: 0, deductions: 0, accommodation: 0, net: 0, paid: 0 }
      );
      for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
      res.json({ records: rows, totals, count: rows.length });
    } catch (e) { next(e); }
  }
);

// ─── LIST by staff ───
router.get('/records/staff/:staffId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.staffId, 10);
      const own = await assertStaffOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      const { rows } = await db.query(
        `SELECT * FROM payroll_records WHERE staff_id=$1
         ORDER BY year DESC, month DESC`, [id]
      );
      res.json({ records: rows });
    } catch (e) { next(e); }
  }
);

// ─── UPDATE ───
router.put('/records/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query(
        `SELECT pr.*, c.owner_id FROM payroll_records pr
         JOIN camps c ON c.id = pr.camp_id WHERE pr.id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Record not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      if (cur[0].payment_status === 'paid' && req.user.role !== 'admin') {
        return res.status(400).json({ error: 'Cannot edit a paid record' });
      }

      const b = req.body;
      const basic   = b.basic_salary             != null ? parseFloat(b.basic_salary)             : parseFloat(cur[0].basic_salary || 0);
      const allow   = b.allowances               != null ? parseFloat(b.allowances)               : parseFloat(cur[0].allowances || 0);
      const ded     = b.deductions               != null ? parseFloat(b.deductions)               : parseFloat(cur[0].deductions || 0);
      const accom   = b.accommodation_deduction  != null ? parseFloat(b.accommodation_deduction)  : parseFloat(cur[0].accommodation_deduction || 0);
      const net = computeNet(basic, allow, ded, accom);

      await db.query(
        `UPDATE payroll_records SET basic_salary=$1, allowances=$2, deductions=$3,
           accommodation_deduction=$4, net_salary=$5, notes=COALESCE($6, notes) WHERE id=$7`,
        [basic, allow, ded, accom, net, b.notes || null, id]
      );
      const { rows: after } = await db.query('SELECT * FROM payroll_records WHERE id=$1', [id]);
      auditLog(req, 'update_payroll', 'payroll_records', id);
      res.json({ record: after[0] });
    } catch (e) { next(e); }
  }
);

// ─── MARK PAID ───
router.put('/records/:id/pay',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query(
        `SELECT pr.*, c.owner_id FROM payroll_records pr
         JOIN camps c ON c.id=pr.camp_id WHERE pr.id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Record not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      const payDate = req.body.payment_date || new Date().toISOString().slice(0, 10);
      await db.query(
        `UPDATE payroll_records SET payment_status='paid', payment_date=$1 WHERE id=$2`,
        [payDate, id]
      );
      auditLog(req, 'pay_payroll', 'payroll_records', id);
      res.json({ ok: true, payment_date: payDate });
    } catch (e) { next(e); }
  }
);

// ─── ADD DEDUCTION (increments deductions field) ───
router.post('/deductions',
  authRequired, requireRole('owner', 'admin'),
  [
    body('record_id').isInt({ min: 1 }),
    body('amount').isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.body.record_id, 10);
      const { rows: cur } = await db.query(
        `SELECT pr.*, c.owner_id FROM payroll_records pr
         JOIN camps c ON c.id=pr.camp_id WHERE pr.id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Record not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      if (cur[0].payment_status === 'paid') {
        return res.status(400).json({ error: 'Cannot add deduction to paid record' });
      }
      const newDed = parseFloat(cur[0].deductions || 0) + parseFloat(req.body.amount);
      const newNet = computeNet(cur[0].basic_salary, cur[0].allowances, newDed, cur[0].accommodation_deduction);
      const newNotes = cur[0].notes
        ? `${cur[0].notes}\n[+] Deduction ${req.body.amount}: ${req.body.reason || ''}`
        : `[+] Deduction ${req.body.amount}: ${req.body.reason || ''}`;
      await db.query(
        `UPDATE payroll_records SET deductions=$1, net_salary=$2, notes=$3 WHERE id=$4`,
        [newDed, newNet, newNotes, id]
      );
      auditLog(req, 'add_deduction', 'payroll_records', id, { amount: req.body.amount });
      res.json({ ok: true, new_deductions: newDed, new_net: newNet });
    } catch (e) { next(e); }
  }
);

// ─── REPORTS ───
router.get('/reports/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows } = await db.query(
        `SELECT year, month,
                COUNT(*) AS staff_count,
                COALESCE(SUM(basic_salary),0) AS basic,
                COALESCE(SUM(allowances),0) AS allowances,
                COALESCE(SUM(deductions),0) AS deductions,
                COALESCE(SUM(accommodation_deduction),0) AS accommodation,
                COALESCE(SUM(net_salary),0) AS net,
                SUM(CASE WHEN payment_status='paid' THEN 1 ELSE 0 END) AS paid_count
         FROM payroll_records WHERE camp_id=$1
         GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 24`,
        [campId]
      );
      res.json({ months: rows });
    } catch (e) { next(e); }
  }
);

module.exports = router;
