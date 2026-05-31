/**
 * Equipment routes — Stage 2 (rental marketplace)
 *   GET    /api/equipment                       — search/list
 *   GET    /api/equipment/categories            — category list
 *   GET    /api/equipment/:id                   — detail
 *   POST   /api/equipment                       — owner creates
 *   PUT    /api/equipment/:id                   — owner updates
 *   DELETE /api/equipment/:id                   — owner deletes
 *   POST   /api/equipment/:id/photos            — owner uploads photos
 *   POST   /api/equipment/bookings              — client books equipment
 *   GET    /api/equipment/bookings/my           — my equipment bookings
 *   PUT    /api/equipment/bookings/:id/status   — owner updates status
 */
const express = require('express');
const path = require('path');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth');
const { makeUploader, publicUrl } = require('../middleware/upload');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');
const { EQUIPMENT_CATEGORIES } = require('../config/constants');

const router = express.Router();
const photoUploader = makeUploader('equipment', { maxSizeMB: 5 });

function parseJSON(v, fb = null) { if (v == null) return fb; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return fb; } }
function decorate(r) {
  if (!r) return r;
  return {
    ...r,
    specifications: parseJSON(r.specifications, {}),
    photos: parseJSON(r.photos, []),
    operator_included: !!r.operator_included,
    delivery_available: !!r.delivery_available,
    is_active: !!r.is_active,
  };
}

// ============ CATEGORIES ============
router.get('/categories', (_req, res) => res.json({ categories: EQUIPMENT_CATEGORIES }));

