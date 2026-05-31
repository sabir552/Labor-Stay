/**
 * Catering module (B3).
 *
 * Tables used (from Piece 13 v2 schema):
 *   catering_menus      — daily menu items per camp / meal type
 *   meal_attendance     — per-worker per-day per-meal attendance log
 *   catering_packages   — meal plans (breakfast/lunch/dinner combos) per camp
 *   catering_orders     — worker subscription to a catering package
 *
 * Endpoints
 *   POST   /menu                — owner sets menu (one row per meal_type+date)
 *   GET    /menu/:campId        — get menu for the week (default today..+7)
 *   PUT    /menu/:id            — update menu item
 *   DELETE /menu/:id            — remove menu item
 *
 *   POST   /attendance          — record attendance (owner/staff)
 *   GET    /attendance/:campId  — attendance report (filterable)
 *
 *   POST   /packages            — create meal package
 *   GET    /packages/:campId    — list packages for a camp
 *   PUT    /packages/:id        — update package
 *   DELETE /packages/:id        — remove package
 *
 *   POST   /orders              — worker places catering order (subscribe)
 *   GET    /orders              — role-aware list (worker → mine; owner → camp; admin → all)
 *   GET    /orders/mine         — worker's own orders
 *   PUT    /orders/:id/status   — owner approves/cancels
 *   DELETE /orders/:id          — worker cancels their own pending order
 *
 *   GET    /reports/:campId     — owner consumption + cost report
 *   GET    /reports/admin       — admin platform-wide report
 */
const express = require('express');
const { body, query, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

// ---------- helpers ----------
function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}
function decorateMenu(row) {
  if (!row) return row;
  return {
    ...row,
    items: parseJSON(row.items, []),
    dietary_options: parseJSON(row.dietary_options, []),
  };
}
function decoratePackage(row) {
  if (!row) return row;
  return {
    ...row,
    includes_breakfast: !!row.includes_breakfast,
    includes_lunch: !!row.includes_lunch,
    includes_dinner: !!row.includes_dinner,
    is_active: !!row.is_active,
  };
}

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

// ============ MENU ============
router.post(
  '/menu',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('date').isString().notEmpty().withMessage('date YYYY-MM-DD required'),
    body('meal_type').isIn(MEAL_TYPES),
    body('items').optional().isArray(),
    body('dietary_options').optional().isArray(),
    body('cost_per_person').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      // Upsert: one row per (camp, date, meal_type). If exists, overwrite.
      const { rows: existing } = await db.query(
        'SELECT id FROM catering_menus WHERE camp_id=$1 AND date=$2 AND meal_type=$3',
        [req.body.camp_id, req.body.date, req.body.meal_type]
      );
      if (existing[0]) {
        await db.query(
          `UPDATE catering_menus SET items=$1, dietary_options=$2, cost_per_person=$3
           WHERE id=$4`,
          [
            JSON.stringify(req.body.items || []),
            JSON.stringify(req.body.dietary_options || []),
            parseFloat(req.body.cost_per_person || 0),
            existing[0].id,
          ]
        );
        const { rows } = await db.query('SELECT * FROM catering_menus WHERE id=$1', [existing[0].id]);
        auditLog(req, 'update_menu', 'catering_menus', existing[0].id);
        return res.json({ menu: decorateMenu(rows[0]), updated: true });
      }

      const { rows } = await db.query(
        `INSERT INTO catering_menus (camp_id, date, meal_type, items, dietary_options, cost_per_person)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          req.body.camp_id, req.body.date, req.body.meal_type,
          JSON.stringify(req.body.items || []),
          JSON.stringify(req.body.dietary_options || []),
          parseFloat(req.body.cost_per_person || 0),
        ]
      );
      auditLog(req, 'create_menu', 'catering_menus', rows[0].id);
      res.status(201).json({ menu: decorateMenu(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get(
  '/menu/:campId',
  authRequired,
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      // Default range: today → today + 7 days
      const start = req.query.start || new Date().toISOString().slice(0, 10);
      const endD = new Date(start);
      endD.setDate(endD.getDate() + 7);
      const end = req.query.end || endD.toISOString().slice(0, 10);

      const { rows } = await db.query(
        `SELECT * FROM catering_menus
         WHERE camp_id=$1 AND date >= $2 AND date <= $3
         ORDER BY date ASC, meal_type ASC`,
        [campId, start, end]
      );
      res.json({ menu: rows.map(decorateMenu), range: { start, end } });
    } catch (e) { next(e); }
  }
);

router.put(
  '/menu/:id',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT * FROM catering_menus WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Menu item not found' });

      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const fields = {
        items: req.body.items !== undefined ? JSON.stringify(req.body.items) : undefined,
        dietary_options: req.body.dietary_options !== undefined ? JSON.stringify(req.body.dietary_options) : undefined,
        cost_per_person: req.body.cost_per_person != null ? parseFloat(req.body.cost_per_person) : undefined,
      };
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) return res.json({ menu: decorateMenu(cur[0]) });
      vals.push(id);
      await db.query(`UPDATE catering_menus SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM catering_menus WHERE id=$1', [id]);
      auditLog(req, 'update_menu', 'catering_menus', id);
      res.json({ menu: decorateMenu(after[0]) });
    } catch (e) { next(e); }
  }
);

