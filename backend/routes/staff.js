/**
 * Staff management (D3).
 *
 * Tables (Piece 13 v2): camp_staff, staff_attendance, staff_shifts
 *
 *   POST   /                   — add staff
 *   GET    /camp/:campId       — list staff for a camp
 *   GET    /:id                — staff detail
 *   PUT    /:id                — update
 *   DELETE /:id                — deactivate (soft) or delete (hard if no records)
 *
 *   POST   /:id/documents      — replace documents JSON
 *   POST   /:id/photo          — upload staff photo
 *
 *   GET    /:id/attendance     — attendance for one staff member
 *   POST   /attendance         — log attendance (check-in/out)
 *   GET    /attendance/camp/:campId — camp-wide
 *
 *   POST   /shifts             — create shift
 *   GET    /shifts/camp/:campId — list shifts
 *   PUT    /shifts/:id         — update shift
 *   DELETE /shifts/:id         — remove shift
 */
const express = require('express');
const path = require('path');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { makeUploader, publicUrl } = require('../middleware/upload');

const router = express.Router();
const photoUploader = makeUploader('staff', { maxSizeMB: 5 });

const ROLES = ['cleaner', 'security', 'maintenance', 'driver', 'cook', 'supervisor', 'other'];
const ATT_STATUSES = ['present', 'absent', 'late', 'half_day'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}
function decorate(s) {
  if (!s) return s;
  return { ...s, documents: parseJSON(s.documents, []), is_active: !!s.is_active };
}
function decorateShift(s) {
  if (!s) return s;
  return { ...s, days: parseJSON(s.days, []) };
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
     JOIN camps c ON c.id = s.camp_id WHERE s.id=$1`, [staffId]
  );
  if (!rows[0]) return { error: 404, message: 'Staff not found' };
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return { error: 403, message: 'Not your staff' };
  }
  return { ok: true, staff: rows[0] };
}

// ─── CREATE ───
router.post('/',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('full_name').isString().isLength({ min: 2 }),
    body('role').isIn(ROLES),
    body('phone').optional().isString(),
    body('iqama_number').optional().isString(),
    body('iqama_expiry').optional().isString(),
    body('passport_number').optional().isString(),
    body('passport_expiry').optional().isString(),
    body('salary').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO camp_staff
           (camp_id, full_name, role, phone, email, iqama_number, iqama_expiry,
            passport_number, passport_expiry, nationality, photo_url, documents,
            salary, hire_date, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1) RETURNING *`,
        [
          b.camp_id, b.full_name, b.role, b.phone || null, b.email || null,
          b.iqama_number || null, b.iqama_expiry || null,
          b.passport_number || null, b.passport_expiry || null,
          b.nationality || null, b.photo_url || null,
          JSON.stringify(b.documents || []),
          parseFloat(b.salary || 0),
          b.hire_date || new Date().toISOString().slice(0, 10),
        ]
      );
      auditLog(req, 'create_staff', 'camp_staff', rows[0].id);
      res.status(201).json({ staff: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

// ─── LIST ───
router.get('/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const where = ['camp_id=$1']; const params = [campId];
      if (req.query.role) { params.push(req.query.role); where.push(`role=$${params.length}`); }
      if (req.query.active === 'true')  where.push('is_active = 1');
      if (req.query.active === 'false') where.push('is_active = 0');

      const { rows } = await db.query(
        `SELECT * FROM camp_staff WHERE ${where.join(' AND ')} ORDER BY full_name ASC`,
        params
      );

      // Add upcoming expiry warning per staff
      const today = new Date();
      const decorated = rows.map((s) => {
        const d = decorate(s);
        const ex = [];
        for (const [field, label] of [['iqama_expiry', 'Iqama'], ['passport_expiry', 'Passport']]) {
          if (!s[field]) continue;
          const days = Math.ceil((new Date(s[field]) - today) / 86400000);
          if (days < 0) ex.push({ field: label, status: 'expired', days_overdue: -days });
          else if (days <= 60) ex.push({ field: label, status: 'expiring', days_remaining: days });
        }
        d.expiry_alerts = ex;
        return d;
      });

      res.json({ staff: decorated });
    } catch (e) { next(e); }
  }
);

