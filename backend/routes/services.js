/**
 * Services routes — Stage 3 (marketplace)
 *   GET    /api/services                     — list/search
 *   GET    /api/services/categories          — category list
 *   GET    /api/services/:id                 — detail
 *   POST   /api/services                     — provider creates
 *   PUT    /api/services/:id                 — provider updates
 *   DELETE /api/services/:id                 — provider deletes
 *   POST   /api/services/requests            — client submits RFQ
 *   GET    /api/services/requests/my         — my service requests
 *   PUT    /api/services/requests/:id/quote  — provider sends quote
 *   PUT    /api/services/requests/:id/status — update RFQ status
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');
const { SERVICE_CATEGORIES } = require('../config/constants');

const router = express.Router();

function parseJSON(v, fb = null) { if (v == null) return fb; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return fb; } }
function decorate(r) {
  if (!r) return r;
  return { ...r, photos: parseJSON(r.photos, []), is_active: !!r.is_active };
}

router.get('/categories', (_req, res) => res.json({ categories: SERVICE_CATEGORIES }));

router.get('/', async (req, res, next) => {
  try {
    const { q, category, city, min_rating, page = 1, limit = 12 } = req.query;
    const where = ['is_active = 1']; const params = [];
    const add = (clause, val) => { params.push(val); where.push(clause.replace('?', `$${params.length}`)); };

    if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`LOWER(name) LIKE $${params.length}`); }
    if (category) add('category = ?', category);
    if (city) add('city = ?', city);
    if (min_rating) add('rating >= ?', parseFloat(min_rating));

    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * lim;
    const { rows } = await db.query(
      `SELECT * FROM services WHERE ${where.join(' AND ')} ORDER BY rating DESC, id DESC LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    const { rows: c } = await db.query(`SELECT COUNT(*) AS c FROM services WHERE ${where.join(' AND ')}`, params);
    const total = parseInt(c[0].c || c[0].C || 0, 10);
    res.json({ services: rows.map(decorate), total, page: +page, total_pages: Math.ceil(total / lim) });
  } catch (e) { next(e); }
});

// MUST come before /:id
router.get('/requests/my', authRequired, async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'provider') {
      sql = `SELECT sr.*, s.name AS service_name, s.category, u.full_name AS client_name, u.email AS client_email
             FROM service_requests sr
             JOIN services s ON s.id = sr.service_id
             JOIN users u ON u.id = sr.client_id
             WHERE s.provider_id = $1 ORDER BY sr.created_at DESC`;
      params = [req.user.id];
    } else if (req.user.role === 'admin') {
      sql = `SELECT sr.*, s.name AS service_name, s.category FROM service_requests sr
             JOIN services s ON s.id = sr.service_id ORDER BY sr.created_at DESC LIMIT 500`;
      params = [];
    } else {
      sql = `SELECT sr.*, s.name AS service_name, s.category, s.city
             FROM service_requests sr JOIN services s ON s.id = sr.service_id
             WHERE sr.client_id = $1 ORDER BY sr.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ requests: rows });
  } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM services WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Service not found' });
    const { rows: prov } = await db.query(
      `SELECT u.full_name, u.phone, op.company_name FROM users u
       LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [rows[0].provider_id]
    );
    res.json({ service: decorate(rows[0]), provider: prov[0] || null });
  } catch (e) { next(e); }
});

router.post(
  '/',
  authRequired,
  requireRole('provider', 'owner', 'admin'),
  [body('category').isIn(SERVICE_CATEGORIES), body('name').isString().notEmpty(), body('base_price').isFloat({ min: 0 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO services (provider_id, category, name, description, pricing_type, base_price, city, photos, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1) RETURNING *`,
        [
          req.user.id, b.category, b.name, b.description || '',
          b.pricing_type || 'fixed', parseFloat(b.base_price), b.city || '',
          JSON.stringify(b.photos || []),
        ]
      );
      auditLog(req, 'create_service', 'service', rows[0].id);
      res.status(201).json({ service: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.put('/:id', authRequired, requireRole('provider', 'owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM services WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Service not found' });
    if (req.user.role !== 'admin' && cur[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your service' });
    }
    const b = req.body;
    const fields = {
      category: b.category, name: b.name, description: b.description,
      pricing_type: b.pricing_type, base_price: b.base_price != null ? parseFloat(b.base_price) : undefined,
      city: b.city, photos: b.photos !== undefined ? JSON.stringify(b.photos) : undefined,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return res.json({ service: decorate(cur[0]) });
    vals.push(id);
    await db.query(`UPDATE services SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM services WHERE id = $1', [id]);
    auditLog(req, 'update_service', 'service', id);
    res.json({ service: decorate(after[0]) });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, requireRole('provider', 'owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT provider_id FROM services WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Service not found' });
    if (req.user.role !== 'admin' && cur[0].provider_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your service' });
    }
    await db.query('DELETE FROM services WHERE id = $1', [id]);
    auditLog(req, 'delete_service', 'service', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============ RFQ ============
router.post(
  '/requests',
  authRequired,
  [body('service_id').isInt({ min: 1 }), body('description').isString().isLength({ min: 5 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { service_id, description, required_date, quantity = 1 } = req.body;
      const { rows: s } = await db.query('SELECT * FROM services WHERE id = $1', [service_id]);
      if (!s[0]) return res.status(404).json({ error: 'Service not found' });

      const codeStr = `RFQ-${Date.now().toString(36).slice(-4).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;
      const { rows } = await db.query(
        `INSERT INTO service_requests (request_code, client_id, service_id, description, required_date, quantity, status)
         VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
        [codeStr, req.user.id, service_id, description, required_date || null, parseInt(quantity, 10)]
      );
      notify(s[0].provider_id, {
        type: 'rfq', title: `New service request — ${codeStr}`,
        body: description.slice(0, 120), link: `/provider/requests/${rows[0].id}`,
      });
      auditLog(req, 'create_rfq', 'service_request', rows[0].id);
      res.status(201).json({ request: rows[0] });
    } catch (e) { next(e); }
  }
);

router.put(
  '/requests/:id/quote',
  authRequired,
  requireRole('provider', 'owner', 'admin'),
  [body('quoted_price').isFloat({ min: 0 })],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT sr.*, s.provider_id FROM service_requests sr JOIN services s ON s.id = sr.service_id WHERE sr.id = $1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (req.user.role !== 'admin' && rows[0].provider_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your service' });
      }
      await db.query(
        `UPDATE service_requests SET quoted_price = $1, status = 'quoted' WHERE id = $2`,
        [parseFloat(req.body.quoted_price), id]
      );
      notify(rows[0].client_id, {
        type: 'rfq_quoted', title: `Quote received — ${rows[0].request_code}`,
        body: `SAR ${req.body.quoted_price}`, link: `/worker/service-requests`,
      });
      auditLog(req, 'quote_rfq', 'service_request', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.put(
  '/requests/:id/status',
  authRequired,
  [body('status').isIn(['accepted', 'declined', 'completed', 'cancelled'])],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT sr.*, s.provider_id FROM service_requests sr JOIN services s ON s.id = sr.service_id WHERE sr.id = $1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      const { client_id, provider_id } = rows[0];
      if (req.user.role !== 'admin' && client_id !== req.user.id && provider_id !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      await db.query('UPDATE service_requests SET status = $1 WHERE id = $2', [req.body.status, id]);
      // Notify the other party
      const otherId = req.user.id === client_id ? provider_id : client_id;
      notify(otherId, {
        type: 'rfq_status', title: `Service request ${req.body.status}`,
        body: rows[0].request_code, link: `/messages`,
      });
      auditLog(req, `rfq_${req.body.status}`, 'service_request', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

module.exports = router;
