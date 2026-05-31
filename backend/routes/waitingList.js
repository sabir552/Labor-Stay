/**
 * Waiting list routes
 *   POST   /api/waiting-list             — worker joins waiting list for a room
 *   GET    /api/waiting-list/my-list     — worker's active entries
 *   DELETE /api/waiting-list/:id         — worker removes themselves
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

router.post(
  '/',
  authRequired,
  requireRole('worker', 'admin'),
  [body('room_id').isInt({ min: 1 }), body('requested_date').optional().isString()],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { room_id, requested_date } = req.body;

      // De-dup: don't add twice
      const { rows: ex } = await db.query(
        `SELECT id FROM waiting_list WHERE worker_id = $1 AND room_id = $2 AND status = 'active'`,
        [req.user.id, room_id]
      );
      if (ex[0]) return res.json({ ok: true, message: 'Already on waiting list', id: ex[0].id });

      const { rows } = await db.query(
        `INSERT INTO waiting_list (worker_id, room_id, requested_date, status)
         VALUES ($1,$2,$3,'active') RETURNING *`,
        [req.user.id, room_id, requested_date || null]
      );
      auditLog(req, 'join_waiting_list', 'waiting_list', rows[0].id);
      res.status(201).json({ entry: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/my-list', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT wl.*, r.name AS room_name, r.price_per_day, c.name AS camp_name, c.city
       FROM waiting_list wl
       JOIN rooms r ON r.id = wl.room_id
       JOIN camps c ON c.id = r.camp_id
       WHERE wl.worker_id = $1 AND wl.status = 'active'
       ORDER BY wl.created_at DESC`,
      [req.user.id]
    );
    res.json({ entries: rows });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM waiting_list WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Entry not found' });
    if (req.user.role !== 'admin' && rows[0].worker_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await db.query('DELETE FROM waiting_list WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