router.delete(
  '/menu/:id',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM catering_menus WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Menu item not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      await db.query('DELETE FROM catering_menus WHERE id=$1', [id]);
      auditLog(req, 'delete_menu', 'catering_menus', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ============ ATTENDANCE ============
router.post(
  '/attendance',
  authRequired,
  requireRole('owner', 'admin', 'worker'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('user_id').optional().isInt({ min: 1 }),
    body('booking_id').optional().isInt({ min: 1 }),
    body('date').isString().notEmpty(),
    body('meal_type').isIn(MEAL_TYPES),
    body('attended').optional().isBoolean(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      // Workers can only record their own attendance
      let userId = req.body.user_id;
      if (req.user.role === 'worker') userId = req.user.id;
      else if (!userId) return res.status(400).json({ error: 'user_id required for non-worker' });

      // Owners can only log for their own camp
      if (req.user.role === 'owner') {
        const own = await assertCampOwner(req, req.body.camp_id);
        if (!own.ok) return res.status(own.error).json({ error: own.message });
      }

      // De-dup on (user, date, meal_type) — upsert
      const { rows: ex } = await db.query(
        `SELECT id FROM meal_attendance
         WHERE user_id=$1 AND date=$2 AND meal_type=$3 LIMIT 1`,
        [userId, req.body.date, req.body.meal_type]
      );
      if (ex[0]) {
        await db.query(
          `UPDATE meal_attendance SET attended=$1, booking_id=COALESCE($2, booking_id), camp_id=$3 WHERE id=$4`,
          [req.body.attended === false ? 0 : 1, req.body.booking_id || null, req.body.camp_id, ex[0].id]
        );
        const { rows } = await db.query('SELECT * FROM meal_attendance WHERE id=$1', [ex[0].id]);
        return res.json({ attendance: rows[0], updated: true });
      }

      const { rows } = await db.query(
        `INSERT INTO meal_attendance (camp_id, user_id, booking_id, date, meal_type, attended)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          req.body.camp_id, userId, req.body.booking_id || null,
          req.body.date, req.body.meal_type,
          req.body.attended === false ? 0 : 1,
        ]
      );
      auditLog(req, 'record_attendance', 'meal_attendance', rows[0].id);
      res.status(201).json({ attendance: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get(
  '/attendance/:campId',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const start = req.query.start || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      const { rows } = await db.query(
        `SELECT ma.*, u.full_name AS worker_name
         FROM meal_attendance ma JOIN users u ON u.id=ma.user_id
         WHERE ma.camp_id=$1 AND ma.date >= $2 AND ma.date <= $3
         ORDER BY ma.date DESC, ma.meal_type ASC`,
        [campId, start, end]
      );

      // Summary aggregation
      const summary = { total: rows.length, by_meal: {}, by_date: {}, unique_workers: 0 };
      const workerSet = new Set();
      for (const r of rows) {
        if (r.attended) summary.by_meal[r.meal_type] = (summary.by_meal[r.meal_type] || 0) + 1;
        summary.by_date[r.date] = (summary.by_date[r.date] || 0) + (r.attended ? 1 : 0);
        workerSet.add(r.user_id);
      }
      summary.unique_workers = workerSet.size;

      res.json({ attendance: rows, summary, range: { start, end } });
    } catch (e) { next(e); }
  }
);

// ============ PACKAGES ============
router.post(
  '/packages',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('name').isString().notEmpty(),
    body('price_per_day').isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows } = await db.query(
        `INSERT INTO catering_packages (camp_id, name, description,
          includes_breakfast, includes_lunch, includes_dinner, price_per_day, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1) RETURNING *`,
        [
          req.body.camp_id, req.body.name, req.body.description || '',
          req.body.includes_breakfast ? 1 : 0,
          req.body.includes_lunch     ? 1 : 0,
          req.body.includes_dinner    ? 1 : 0,
          parseFloat(req.body.price_per_day),
        ]
      );
      auditLog(req, 'create_package', 'catering_packages', rows[0].id);
      res.status(201).json({ package: decoratePackage(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get('/packages/:campId', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM catering_packages WHERE camp_id=$1 ORDER BY price_per_day ASC`,
      [parseInt(req.params.campId, 10)]
    );
    res.json({ packages: rows.map(decoratePackage) });
  } catch (e) { next(e); }
});

router.put(
  '/packages/:id',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT * FROM catering_packages WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Package not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const fields = {
        name: b.name, description: b.description,
        includes_breakfast: b.includes_breakfast != null ? (b.includes_breakfast ? 1 : 0) : undefined,
        includes_lunch:     b.includes_lunch != null ? (b.includes_lunch ? 1 : 0) : undefined,
        includes_dinner:    b.includes_dinner != null ? (b.includes_dinner ? 1 : 0) : undefined,
        price_per_day:      b.price_per_day != null ? parseFloat(b.price_per_day) : undefined,
        is_active:          b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
      };
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) return res.json({ package: decoratePackage(cur[0]) });
      vals.push(id);
      await db.query(`UPDATE catering_packages SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM catering_packages WHERE id=$1', [id]);
      auditLog(req, 'update_package', 'catering_packages', id);
      res.json({ package: decoratePackage(after[0]) });
    } catch (e) { next(e); }
  }
);

router.delete(
  '/packages/:id',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM catering_packages WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Package not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      await db.query('DELETE FROM catering_packages WHERE id=$1', [id]);
      auditLog(req, 'delete_package', 'catering_packages', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ============ ORDERS ============
router.post(
  '/orders',
  authRequired,
  [
    body('camp_id').isInt({ min: 1 }),
    body('package_id').isInt({ min: 1 }),
    body('start_date').isString().notEmpty(),
    body('end_date').isString().notEmpty(),
    body('num_persons').optional().isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { rows: pkg } = await db.query(
        'SELECT * FROM catering_packages WHERE id=$1 AND camp_id=$2 AND is_active=1',
        [req.body.package_id, req.body.camp_id]
      );
      if (!pkg[0]) return res.status(404).json({ error: 'Package not found or inactive' });

      const days = Math.max(1, Math.ceil(
        (new Date(req.body.end_date) - new Date(req.body.start_date)) / 86400000
      ));
      const persons = parseInt(req.body.num_persons || 1, 10);
      const total = pkg[0].price_per_day * days * persons;

      const { rows } = await db.query(
        `INSERT INTO catering_orders (camp_id, ordered_by, package_id, start_date, end_date,
           num_persons, total_cost, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
        [
          req.body.camp_id, req.user.id, req.body.package_id,
          req.body.start_date, req.body.end_date, persons, total, req.body.notes || null,
        ]
      );

      // Notify owner
      const { rows: camp } = await db.query('SELECT owner_id, name FROM camps WHERE id=$1', [req.body.camp_id]);
      if (camp[0]) {
        notify(camp[0].owner_id, {
          type: 'catering_order',
          title: `New catering order — ${pkg[0].name}`,
          body: `${days} day(s) × ${persons} person(s) — total SAR ${total}.`,
          link: '/owner/catering',
        });
      }
      auditLog(req, 'create_catering_order', 'catering_orders', rows[0].id);
      res.status(201).json({ order: rows[0], days, total });
    } catch (e) { next(e); }
  }
);

