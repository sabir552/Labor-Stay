/**
 * Worker Service Requests (C1).
 *
 * Workers can submit 12 types of requests to the camp owner.
 * Distinct from the existing /api/services (marketplace) — that's about
 * external service providers selling services. THIS is a tenant-side
 * in-camp ticketing system.
 *
 * Table: worker_service_requests (created in Piece 13 v2 schema)
 *
 * Endpoints
 *   GET    /api/worker-requests/types       — list request types + metadata
 *   POST   /api/worker-requests             — worker submits request
 *   GET    /api/worker-requests/mine        — worker's requests
 *   GET    /api/worker-requests/camp/:campId — owner sees requests for a camp
 *   GET    /api/worker-requests/all         — admin sees all
 *   GET    /api/worker-requests/:id         — detail (any party in the request)
 *   PUT    /api/worker-requests/:id/status  — owner updates status + notes
 *   PUT    /api/worker-requests/:id/assign  — owner assigns to staff/user
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const REQUEST_TYPES = [
  { type: 'additional_bed',     label: 'Additional bed',           icon: '🛏️', category: 'accommodation' },
  { type: 'additional_room',    label: 'Additional / upgrade room', icon: '🚪', category: 'accommodation' },
  { type: 'maintenance',        label: 'Maintenance / repair',     icon: '🔧', category: 'facility' },
  { type: 'transportation',     label: 'Transportation pickup',    icon: '🚌', category: 'logistics' },
  { type: 'catering',           label: 'Catering / meal request',  icon: '🍽️', category: 'food' },
  { type: 'cleaning',           label: 'Room cleaning',            icon: '🧹', category: 'facility' },
  { type: 'laundry',            label: 'Laundry service',          icon: '👕', category: 'facility' },
  { type: 'visa_support',       label: 'Visa documentation help',  icon: '📄', category: 'admin' },
  { type: 'contract_extension', label: 'Contract extension',       icon: '📝', category: 'admin' },
  { type: 'emergency_support',  label: 'Emergency support',        icon: '🚨', category: 'emergency' },
  { type: 'noise_complaint',    label: 'Noise complaint',          icon: '🔊', category: 'complaint' },
  { type: 'facility_complaint', label: 'Facility complaint',       icon: '⚠️', category: 'complaint' },
];

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

function decorate(r) {
  if (!r) return r;
  return { ...r, attachment_urls: parseJSON(r.attachment_urls, []) };
}

// ─── Types catalog ───
router.get('/types', (_req, res) => {
  res.json({ types: REQUEST_TYPES });
});

// ─── CREATE ───
router.post(
  '/',
  authRequired,
  requireRole('worker', 'admin'),
  [
    body('request_type').isIn(REQUEST_TYPES.map((r) => r.type)),
    body('title').isString().isLength({ min: 3, max: 200 }),
    body('description').isString().isLength({ min: 5, max: 4000 }),
    body('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('booking_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('attachment_urls').optional().isArray(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      let campId = b.camp_id || null;

      // If a booking_id is supplied, derive camp_id from it.
      if (b.booking_id) {
        const { rows: bk } = await db.query(
          'SELECT camp_id, worker_id FROM bookings WHERE id=$1', [b.booking_id]
        );
        if (!bk[0]) return res.status(400).json({ error: 'Booking not found' });
        if (bk[0].worker_id !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Not your booking' });
        }
        campId = bk[0].camp_id;
      }

      const { rows } = await db.query(
        `INSERT INTO worker_service_requests
           (worker_id, camp_id, booking_id, request_type, title, description,
            priority, status, attachment_urls)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
        [
          req.user.id, campId, b.booking_id || null,
          b.request_type, b.title, b.description,
          b.priority || (b.request_type === 'emergency_support' ? 'emergency' : 'medium'),
          JSON.stringify(b.attachment_urls || []),
        ]
      );

      // Notify the camp owner (if camp known)
      if (campId) {
        const { rows: c } = await db.query('SELECT owner_id, name FROM camps WHERE id=$1', [campId]);
        if (c[0]) {
          const meta = REQUEST_TYPES.find((t) => t.type === b.request_type);
          notify(c[0].owner_id, {
            type: 'worker_request',
            title: `${meta?.icon || '📋'} New ${meta?.label || 'request'} — ${c[0].name}`,
            body: b.title,
            link: `/owner/requests`,
          });
        }
      }

      auditLog(req, 'create_worker_request', 'worker_service_requests', rows[0].id, {
        request_type: b.request_type, priority: rows[0].priority,
      });
      res.status(201).json({ request: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

// ─── WORKER: mine ───
router.get('/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT wsr.*, c.name AS camp_name, c.city,
              a.full_name AS assigned_to_name
       FROM worker_service_requests wsr
       LEFT JOIN camps c ON c.id = wsr.camp_id
       LEFT JOIN users a ON a.id = wsr.assigned_to
       WHERE wsr.worker_id = $1
       ORDER BY wsr.created_at DESC`,
      [req.user.id]
    );
    res.json({ requests: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── OWNER: per-camp ───
router.get('/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    if (req.user.role !== 'admin') {
      const { rows: c } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
      if (!c[0]) return res.status(404).json({ error: 'Camp not found' });
      if (c[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
    }

    const { rows } = await db.query(
      `SELECT wsr.*, u.full_name AS worker_name, u.phone AS worker_phone, u.email AS worker_email,
              c.name AS camp_name, a.full_name AS assigned_to_name
       FROM worker_service_requests wsr
       LEFT JOIN users u ON u.id = wsr.worker_id
       LEFT JOIN camps c ON c.id = wsr.camp_id
       LEFT JOIN users a ON a.id = wsr.assigned_to
       WHERE wsr.camp_id = $1
       ORDER BY
         CASE wsr.priority WHEN 'emergency' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         wsr.created_at DESC`,
      [campId]
    );
    res.json({ requests: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── ADMIN: all ───
router.get('/all', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const lim = Math.min(500, parseInt(req.query.limit || '200', 10));
    const where = []; const params = [];
    if (req.query.status) { params.push(req.query.status); where.push(`wsr.status=$${params.length}`); }
    if (req.query.priority) { params.push(req.query.priority); where.push(`wsr.priority=$${params.length}`); }
    if (req.query.request_type) { params.push(req.query.request_type); where.push(`wsr.request_type=$${params.length}`); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT wsr.*, u.full_name AS worker_name, c.name AS camp_name
       FROM worker_service_requests wsr
       LEFT JOIN users u ON u.id = wsr.worker_id
       LEFT JOIN camps c ON c.id = wsr.camp_id
       ${whereSql}
       ORDER BY wsr.created_at DESC LIMIT ${lim}`,
      params
    );
    res.json({ requests: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── DETAIL ───
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT wsr.*, u.full_name AS worker_name, u.email AS worker_email, u.phone AS worker_phone,
              c.name AS camp_name, c.owner_id, a.full_name AS assigned_to_name
       FROM worker_service_requests wsr
       LEFT JOIN users u ON u.id = wsr.worker_id
       LEFT JOIN camps c ON c.id = wsr.camp_id
       LEFT JOIN users a ON a.id = wsr.assigned_to
       WHERE wsr.id=$1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Request not found' });

    const r = rows[0];
    const isParty =
      req.user.role === 'admin' ||
      r.worker_id === req.user.id ||
      r.owner_id === req.user.id ||
      r.assigned_to === req.user.id;
    if (!isParty) return res.status(403).json({ error: 'Not authorized' });

    res.json({ request: decorate(r) });
  } catch (e) { next(e); }
});

// ─── STATUS UPDATE (owner / admin / assignee) ───
router.put(
  '/:id/status',
  authRequired,
  [
    body('status').isIn(['pending', 'in_progress', 'resolved', 'rejected']),
    body('response_notes').optional().isString().isLength({ max: 4000 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT wsr.*, c.owner_id FROM worker_service_requests wsr
         LEFT JOIN camps c ON c.id = wsr.camp_id WHERE wsr.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      const r = rows[0];

      const canChange =
        req.user.role === 'admin' ||
        r.owner_id === req.user.id ||
        r.assigned_to === req.user.id;
      if (!canChange) return res.status(403).json({ error: 'Not authorized' });

      const resolvedAt = req.body.status === 'resolved' ? new Date().toISOString() : null;
      await db.query(
        `UPDATE worker_service_requests
         SET status=$1, response_notes=COALESCE($2, response_notes),
             resolved_at=COALESCE($3, resolved_at),
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$4`,
        [req.body.status, req.body.response_notes || null, resolvedAt, id]
      );

      notify(r.worker_id, {
        type: 'request_status',
        title: `Your request was ${req.body.status.replace('_', ' ')}`,
        body: r.title,
        link: '/worker/requests',
      });
      auditLog(req, `worker_request_${req.body.status}`, 'worker_service_requests', id);
      res.json({ ok: true, status: req.body.status });
    } catch (e) { next(e); }
  }
);

// ─── ASSIGN ───
router.put(
  '/:id/assign',
  authRequired,
  requireRole('owner', 'admin'),
  [body('assigned_to').isInt({ min: 1 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT wsr.*, c.owner_id FROM worker_service_requests wsr
         LEFT JOIN camps c ON c.id = wsr.camp_id WHERE wsr.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }

      await db.query(
        `UPDATE worker_service_requests SET assigned_to=$1,
           status=CASE WHEN status='pending' THEN 'in_progress' ELSE status END,
           updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [parseInt(req.body.assigned_to, 10), id]
      );
      notify(parseInt(req.body.assigned_to, 10), {
        type: 'request_assigned',
        title: 'Request assigned to you',
        body: rows[0].title,
        link: '/owner/requests',
      });
      auditLog(req, 'worker_request_assigned', 'worker_service_requests', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

module.exports = router;
