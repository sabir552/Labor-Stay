/**
 * Admin security routes (F3 admin side).
 *
 *   GET    /api/admin/security/blocked-ips     — list
 *   DELETE /api/admin/security/blocked-ips/:ip — unblock
 *   GET    /api/admin/security/sessions        — all active sessions (admin overview)
 *   GET    /api/admin/security/2fa-status      — count enabled / disabled by role
 */
const express = require('express');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const ipBlocking = require('../middleware/ipBlocking');

const router = express.Router();
router.use(authRequired, requireRole('admin'));

router.get('/blocked-ips', async (_req, res, next) => {
  try { res.json({ blocked: await ipBlocking.listBlocked() }); }
  catch (e) { next(e); }
});

router.delete('/blocked-ips/:ip', async (req, res, next) => {
  try {
    await ipBlocking.unblock(req.params.ip);
    auditLog(req, 'unblock_ip', 'ip', null, { ip: req.params.ip });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/sessions', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.id, s.user_id, s.device_info, s.ip_address, s.created_at, s.last_used_at,
              u.full_name, u.email, u.role
       FROM sessions s LEFT JOIN users u ON u.id=s.user_id
       WHERE s.is_active=1
       ORDER BY s.last_used_at DESC NULLS LAST, s.created_at DESC LIMIT 200`
    ).catch(async () => {
      // SQLite NULLS LAST fallback
      return db.query(
        `SELECT s.id, s.user_id, s.device_info, s.ip_address, s.created_at, s.last_used_at,
                u.full_name, u.email, u.role
         FROM sessions s LEFT JOIN users u ON u.id=s.user_id
         WHERE s.is_active=1 ORDER BY s.created_at DESC LIMIT 200`
      );
    });
    res.json({ sessions: rows });
  } catch (e) { next(e); }
});

router.get('/2fa-status', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.role,
              SUM(CASE WHEN f.is_enabled=1 THEN 1 ELSE 0 END) AS enabled,
              COUNT(u.id) AS total
       FROM users u LEFT JOIN user_2fa f ON f.user_id=u.id
       GROUP BY u.role`
    );
    res.json({ by_role: rows });
  } catch (e) { next(e); }
});

module.exports = router;