// ─── DETAIL ───
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const own = await assertStaffOwner(req, parseInt(req.params.id, 10));
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    res.json({ staff: decorate(own.staff) });
  } catch (e) { next(e); }
});

// ─── UPDATE ───
router.put('/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const own = await assertStaffOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const fields = {
        full_name: b.full_name, role: b.role && ROLES.includes(b.role) ? b.role : undefined,
        phone: b.phone, email: b.email,
        iqama_number: b.iqama_number, iqama_expiry: b.iqama_expiry,
        passport_number: b.passport_number, passport_expiry: b.passport_expiry,
        nationality: b.nationality, photo_url: b.photo_url,
        documents: b.documents !== undefined ? JSON.stringify(b.documents) : undefined,
        salary: b.salary != null ? parseFloat(b.salary) : undefined,
        hire_date: b.hire_date,
        is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
      };
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) return res.json({ staff: decorate(own.staff) });
      vals.push(id);
      await db.query(`UPDATE camp_staff SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM camp_staff WHERE id=$1', [id]);
      auditLog(req, 'update_staff', 'camp_staff', id);
      res.json({ staff: decorate(after[0]) });
    } catch (e) { next(e); }
  }
);

// ─── DELETE (soft if has attendance / payroll, hard otherwise) ───
router.delete('/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const own = await assertStaffOwner(req, id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });

    const { rows: att } = await db.query('SELECT COUNT(*) AS c FROM staff_attendance WHERE staff_id=$1', [id]);
    const { rows: pay } = await db.query('SELECT COUNT(*) AS c FROM payroll_records WHERE staff_id=$1', [id]);
    const hasRecords = parseInt(att[0].c, 10) > 0 || parseInt(pay[0].c, 10) > 0;

    if (hasRecords) {
      await db.query('UPDATE camp_staff SET is_active=0 WHERE id=$1', [id]);
      auditLog(req, 'soft_delete_staff', 'camp_staff', id);
      return res.json({ ok: true, soft: true, reason: 'has attendance or payroll records' });
    }
    await db.query('DELETE FROM camp_staff WHERE id=$1', [id]);
    auditLog(req, 'delete_staff', 'camp_staff', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── PHOTO UPLOAD ───
router.post('/:id/photo',
  authRequired, requireRole('owner', 'admin'),
  photoUploader.single('photo'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const own = await assertStaffOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const rel = path.join('staff', req.file.filename).replace(/\\/g, '/');
      const url = publicUrl(req, rel);
      await db.query('UPDATE camp_staff SET photo_url=$1 WHERE id=$2', [url, id]);
      res.json({ ok: true, photo_url: url });
    } catch (e) { next(e); }
  }
);

// ─── ATTENDANCE ───
router.post('/attendance',
  authRequired, requireRole('owner', 'admin'),
  [
    body('staff_id').isInt({ min: 1 }),
    body('date').isString().notEmpty(),
    body('check_in_time').optional().isString(),
    body('check_out_time').optional().isString(),
    body('status').optional().isIn(ATT_STATUSES),
    body('hours_worked').optional().isFloat({ min: 0, max: 24 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const own = await assertStaffOwner(req, req.body.staff_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      // Upsert on (staff, date)
      const { rows: ex } = await db.query(
        `SELECT id FROM staff_attendance WHERE staff_id=$1 AND date=$2 LIMIT 1`,
        [req.body.staff_id, req.body.date]
      );

      const b = req.body;
      if (ex[0]) {
        const fields = {
          check_in_time: b.check_in_time, check_out_time: b.check_out_time,
          status: b.status, notes: b.notes,
          hours_worked: b.hours_worked != null ? parseFloat(b.hours_worked) : undefined,
        };
        const sets = []; const vals = [];
        for (const [k, v] of Object.entries(fields)) {
          if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
        }
        if (sets.length) {
          vals.push(ex[0].id);
          await db.query(`UPDATE staff_attendance SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
        }
        const { rows: row } = await db.query('SELECT * FROM staff_attendance WHERE id=$1', [ex[0].id]);
        return res.json({ attendance: row[0], updated: true });
      }

      const { rows } = await db.query(
        `INSERT INTO staff_attendance
           (staff_id, camp_id, date, check_in_time, check_out_time, hours_worked, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          b.staff_id, own.staff.camp_id, b.date,
          b.check_in_time || null, b.check_out_time || null,
          parseFloat(b.hours_worked || 0),
          b.status || 'present', b.notes || null,
        ]
      );
      auditLog(req, 'staff_attendance', 'staff_attendance', rows[0].id);
      res.status(201).json({ attendance: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/:id/attendance',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const own = await assertStaffOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const start = req.query.start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      const { rows } = await db.query(
        `SELECT * FROM staff_attendance WHERE staff_id=$1 AND date >= $2 AND date <= $3
         ORDER BY date DESC`, [id, start, end]
      );
      const summary = {
        total: rows.length,
        by_status: {},
        total_hours: 0,
      };
      for (const r of rows) {
        summary.by_status[r.status] = (summary.by_status[r.status] || 0) + 1;
        summary.total_hours += parseFloat(r.hours_worked || 0);
      }
      summary.total_hours = Math.round(summary.total_hours * 10) / 10;
      res.json({ attendance: rows, summary, range: { start, end } });
    } catch (e) { next(e); }
  }
);

router.get('/attendance/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const start = req.query.start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      const { rows } = await db.query(
        `SELECT sa.*, s.full_name AS staff_name, s.role
         FROM staff_attendance sa JOIN camp_staff s ON s.id=sa.staff_id
         WHERE sa.camp_id=$1 AND sa.date >= $2 AND sa.date <= $3
         ORDER BY sa.date DESC, s.full_name ASC LIMIT 500`,
        [campId, start, end]
      );
      res.json({ attendance: rows, range: { start, end } });
    } catch (e) { next(e); }
  }
);

// ─── SHIFTS ───
router.post('/shifts',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('shift_name').isString().notEmpty(),
    body('start_time').isString().notEmpty(),
    body('end_time').isString().notEmpty(),
    body('days').optional().isArray(),
    body('staff_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const days = Array.isArray(req.body.days)
        ? req.body.days.map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d))
        : [];

      const { rows } = await db.query(
        `INSERT INTO staff_shifts (camp_id, staff_id, shift_name, start_time, end_time, days)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          req.body.camp_id, req.body.staff_id || null,
          req.body.shift_name, req.body.start_time, req.body.end_time,
          JSON.stringify(days),
        ]
      );
      auditLog(req, 'create_shift', 'staff_shifts', rows[0].id);
      res.status(201).json({ shift: decorateShift(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get('/shifts/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      const { rows } = await db.query(
        `SELECT sh.*, s.full_name AS staff_name FROM staff_shifts sh
         LEFT JOIN camp_staff s ON s.id=sh.staff_id
         WHERE sh.camp_id=$1 ORDER BY sh.start_time ASC`, [campId]
      );
      res.json({ shifts: rows.map(decorateShift) });
    } catch (e) { next(e); }
  }
);

router.put('/shifts/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM staff_shifts WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Shift not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const fields = {
        shift_name: b.shift_name, start_time: b.start_time, end_time: b.end_time,
        staff_id: b.staff_id !== undefined ? (b.staff_id || null) : undefined,
        days: b.days !== undefined
          ? JSON.stringify((b.days || []).map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d)))
          : undefined,
      };
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) {
        const { rows } = await db.query('SELECT * FROM staff_shifts WHERE id=$1', [id]);
        return res.json({ shift: decorateShift(rows[0]) });
      }
      vals.push(id);
      await db.query(`UPDATE staff_shifts SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM staff_shifts WHERE id=$1', [id]);
      auditLog(req, 'update_shift', 'staff_shifts', id);
      res.json({ shift: decorateShift(after[0]) });
    } catch (e) { next(e); }
  }
);

router.delete('/shifts/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM staff_shifts WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Shift not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      await db.query('DELETE FROM staff_shifts WHERE id=$1', [id]);
      auditLog(req, 'delete_shift', 'staff_shifts', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

module.exports = router;
module.exports.ROLES = ROLES;