router.get('/orders/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT o.*, p.name AS package_name, p.includes_breakfast, p.includes_lunch, p.includes_dinner,
              c.name AS camp_name, c.city
       FROM catering_orders o
       JOIN catering_packages p ON p.id=o.package_id
       JOIN camps c ON c.id=o.camp_id
       WHERE o.ordered_by=$1 ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

router.get('/orders', authRequired, async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'admin') {
      sql = `SELECT o.*, p.name AS package_name, c.name AS camp_name, u.full_name AS worker_name
             FROM catering_orders o
             JOIN catering_packages p ON p.id=o.package_id
             JOIN camps c ON c.id=o.camp_id
             JOIN users u ON u.id=o.ordered_by
             ORDER BY o.created_at DESC LIMIT 500`;
      params = [];
    } else if (req.user.role === 'owner') {
      sql = `SELECT o.*, p.name AS package_name, c.name AS camp_name, u.full_name AS worker_name
             FROM catering_orders o
             JOIN catering_packages p ON p.id=o.package_id
             JOIN camps c ON c.id=o.camp_id
             JOIN users u ON u.id=o.ordered_by
             WHERE c.owner_id=$1 ORDER BY o.created_at DESC`;
      params = [req.user.id];
    } else {
      sql = `SELECT o.*, p.name AS package_name, c.name AS camp_name
             FROM catering_orders o
             JOIN catering_packages p ON p.id=o.package_id
             JOIN camps c ON c.id=o.camp_id
             WHERE o.ordered_by=$1 ORDER BY o.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

router.put(
  '/orders/:id/status',
  authRequired,
  requireRole('owner', 'admin'),
  [body('status').isIn(['approved', 'rejected', 'completed', 'cancelled'])],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows: o } = await db.query(
        `SELECT o.*, c.owner_id, p.name AS package_name
         FROM catering_orders o JOIN camps c ON c.id=o.camp_id
         JOIN catering_packages p ON p.id=o.package_id WHERE o.id=$1`,
        [id]
      );
      if (!o[0]) return res.status(404).json({ error: 'Order not found' });
      if (req.user.role !== 'admin' && o[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      await db.query('UPDATE catering_orders SET status=$1 WHERE id=$2', [req.body.status, id]);
      notify(o[0].ordered_by, {
        type: 'catering_status',
        title: `Catering order ${req.body.status}`,
        body: o[0].package_name,
        link: '/worker/meal-plan',
      });
      auditLog(req, `catering_order_${req.body.status}`, 'catering_orders', id);
      res.json({ ok: true, status: req.body.status });
    } catch (e) { next(e); }
  }
);

router.delete('/orders/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM catering_orders WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    if (req.user.role !== 'admin' && rows[0].ordered_by !== req.user.id) {
      return res.status(403).json({ error: 'Not your order' });
    }
    if (rows[0].status !== 'pending' && req.user.role !== 'admin') {
      return res.status(400).json({ error: `Cannot cancel order in status ${rows[0].status}` });
    }
    await db.query("UPDATE catering_orders SET status='cancelled' WHERE id=$1", [id]);
    auditLog(req, 'cancel_catering_order', 'catering_orders', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============ REPORTS ============
router.get(
  '/reports/admin',
  authRequired,
  requireRole('admin'),
  async (_req, res, next) => {
    try {
      const { rows: camps } = await db.query(
        `SELECT c.id, c.name, c.city,
                (SELECT COUNT(*) FROM catering_menus     WHERE camp_id=c.id) AS menus,
                (SELECT COUNT(*) FROM catering_packages  WHERE camp_id=c.id) AS packages,
                (SELECT COUNT(*) FROM meal_attendance    WHERE camp_id=c.id AND attended=1) AS meals_served,
                (SELECT COALESCE(SUM(total_cost),0) FROM catering_orders
                   WHERE camp_id=c.id AND status IN ('approved','completed')) AS revenue
         FROM camps c ORDER BY revenue DESC LIMIT 100`
      );
      const totals = camps.reduce(
        (acc, c) => ({
          meals_served: acc.meals_served + parseInt(c.meals_served || 0, 10),
          revenue:      acc.revenue + parseFloat(c.revenue || 0),
          camps: acc.camps + (parseInt(c.menus || 0, 10) > 0 ? 1 : 0),
        }),
        { meals_served: 0, revenue: 0, camps: 0 }
      );
      res.json({ camps, totals });
    } catch (e) { next(e); }
  }
);

router.get(
  '/reports/:campId',
  authRequired,
  requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const start = req.query.start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      // Menu cost projection (sum of cost_per_person across menus in range)
      const { rows: menuRows } = await db.query(
        `SELECT meal_type, COUNT(*) AS days, COALESCE(SUM(cost_per_person),0) AS cost_pp
         FROM catering_menus WHERE camp_id=$1 AND date >= $2 AND date <= $3
         GROUP BY meal_type`,
        [campId, start, end]
      );

      // Actual attendance
      const { rows: attRows } = await db.query(
        `SELECT meal_type, COUNT(*) AS served
         FROM meal_attendance WHERE camp_id=$1 AND attended=1 AND date >= $2 AND date <= $3
         GROUP BY meal_type`,
        [campId, start, end]
      );

      // Orders revenue
      const { rows: ordRows } = await db.query(
        `SELECT status, COUNT(*) AS count, COALESCE(SUM(total_cost),0) AS revenue
         FROM catering_orders WHERE camp_id=$1 AND created_at >= $2 AND created_at <= $3
         GROUP BY status`,
        [campId, start + ' 00:00:00', end + ' 23:59:59']
      );

      const totalServed = attRows.reduce((s, r) => s + parseInt(r.served, 10), 0);
      const totalCostProjection = menuRows.reduce(
        (s, r) => s + parseFloat(r.cost_pp) * parseInt(r.days, 10), 0
      );
      const totalRevenue = ordRows.reduce((s, r) => s + parseFloat(r.revenue), 0);

      res.json({
        range: { start, end },
        summary: {
          meals_served: totalServed,
          cost_projection: Math.round(totalCostProjection * 100) / 100,
          revenue:         Math.round(totalRevenue * 100) / 100,
        },
        menu_by_meal: menuRows,
        attendance_by_meal: attRows,
        orders_by_status: ordRows,
      });
    } catch (e) { next(e); }
  }
);

module.exports = router;
