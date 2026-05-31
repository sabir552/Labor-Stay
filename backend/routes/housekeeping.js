/**
 * Housekeeping (D1).
 *
 * Tables (Piece 13 v2):  housekeeping_tasks, housekeeping_schedules
 *
 *   POST   /tasks                  — create cleaning task
 *   GET    /tasks/camp/:campId     — list tasks for a camp
 *   PUT    /tasks/:id              — update task (status, notes)
 *   DELETE /tasks/:id              — remove
 *
 *   POST   /schedules              — recurring schedule (generates tasks)
 *   GET    /schedules/camp/:campId — list schedules
 *   PUT    /schedules/:id          — update/toggle
 *   DELETE /schedules/:id          — remove
 *
 *   POST   /schedules/:id/generate — manually generate the next N tasks
 *   GET    /reports/camp/:campId   — completion-rate report
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const TASK_TYPES = ['cleaning', 'laundry', 'linen_change', 'inspection'];
const STATUSES = ['pending', 'in_progress', 'done', 'skipped'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

function decorateSchedule(s) {
  if (!s) return s;
  return { ...s, days_of_week: parseJSON(s.days_of_week, []), is_active: !!s.is_active };
}

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

// ─── TASKS ───
router.post('/tasks',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('task_type').isIn(TASK_TYPES),
    body('scheduled_date').isString().notEmpty(),
    body('room_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('assigned_to').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO housekeeping_tasks
           (camp_id, room_id, assigned_to, task_type, scheduled_date, scheduled_time, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *`,
        [
          b.camp_id, b.room_id || null, b.assigned_to || null,
          b.task_type, b.scheduled_date, b.scheduled_time || null, b.notes || null,
        ]
      );
      if (b.assigned_to) {
        notify(b.assigned_to, {
          type: 'housekeeping_assigned',
          title: `New ${b.task_type} task`,
          body: `Scheduled for ${b.scheduled_date}${b.scheduled_time ? ' at ' + b.scheduled_time : ''}`,
          link: '/owner/housekeeping',
        });
      }
      auditLog(req, 'create_housekeeping_task', 'housekeeping_tasks', rows[0].id);
      res.status(201).json({ task: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/tasks/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const where = ['ht.camp_id=$1']; const params = [campId];
      if (req.query.status) { params.push(req.query.status); where.push(`ht.status=$${params.length}`); }
      if (req.query.from)   { params.push(req.query.from);   where.push(`ht.scheduled_date >= $${params.length}`); }
      if (req.query.to)     { params.push(req.query.to);     where.push(`ht.scheduled_date <= $${params.length}`); }

      const { rows } = await db.query(
        `SELECT ht.*, r.name AS room_name, u.full_name AS assigned_name
         FROM housekeeping_tasks ht
         LEFT JOIN rooms r ON r.id = ht.room_id
         LEFT JOIN users u ON u.id = ht.assigned_to
         WHERE ${where.join(' AND ')}
         ORDER BY ht.scheduled_date DESC, ht.scheduled_time ASC LIMIT 500`,
        params
      );
      // Summary
      const total = rows.length;
      const byStatus = { pending: 0, in_progress: 0, done: 0, skipped: 0 };
      for (const t of rows) byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      const completion = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;
      res.json({ tasks: rows, summary: { total, by_status: byStatus, completion_pct: completion } });
    } catch (e) { next(e); }
  }
);

router.put('/tasks/:id',
  authRequired,
  [
    body('status').optional().isIn(STATUSES),
    body('notes').optional().isString().isLength({ max: 2000 }),
    body('assigned_to').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query(
        `SELECT ht.*, c.owner_id FROM housekeeping_tasks ht
         JOIN camps c ON c.id = ht.camp_id WHERE ht.id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Task not found' });
      const t = cur[0];
      const canChange =
        req.user.role === 'admin' ||
        t.owner_id === req.user.id ||
        t.assigned_to === req.user.id;
      if (!canChange) return res.status(403).json({ error: 'Not authorized' });

      const sets = []; const vals = [];
      if (req.body.status !== undefined) {
        vals.push(req.body.status); sets.push(`status=$${vals.length}`);
        if (req.body.status === 'done') {
          vals.push(new Date().toISOString()); sets.push(`completed_at=$${vals.length}`);
        }
      }
      if (req.body.notes !== undefined) { vals.push(req.body.notes); sets.push(`notes=$${vals.length}`); }
      if (req.body.assigned_to !== undefined && (req.user.role === 'admin' || t.owner_id === req.user.id)) {
        vals.push(req.body.assigned_to || null); sets.push(`assigned_to=$${vals.length}`);
      }
      if (!sets.length) return res.json({ task: t });
      vals.push(id);
      await db.query(`UPDATE housekeeping_tasks SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM housekeeping_tasks WHERE id=$1', [id]);
      auditLog(req, 'update_housekeeping_task', 'housekeeping_tasks', id);
      res.json({ task: after[0] });
    } catch (e) { next(e); }
  }
);

router.delete('/tasks/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query(
        `SELECT camp_id FROM housekeeping_tasks WHERE id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Task not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      await db.query('DELETE FROM housekeeping_tasks WHERE id=$1', [id]);
      auditLog(req, 'delete_housekeeping_task', 'housekeeping_tasks', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// ─── SCHEDULES ───
router.post('/schedules',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('task_type').isIn(TASK_TYPES),
    body('frequency').isIn(FREQUENCIES),
    body('days_of_week').optional().isArray(),
    body('time_of_day').optional().isString(),
    body('room_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const days = Array.isArray(req.body.days_of_week)
        ? req.body.days_of_week.map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d))
        : [];

      const { rows } = await db.query(
        `INSERT INTO housekeeping_schedules
           (camp_id, room_id, frequency, days_of_week, time_of_day, task_type, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING *`,
        [
          req.body.camp_id, req.body.room_id || null,
          req.body.frequency, JSON.stringify(days),
          req.body.time_of_day || null, req.body.task_type,
        ]
      );
      auditLog(req, 'create_housekeeping_schedule', 'housekeeping_schedules', rows[0].id);
      res.status(201).json({ schedule: decorateSchedule(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get('/schedules/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      const { rows } = await db.query(
        `SELECT hs.*, r.name AS room_name FROM housekeeping_schedules hs
         LEFT JOIN rooms r ON r.id = hs.room_id
         WHERE hs.camp_id=$1 ORDER BY hs.created_at DESC`,
        [campId]
      );
      res.json({ schedules: rows.map(decorateSchedule) });
    } catch (e) { next(e); }
  }
);

router.put('/schedules/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM housekeeping_schedules WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Schedule not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const fields = {
        task_type: b.task_type, frequency: b.frequency,
        time_of_day: b.time_of_day,
        days_of_week: b.days_of_week !== undefined
          ? JSON.stringify((b.days_of_week || []).map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d)))
          : undefined,
        is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
      };
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) {
        const { rows } = await db.query('SELECT * FROM housekeeping_schedules WHERE id=$1', [id]);
        return res.json({ schedule: decorateSchedule(rows[0]) });
      }
      vals.push(id);
      await db.query(`UPDATE housekeeping_schedules SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      const { rows: after } = await db.query('SELECT * FROM housekeeping_schedules WHERE id=$1', [id]);
      auditLog(req, 'update_housekeeping_schedule', 'housekeeping_schedules', id);
      res.json({ schedule: decorateSchedule(after[0]) });
    } catch (e) { next(e); }
  }
);

router.delete('/schedules/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT camp_id FROM housekeeping_schedules WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Schedule not found' });
      const own = await assertCampOwner(req, cur[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      await db.query('DELETE FROM housekeeping_schedules WHERE id=$1', [id]);
      auditLog(req, 'delete_housekeeping_schedule', 'housekeeping_schedules', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

// Generate the next N tasks from a schedule
router.post('/schedules/:id/generate',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const horizonDays = Math.min(60, parseInt(req.body.horizon_days || 14, 10));
      const { rows: sched } = await db.query('SELECT * FROM housekeeping_schedules WHERE id=$1', [id]);
      if (!sched[0]) return res.status(404).json({ error: 'Schedule not found' });
      const own = await assertCampOwner(req, sched[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      if (!sched[0].is_active) return res.status(400).json({ error: 'Schedule is inactive' });

      const s = decorateSchedule(sched[0]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
      let created = 0;
      for (let i = 0; i < horizonDays; i++) {
        const d = new Date(today.getTime() + i * 86400000);
        const dayName = dayNames[d.getDay()];
        const dateStr = d.toISOString().slice(0, 10);

        let shouldCreate = false;
        if (s.frequency === 'daily') shouldCreate = true;
        else if (s.frequency === 'weekly') shouldCreate = (s.days_of_week || []).includes(dayName);
        else if (s.frequency === 'monthly') shouldCreate = d.getDate() === today.getDate();

        if (!shouldCreate) continue;

        // De-dup: skip if a task already exists for this (camp, room, task_type, date, time)
        const { rows: ex } = await db.query(
          `SELECT id FROM housekeeping_tasks
           WHERE camp_id=$1 AND COALESCE(room_id,0)=COALESCE($2,0)
             AND task_type=$3 AND scheduled_date=$4 LIMIT 1`,
          [s.camp_id, s.room_id || null, s.task_type, dateStr]
        );
        if (ex[0]) continue;

        await db.query(
          `INSERT INTO housekeeping_tasks
             (camp_id, room_id, task_type, scheduled_date, scheduled_time, status, notes)
           VALUES ($1,$2,$3,$4,$5,'pending','Auto-generated from schedule')`,
          [s.camp_id, s.room_id || null, s.task_type, dateStr, s.time_of_day]
        );
        created++;
      }
      auditLog(req, 'generate_housekeeping_tasks', 'housekeeping_schedules', id, { created });
      res.json({ ok: true, created, horizon_days: horizonDays });
    } catch (e) { next(e); }
  }
);

// Reports
router.get('/reports/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const start = req.query.start || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const end   = req.query.end   || new Date().toISOString().slice(0, 10);

      const { rows: byType } = await db.query(
        `SELECT task_type, COUNT(*) AS total,
                SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
                SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skipped
         FROM housekeeping_tasks
         WHERE camp_id=$1 AND scheduled_date >= $2 AND scheduled_date <= $3
         GROUP BY task_type`,
        [campId, start, end]
      );
      const byTypeOut = byType.map((r) => ({
        task_type: r.task_type,
        total: parseInt(r.total, 10),
        done: parseInt(r.done, 10),
        skipped: parseInt(r.skipped, 10),
        completion_pct: r.total > 0 ? Math.round((r.done / r.total) * 100) : 0,
      }));
      res.json({ range: { start, end }, by_type: byTypeOut });
    } catch (e) { next(e); }
  }
);

module.exports = router;
module.exports.TASK_TYPES = TASK_TYPES;
