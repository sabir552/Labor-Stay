/**
 * Notifications routes
 *   GET    /api/notifications                 — list for current user (with unread count)
 *   PUT    /api/notifications/:id/read        — mark one as read
 *   PUT    /api/notifications/read-all        — mark all as read
 *   DELETE /api/notifications/:id             — remove one
 */
const express = require('express');
const db = require('../config/database');
const { authRequired } = require('../middleware/auth');
const router = express.Router();

router.get('/', authRequired, async (req, res, next) => {
  try {
    const lim = Math.min(100, parseInt(req.query.limit || '50', 10));
    const { rows } = await db.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT ' + lim,
      [req.user.id]
    );
    const { rows: u } = await db.query(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND is_read = 0',
      [req.user.id]
    );
    const unread = parseInt(u[0].c || u[0].C || 0, 10);
    res.json({ notifications: rows, unread_count: unread });
  } catch (e) { next(e); }
});

router.put('/:id/read', authRequired, async (req, res, next) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = 1 WHERE id = $1 AND user_id = $2',
      [parseInt(req.params.id, 10), req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/read-all', authRequired, async (req, res, next) => {
  try {
    await db.query('UPDATE notifications SET is_read = 1 WHERE user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, async (req, res, next) => {
  try {
    await db.query('DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [parseInt(req.params.id, 10), req.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
