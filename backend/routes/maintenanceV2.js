/**
 * Maintenance enhancements (H7).
 *
 * Builds on existing `maintenance_requests` table (v1 schema) — extended
 * with `assigned_to`, `parts_cost`, `labor_cost`, `photo_urls`,
 * `resolved_at`, `verified_at` via Piece 13 ALTERs.
 *
 *   POST   /                    — worker creates request
 *   GET    /camp/:campId        — owner sees requests for camp
 *   GET    /mine                — worker's requests
 *   GET    /reports             — SLA + cost reports (per camp / platform)
 *   PUT    /:id/assign          — owner assigns to staff
 *   PUT    /:id/status          — owner updates status
 *   POST   /:id/cost            — add parts + labor cost
 *   POST   /:id/close           — worker verifies resolved
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const PRIORITIES = ['low', 'medium', 'high', 'emergency'];
const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'verified', 'closed'];

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

function decorate(r) {
  if (!r) return r;
  return { ...r, photo_urls: parseJSON(r.photo_urls, []) };
}

// ─── CREATE (worker) ───
router.post('/',
  authRequired,
  [
    body('camp_id').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 3, max: 200 }),
    body('description').isString().isLength({ min: 5, max: 2000 }),
    body('room_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('priority').optional().isIn(PRIORITIES),
    body('photo_urls').optional().isArray(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;

      const { rows } = await db.query(
        `INSERT INTO maintenance_requests
           (camp_id, room_id, worker_id, title, description, priority, status, photo_urls)
         VALUES ($1,$2,$3,$4,$5,$6,'open',$7) RETURNING *`,
        [
          b.camp_id, b.room_id || null, req.user.id,
          b.title, b.description, b.priority || 'medium',
          JSON.stringify(b.photo_urls || []),
        ]
      );
      // Notify owner
      const { rows: c } = await db.query('SELECT owner_id, name FROM camps WHERE id=$1', [b.camp_id]);
      if (c[0]) {
        notify(c[0].owner_id, {
          type: 'maintenance_new', title: `🔧 New ${b.priority || 'medium'} maintenance — ${c[0].name}`,
          body: b.title, link: '/owner/maintenance',
        });
      }
      auditLog(req, 'create_maintenance', 'maintenance_requests', rows[0].id);
      res.status(201).json({ request: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

// ─── LIST: per camp ───
router.get('/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      if (req.user.role !== 'admin') {
        const { rows: c } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
        if (!c[0]) return res.status(404).json({ error: 'Camp not found' });
        if (c[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
      }
      const { rows } = await db.query(
        `SELECT m.*, u.full_name AS worker_name, a.full_name AS assigned_name,
                r.name AS room_name
         FROM maintenance_requests m
         LEFT JOIN users u ON u.id = m.worker_id
         LEFT JOIN users a ON a.id = m.assigned_to
         LEFT JOIN rooms r ON r.id = m.room_id
         WHERE m.camp_id=$1
         ORDER BY
           CASE m.priority WHEN 'emergency' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           m.created_at DESC LIMIT 200`, [campId]
      );
      res.json({ requests: rows.map(decorate) });
    } catch (e) { next(e); }
  }
);

// ─── LIST: mine ───
router.get('/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT m.*, c.name AS camp_name, r.name AS room_name, a.full_name AS assigned_name
       FROM maintenance_requests m
       LEFT JOIN camps c ON c.id = m.camp_id
       LEFT JOIN rooms r ON r.id = m.room_id
       LEFT JOIN users a ON a.id = m.assigned_to
       WHERE m.worker_id=$1 ORDER BY m.created_at DESC LIMIT 100`, [req.user.id]
    );
    res.json({ requests: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── DETAIL ───
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT m.*, c.owner_id, c.name AS camp_name, u.full_name AS worker_name,
              a.full_name AS assigned_name, r.name AS room_name
       FROM maintenance_requests m
       LEFT JOIN camps c ON c.id = m.camp_id
       LEFT JOIN users u ON u.id = m.worker_id
       LEFT JOIN users a ON a.id = m.assigned_to
       LEFT JOIN rooms r ON r.id = m.room_id
       WHERE m.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
    const r = rows[0];
    const allowed = req.user.role === 'admin' || r.worker_id === req.user.id ||
                    r.owner_id === req.user.id || r.assigned_to === req.user.id;
    if (!allowed) return res.status(403).json({ error: 'Not authorized' });
    res.json({ request: decorate(r) });
  } catch (e) { next(e); }
});

// ─── ASSIGN ───
router.put('/:id/assign',
  authRequired, requireRole('owner', 'admin'),
  [body('assigned_to').isInt({ min: 1 })],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT m.*, c.owner_id FROM maintenance_requests m
         JOIN camps c ON c.id = m.camp_id WHERE m.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      await db.query(
        `UPDATE maintenance_requests SET assigned_to=$1,
           status=CASE WHEN status='open' THEN 'assigned' ELSE status END WHERE id=$2`,
        [parseInt(req.body.assigned_to, 10), id]
      );
      notify(parseInt(req.body.assigned_to, 10), {
        type: 'maintenance_assigned',
        title: 'Maintenance task assigned to you', body: rows[0].title,
        link: '/owner/maintenance',
      });
      auditLog(req, 'maintenance_assigned', 'maintenance_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── STATUS ───
router.put('/:id/status',
  authRequired,
  [body('status').isIn(STATUSES)],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT m.*, c.owner_id FROM maintenance_requests m
         JOIN camps c ON c.id = m.camp_id WHERE m.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      const r = rows[0];
      const allowed = req.user.role === 'admin' || r.owner_id === req.user.id || r.assigned_to === req.user.id;
      if (!allowed) return res.status(403).json({ error: 'Not authorized' });

      const sets = []; const vals = [];
      vals.push(req.body.status); sets.push(`status=$${vals.length}`);
      if (req.body.status === 'resolved') {
        vals.push(new Date().toISOString()); sets.push(`resolved_at=$${vals.length}`);
      }
      vals.push(id);
      await db.query(`UPDATE maintenance_requests SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      notify(r.worker_id, {
        type: 'maintenance_status',
        title: `Maintenance request ${req.body.status.replace('_', ' ')}`,
        body: r.title, link: '/worker/maintenance',
      });
      auditLog(req, `maintenance_${req.body.status}`, 'maintenance_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── ADD COST ───
router.post('/:id/cost',
  authRequired, requireRole('owner', 'admin'),
  [
    body('parts_cost').optional().isFloat({ min: 0 }),
    body('labor_cost').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT m.*, c.owner_id FROM maintenance_requests m
         JOIN camps c ON c.id=m.camp_id WHERE m.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      const newParts = parseFloat(rows[0].parts_cost || 0) + parseFloat(req.body.parts_cost || 0);
      const newLabor = parseFloat(rows[0].labor_cost || 0) + parseFloat(req.body.labor_cost || 0);
      await db.query(
        `UPDATE maintenance_requests SET parts_cost=$1, labor_cost=$2 WHERE id=$3`,
        [Math.round(newParts * 100) / 100, Math.round(newLabor * 100) / 100, id]
      );
      auditLog(req, 'maintenance_cost_added', 'maintenance_requests', id);
      res.json({ ok: true, parts_cost: newParts, labor_cost: newLabor, total: newParts + newLabor });
    } catch (e) { next(e); }
  }
);

// ─── CLOSE (worker verifies fix) ───
router.post('/:id/close',
  authRequired,
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query('SELECT * FROM maintenance_requests WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (req.user.role !== 'admin' && rows[0].worker_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your request' });
      }
      if (rows[0].status !== 'resolved') {
        return res.status(400).json({ error: 'Can only verify resolved requests' });
      }
      await db.query(
        `UPDATE maintenance_requests SET status='verified', verified_at=$1 WHERE id=$2`,
        [new Date().toISOString(), id]
      );
      auditLog(req, 'maintenance_verified', 'maintenance_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── REPORTS ───
router.get('/reports/all', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.user.role !== 'admin') {
      // Owner: only own camps
      params.push(req.user.id);
      where.push(`c.owner_id=$${params.length}`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    // SLA (avg hours to resolve, by priority)
    const hoursExpr = db.driver === 'postgres'
      ? `EXTRACT(EPOCH FROM (m.resolved_at::timestamp - m.created_at::timestamp))/3600`
      : `(julianday(m.resolved_at) - julianday(m.created_at)) * 24`;
    const { rows: sla } = await db.query(
      `SELECT m.priority,
              COUNT(*) AS total,
              SUM(CASE WHEN m.status IN ('resolved','verified','closed') THEN 1 ELSE 0 END) AS resolved,
              AVG(CASE WHEN m.resolved_at IS NOT NULL THEN ${hoursExpr} END) AS avg_hours,
              COALESCE(SUM(m.parts_cost),0) AS total_parts,
              COALESCE(SUM(m.labor_cost),0) AS total_labor
       FROM maintenance_requests m
       JOIN camps c ON c.id = m.camp_id
       ${whereSql} GROUP BY m.priority`
    );
    const out = sla.map((r) => ({
      priority: r.priority,
      total: parseInt(r.total, 10),
      resolved: parseInt(r.resolved, 10),
      avg_hours: r.avg_hours != null ? Math.round(parseFloat(r.avg_hours) * 10) / 10 : null,
      total_parts: Math.round(parseFloat(r.total_parts) * 100) / 100,
      total_labor: Math.round(parseFloat(r.total_labor) * 100) / 100,
      total_cost: Math.round((parseFloat(r.total_parts) + parseFloat(r.total_labor)) * 100) / 100,
    }));
    res.json({ by_priority: out });
  } catch (e) { next(e); }
});

module.exports = router;
