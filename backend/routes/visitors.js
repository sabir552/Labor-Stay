/**
 * Visitor management (D2).
 *
 * Table: visitor_logs (Piece 13 v2)
 *
 *   POST   /log                — log visitor entry
 *   GET    /log/camp/:campId   — visitor log (filterable)
 *   PUT    /log/:id/exit       — mark visitor exit
 *   GET    /active/camp/:campId — currently inside
 *   GET    /reports/camp/:campId — visit counts
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

// ─── ENTRY ───
router.post('/log',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('visitor_name').isString().isLength({ min: 2 }),
    body('visitor_id_number').optional().isString(),
    body('visitor_phone').optional().isString(),
    body('host_worker_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('host_room').optional().isString(),
    body('purpose').optional().isString().isLength({ max: 500 }),
    body('vehicle_plate').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO visitor_logs
           (camp_id, visitor_name, visitor_id_number, visitor_phone, host_worker_id,
            host_room, purpose, entry_time, vehicle_plate, approved_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP,$8,$9) RETURNING *`,
        [
          b.camp_id, b.visitor_name, b.visitor_id_number || null, b.visitor_phone || null,
          b.host_worker_id || null, b.host_room || null, b.purpose || null,
          b.vehicle_plate || null, req.user.id,
        ]
      );
      auditLog(req, 'visitor_entry', 'visitor_logs', rows[0].id, { visitor: b.visitor_name });
      res.status(201).json({ log: rows[0] });
    } catch (e) { next(e); }
  }
);

// ─── LIST / FILTER ───
router.get('/log/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const where = ['vl.camp_id=$1']; const params = [campId];
      if (req.query.q) {
        // Push twice so each $N is unique (SQLite adapter can't reuse the same $N).
        params.push(`%${req.query.q.toLowerCase()}%`);
        const p1 = params.length;
        params.push(`%${req.query.q.toLowerCase()}%`);
        const p2 = params.length;
        where.push(`(LOWER(vl.visitor_name) LIKE $${p1}
                  OR LOWER(COALESCE(vl.visitor_id_number,'')) LIKE $${p2})`);
      }
      if (req.query.status === 'active') where.push('vl.exit_time IS NULL');
      if (req.query.status === 'exited') where.push('vl.exit_time IS NOT NULL');

      const { rows } = await db.query(
        `SELECT vl.*, u.full_name AS host_name, a.full_name AS approved_by_name
         FROM visitor_logs vl
         LEFT JOIN users u ON u.id = vl.host_worker_id
         LEFT JOIN users a ON a.id = vl.approved_by
         WHERE ${where.join(' AND ')}
         ORDER BY vl.entry_time DESC LIMIT 500`,
        params
      );
      res.json({ logs: rows });
    } catch (e) { next(e); }
  }
);

// ─── EXIT ───
router.put('/log/:id/exit',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id, exit_time FROM visitor_logs WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Log not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      if (cur[0].exit_time) return res.json({ ok: true, already_exited: true });

      await db.query('UPDATE visitor_logs SET exit_time=CURRENT_TIMESTAMP WHERE id=$1', [id]);
      auditLog(req, 'visitor_exit', 'visitor_logs', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── ACTIVE ───
router.get('/active/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows } = await db.query(
        `SELECT vl.*, u.full_name AS host_name
         FROM visitor_logs vl
         LEFT JOIN users u ON u.id = vl.host_worker_id
         WHERE vl.camp_id=$1 AND vl.exit_time IS NULL
         ORDER BY vl.entry_time DESC`,
        [campId]
      );
      res.json({ active: rows, count: rows.length });
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

      const start = req.query.start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      const dayExpr = db.driver === 'postgres'
        ? "TO_CHAR(vl.entry_time::date, 'YYYY-MM-DD')"
        : "strftime('%Y-%m-%d', vl.entry_time)";
      const { rows: byDay } = await db.query(
        `SELECT ${dayExpr} AS day, COUNT(*) AS visits
         FROM visitor_logs vl
         WHERE vl.camp_id=$1 AND vl.entry_time >= $2 AND vl.entry_time <= $3
         GROUP BY ${dayExpr} ORDER BY day ASC`,
        [campId, start + ' 00:00:00', end + ' 23:59:59']
      );
      const total = byDay.reduce((s, r) => s + parseInt(r.visits, 10), 0);

      const { rows: topHosts } = await db.query(
        `SELECT u.full_name AS host_name, COUNT(*) AS visits
         FROM visitor_logs vl JOIN users u ON u.id = vl.host_worker_id
         WHERE vl.camp_id=$1 AND vl.entry_time >= $2 AND vl.entry_time <= $3
         GROUP BY u.id, u.full_name ORDER BY visits DESC LIMIT 10`,
        [campId, start + ' 00:00:00', end + ' 23:59:59']
      );
      res.json({ range: { start, end }, total_visits: total, by_day: byDay, top_hosts: topHosts });
    } catch (e) { next(e); }
  }
);

module.exports = router;