// ============ LIST / SEARCH ============
router.get('/', async (req, res, next) => {
  try {
    const { q, category, city, status, min_price, max_price, page = 1, limit = 12 } = req.query;
    const where = ['is_active = 1']; const params = [];
    const add = (clause, val) => { params.push(val); where.push(clause.replace('?', `$${params.length}`)); };

    if (q) {
      params.push(`%${q.toLowerCase()}%`); params.push(`%${q.toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length - 1} OR LOWER(description) LIKE $${params.length})`);
    }
    if (category) add('category = ?', category);
    if (city) add('city = ?', city);
    if (status) add('status = ?', status);
    if (min_price) add('daily_rate >= ?', parseFloat(min_price));
    if (max_price) add('daily_rate <= ?', parseFloat(max_price));

    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * lim;

    const { rows } = await db.query(
      `SELECT * FROM equipment WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    const { rows: c } = await db.query(`SELECT COUNT(*) AS c FROM equipment WHERE ${where.join(' AND ')}`, params);
    const total = parseInt(c[0].c || c[0].C || 0, 10);
    res.json({ equipment: rows.map(decorate), total, page: +page, total_pages: Math.ceil(total / lim) });
  } catch (e) { next(e); }
});

// ============ MY EQUIPMENT BOOKINGS (must come before /:id) ============
router.get('/bookings/my', authRequired, async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'owner') {
      sql = `SELECT eb.*, e.name AS equipment_name, e.category, u.full_name AS client_name
             FROM equipment_bookings eb
             JOIN equipment e ON e.id = eb.equipment_id
             JOIN users u ON u.id = eb.client_id
             WHERE e.owner_id = $1 ORDER BY eb.created_at DESC`;
      params = [req.user.id];
    } else if (req.user.role === 'admin') {
      sql = `SELECT eb.*, e.name AS equipment_name, e.category FROM equipment_bookings eb
             JOIN equipment e ON e.id = eb.equipment_id ORDER BY eb.created_at DESC LIMIT 500`;
      params = [];
    } else {
      sql = `SELECT eb.*, e.name AS equipment_name, e.category, e.city
             FROM equipment_bookings eb JOIN equipment e ON e.id = eb.equipment_id
             WHERE eb.client_id = $1 ORDER BY eb.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ============ DETAIL ============
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM equipment WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Equipment not found' });
    const { rows: owner } = await db.query(
      `SELECT u.full_name, op.company_name FROM users u
       LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [rows[0].owner_id]
    );
    res.json({ equipment: decorate(rows[0]), owner: owner[0] || null });
  } catch (e) { next(e); }
});

// ============ CREATE ============
router.post(
  '/',
  authRequired,
  requireRole('owner', 'provider', 'admin'),
  [
    body('name').isString().notEmpty(),
    body('category').isIn(EQUIPMENT_CATEGORIES),
    body('daily_rate').isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO equipment (owner_id, category, name, model, manufacturer, description,
                                specifications, photos, daily_rate, weekly_rate, monthly_rate,
                                city, gps_tracker_id, fuel_type, fuel_consumption,
                                operator_included, delivery_available, delivery_charge,
                                status, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'available',1) RETURNING *`,
        [
          req.user.id, b.category, b.name, b.model || '', b.manufacturer || '', b.description || '',
          JSON.stringify(b.specifications || {}), JSON.stringify(b.photos || []),
          parseFloat(b.daily_rate), parseFloat(b.weekly_rate || b.daily_rate * 6),
          parseFloat(b.monthly_rate || b.daily_rate * 24),
          b.city || '', b.gps_tracker_id || '', b.fuel_type || '', b.fuel_consumption || '',
          b.operator_included ? 1 : 0, b.delivery_available ? 1 : 0,
          parseFloat(b.delivery_charge || 0),
        ]
      );
      auditLog(req, 'create_equipment', 'equipment', rows[0].id);
      res.status(201).json({ equipment: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

// ============ UPDATE ============
router.put('/:id', authRequired, requireRole('owner', 'provider', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM equipment WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Equipment not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your equipment' });
    }
    const b = req.body;
    const fields = {
      category: b.category, name: b.name, model: b.model, manufacturer: b.manufacturer, description: b.description,
      specifications: b.specifications !== undefined ? JSON.stringify(b.specifications) : undefined,
      photos: b.photos !== undefined ? JSON.stringify(b.photos) : undefined,
      daily_rate: b.daily_rate != null ? parseFloat(b.daily_rate) : undefined,
      weekly_rate: b.weekly_rate != null ? parseFloat(b.weekly_rate) : undefined,
      monthly_rate: b.monthly_rate != null ? parseFloat(b.monthly_rate) : undefined,
      city: b.city, gps_tracker_id: b.gps_tracker_id, fuel_type: b.fuel_type, fuel_consumption: b.fuel_consumption,
      operator_included: b.operator_included != null ? (b.operator_included ? 1 : 0) : undefined,
      delivery_available: b.delivery_available != null ? (b.delivery_available ? 1 : 0) : undefined,
      delivery_charge: b.delivery_charge != null ? parseFloat(b.delivery_charge) : undefined,
      status: b.status, is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return res.json({ equipment: decorate(cur[0]) });
    vals.push(id);
    await db.query(`UPDATE equipment SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM equipment WHERE id = $1', [id]);
    auditLog(req, 'update_equipment', 'equipment', id);
    res.json({ equipment: decorate(after[0]) });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, requireRole('owner', 'provider', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT owner_id FROM equipment WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Equipment not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your equipment' });
    }
    await db.query('DELETE FROM equipment WHERE id = $1', [id]);
    auditLog(req, 'delete_equipment', 'equipment', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============ PHOTOS ============
router.post(
  '/:id/photos',
  authRequired,
  requireRole('owner', 'provider', 'admin'),
  photoUploader.array('photos', 6),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT * FROM equipment WHERE id = $1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Equipment not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your equipment' });
      }
      if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

      const existing = parseJSON(cur[0].photos, []);
      const added = req.files.map((f) => publicUrl(req, path.join('equipment', f.filename).replace(/\\/g, '/')));
      const merged = [...existing, ...added];
      await db.query('UPDATE equipment SET photos = $1 WHERE id = $2', [JSON.stringify(merged), id]);
      auditLog(req, 'upload_equipment_photos', 'equipment', id, { count: added.length });
      res.status(201).json({ photos: merged });
    } catch (e) { next(e); }
  }
);

// ============ EQUIPMENT BOOKING ============
router.post(
  '/bookings',
  authRequired,
  [
    body('equipment_id').isInt({ min: 1 }),
    body('start_date').isString().notEmpty(),
    body('end_date').isString().notEmpty(),
    body('rental_type').optional().isIn(['daily', 'weekly', 'monthly']),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { equipment_id, start_date, end_date, rental_type = 'daily', operator_assigned } = req.body;
      const { rows } = await db.query('SELECT * FROM equipment WHERE id = $1', [equipment_id]);
      const eq = rows[0];
      if (!eq) return res.status(404).json({ error: 'Equipment not found' });
      if (eq.status !== 'available') return res.status(400).json({ error: 'Equipment not available' });

      const days = Math.max(1, Math.ceil((new Date(end_date) - new Date(start_date)) / 86400000));
      let total = 0;
      if (rental_type === 'monthly') total = eq.monthly_rate * Math.max(1, Math.ceil(days / 28));
      else if (rental_type === 'weekly') total = eq.weekly_rate * Math.max(1, Math.ceil(days / 7));
      else total = eq.daily_rate * days;

      const codeStr = `EQ-${Date.now().toString(36).slice(-4).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;
      const { rows: ins } = await db.query(
        `INSERT INTO equipment_bookings (booking_code, equipment_id, client_id, start_date, end_date,
                                         rental_type, total_amount, operator_assigned, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING *`,
        [codeStr, equipment_id, req.user.id, start_date, end_date, rental_type, total, operator_assigned ? 1 : 0]
      );
      notify(eq.owner_id, {
        type: 'equipment_request',
        title: `New equipment booking — ${codeStr}`,
        body: `${eq.name} — ${start_date} to ${end_date}`,
        link: `/owner/equipment/${equipment_id}`,
      });
      auditLog(req, 'create_equipment_booking', 'equipment_booking', ins[0].id);
      res.status(201).json({ booking: ins[0], days, total });
    } catch (e) { next(e); }
  }
);

router.put(
  '/bookings/:id/status',
  authRequired,
  requireRole('owner', 'provider', 'admin'),
  [body('status').isIn(['confirmed', 'rejected', 'in_use', 'returned', 'cancelled'])],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT eb.*, e.owner_id FROM equipment_bookings eb JOIN equipment e ON e.id = eb.equipment_id WHERE eb.id = $1`,
        [id]
      );
      const b = rows[0];
      if (!b) return res.status(404).json({ error: 'Booking not found' });
      if (req.user.role !== 'admin' && b.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your equipment' });
      }
      await db.query('UPDATE equipment_bookings SET status = $1 WHERE id = $2', [req.body.status, id]);

      // Sync equipment availability
      if (req.body.status === 'in_use') {
        await db.query("UPDATE equipment SET status = 'rented' WHERE id = $1", [b.equipment_id]);
      } else if (req.body.status === 'returned' || req.body.status === 'cancelled' || req.body.status === 'rejected') {
        await db.query("UPDATE equipment SET status = 'available' WHERE id = $1", [b.equipment_id]);
      }
      notify(b.client_id, {
        type: 'equipment_status', title: `Equipment booking ${req.body.status}`,
        body: b.booking_code, link: `/worker/equipment-bookings`,
      });
      auditLog(req, `equipment_booking_${req.body.status}`, 'equipment_booking', id);
      res.json({ ok: true, status: req.body.status });
    } catch (e) { next(e); }
  }
);

module.exports = router;
