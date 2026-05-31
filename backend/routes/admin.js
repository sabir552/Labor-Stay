/**
 * Admin routes — platform control & analytics
 *   GET  /api/admin/dashboard                — stats overview
 *   GET  /api/admin/users                    — list users (with filters)
 *   PUT  /api/admin/users/:id/verify         — verify worker (Iqama / ID)
 *   PUT  /api/admin/users/:id/toggle-active  — activate / deactivate
 *   GET  /api/admin/camps                    — all camps with status filter
 *   PUT  /api/admin/camps/:id/verify         — approve / reject camp
 *   PUT  /api/admin/camps/:id/featured       — toggle featured
 *   GET  /api/admin/bookings                 — all bookings (searchable)
 *   GET  /api/admin/revenue                  — commission earnings + charts data
 *   GET  /api/admin/audit-logs               — audit trail
 *   GET  /api/admin/disputes                 — disputes list
 *   PUT  /api/admin/disputes/:id             — resolve dispute
 *   POST /api/admin/announcements            — broadcast announcement
 *   GET  /api/admin/announcements            — list announcements
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify, sendEmail } = require('../utils/emailService');

const router = express.Router();

// All admin routes require admin
router.use(authRequired, requireRole('admin'));

// ============ DASHBOARD ============
router.get('/dashboard', async (_req, res, next) => {
  try {
    const q = async (sql, params = []) => (await db.query(sql, params)).rows;

    const stats = {};
    stats.users = parseInt((await q('SELECT COUNT(*) AS c FROM users'))[0].c, 10);
    stats.workers = parseInt((await q("SELECT COUNT(*) AS c FROM users WHERE role='worker'"))[0].c, 10);
    stats.owners = parseInt((await q("SELECT COUNT(*) AS c FROM users WHERE role='owner'"))[0].c, 10);
    stats.providers = parseInt((await q("SELECT COUNT(*) AS c FROM users WHERE role='provider'"))[0].c, 10);
    stats.camps = parseInt((await q('SELECT COUNT(*) AS c FROM camps'))[0].c, 10);
    stats.approved_camps = parseInt((await q("SELECT COUNT(*) AS c FROM camps WHERE status='approved'"))[0].c, 10);
    stats.pending_camps = parseInt((await q("SELECT COUNT(*) AS c FROM camps WHERE status='pending'"))[0].c, 10);
    stats.featured_camps = parseInt((await q('SELECT COUNT(*) AS c FROM camps WHERE is_featured=1'))[0].c, 10);
    stats.rooms = parseInt((await q('SELECT COUNT(*) AS c FROM rooms'))[0].c, 10);
    stats.bookings = parseInt((await q('SELECT COUNT(*) AS c FROM bookings'))[0].c, 10);
    stats.confirmed_bookings = parseInt((await q("SELECT COUNT(*) AS c FROM bookings WHERE status='confirmed'"))[0].c, 10);
    stats.equipment = parseInt((await q('SELECT COUNT(*) AS c FROM equipment'))[0].c, 10);
    stats.services = parseInt((await q('SELECT COUNT(*) AS c FROM services'))[0].c, 10);
    stats.reviews = parseInt((await q('SELECT COUNT(*) AS c FROM reviews'))[0].c, 10);

    // Revenue
    const rev = await q(`SELECT
      COALESCE(SUM(amount),0) AS gross,
      COUNT(*) AS count
      FROM payments WHERE status='paid'`);
    const commission = await q(`SELECT COALESCE(SUM(b.commission_amount),0) AS comm
      FROM bookings b JOIN payments p ON p.booking_id=b.id WHERE p.status='paid'`);
    stats.revenue_gross = parseFloat(rev[0].gross) || 0;
    stats.revenue_commission = parseFloat(commission[0].comm) || 0;
    stats.paid_payment_count = parseInt(rev[0].count, 10);

    // Alerts
    const alerts = [];
    if (stats.pending_camps > 0) alerts.push({ type: 'pending_camps', count: stats.pending_camps, message: `${stats.pending_camps} camp(s) awaiting verification` });
    const pendingIqama = parseInt((await q(`SELECT COUNT(*) AS c FROM worker_profiles WHERE iqama_photo_url IS NOT NULL AND iqama_verified=0`))[0].c, 10);
    if (pendingIqama > 0) alerts.push({ type: 'pending_iqama', count: pendingIqama, message: `${pendingIqama} worker(s) awaiting Iqama verification` });
    const openDisputes = parseInt((await q(`SELECT COUNT(*) AS c FROM disputes WHERE status='open'`))[0].c, 10);
    if (openDisputes > 0) alerts.push({ type: 'open_disputes', count: openDisputes, message: `${openDisputes} open dispute(s)` });

    // Recent activity (last 10 audit logs)
    const recent = await q(`SELECT a.*, u.full_name FROM audit_logs a
      LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 10`);

    res.json({ stats, alerts, recent_activity: recent });
  } catch (e) { next(e); }
});

// ============ USERS ============
router.get('/users', async (req, res, next) => {
  try {
    const { role, q, is_active } = req.query;
    const where = ['1=1']; const params = [];
    if (role) { params.push(role); where.push(`role = $${params.length}`); }
    if (is_active === 'true') where.push('is_active = 1');
    if (is_active === 'false') where.push('is_active = 0');
    if (q) {
      params.push(`%${q.toLowerCase()}%`); params.push(`%${q.toLowerCase()}%`);
      where.push(`(LOWER(full_name) LIKE $${params.length - 1} OR LOWER(email) LIKE $${params.length})`);
    }
    const { rows } = await db.query(
      `SELECT id, role, full_name, email, phone, is_active, is_verified, preferred_language, created_at
       FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 500`, params
    );
    res.json({ users: rows });
  } catch (e) { next(e); }
});

router.put('/users/:id/verify', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    await db.query('UPDATE users SET is_verified = 1 WHERE id = $1', [id]);
    if (rows[0].role === 'worker') {
      await db.query('UPDATE worker_profiles SET iqama_verified = 1 WHERE user_id = $1', [id]);
    }
    notify(id, { type: 'verified', title: 'Account verified ✅', body: 'Your account has been verified.', link: '/' });
    auditLog(req, 'verify_user', 'user', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.put('/users/:id/toggle-active', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT is_active FROM users WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    const next_ = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE users SET is_active = $1 WHERE id = $2', [next_, id]);
    auditLog(req, next_ ? 'activate_user' : 'deactivate_user', 'user', id);
    res.json({ ok: true, is_active: next_ });
  } catch (e) { next(e); }
});

// ============ CAMPS ============
router.get('/camps', async (req, res, next) => {
  try {
    const { status, city } = req.query;
    const where = ['1=1']; const params = [];
    if (status) { params.push(status); where.push(`status = $${params.length}`); }
    if (city) { params.push(city); where.push(`city = $${params.length}`); }
    const { rows } = await db.query(
      `SELECT c.*, u.full_name AS owner_name FROM camps c
       LEFT JOIN users u ON u.id=c.owner_id
       WHERE ${where.join(' AND ')} ORDER BY c.created_at DESC LIMIT 500`, params
    );
    res.json({ camps: rows });
  } catch (e) { next(e); }
});

router.put('/camps/:id/verify',
  [body('status').isIn(['approved', 'rejected', 'pending', 'suspended'])],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed' });
      const id = parseInt(req.params.id, 10);
      await db.query('UPDATE camps SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [req.body.status, id]);
      const { rows: c } = await db.query('SELECT owner_id, name FROM camps WHERE id = $1', [id]);
      if (c[0]) {
        notify(c[0].owner_id, {
          type: 'camp_status', title: `Camp ${req.body.status}`,
          body: `${c[0].name} is now ${req.body.status}`, link: `/owner/camps/${id}`,
        });
      }
      auditLog(req, `camp_${req.body.status}`, 'camp', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.put('/camps/:id/featured', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT is_featured FROM camps WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Camp not found' });
    const next_ = rows[0].is_featured ? 0 : 1;
    await db.query('UPDATE camps SET is_featured = $1 WHERE id = $2', [next_, id]);
    auditLog(req, next_ ? 'feature_camp' : 'unfeature_camp', 'camp', id);
    res.json({ ok: true, is_featured: next_ });
  } catch (e) { next(e); }
});

// ============ BOOKINGS ============
router.get('/bookings', async (req, res, next) => {
  try {
    const { status, q } = req.query;
    const where = ['1=1']; const params = [];
    if (status) { params.push(status); where.push(`b.status = $${params.length}`); }
    if (q) {
      params.push(`%${q.toLowerCase()}%`); params.push(`%${q.toLowerCase()}%`);
      where.push(`(LOWER(b.booking_code) LIKE $${params.length - 1} OR LOWER(c.name) LIKE $${params.length})`);
    }
    const { rows } = await db.query(
      `SELECT b.*, c.name AS camp_name, c.city, u.full_name AS worker_name, r.name AS room_name
       FROM bookings b
       JOIN camps c ON c.id = b.camp_id
       JOIN users u ON u.id = b.worker_id
       JOIN rooms r ON r.id = b.room_id
       WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC LIMIT 500`, params
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ============ REVENUE ============
router.get('/revenue', async (req, res, next) => {
  try {
    // Aggregate by day (last 30 days)
    const driver = db.driver;
    const dayExpr = driver === 'postgres'
      ? "TO_CHAR(p.paid_at::date, 'YYYY-MM-DD')"
      : "strftime('%Y-%m-%d', p.paid_at)";
    const sinceExpr = driver === 'postgres'
      ? "p.paid_at >= NOW() - INTERVAL '30 days'"
      : "p.paid_at >= datetime('now','-30 days')";

    const { rows: daily } = await db.query(
      `SELECT ${dayExpr} AS day,
              COALESCE(SUM(p.amount),0) AS gross,
              COALESCE(SUM(b.commission_amount),0) AS commission,
              COUNT(*) AS count
       FROM payments p LEFT JOIN bookings b ON b.id = p.booking_id
       WHERE p.status='paid' AND ${sinceExpr}
       GROUP BY ${dayExpr} ORDER BY day ASC`
    );

    // By city
    const { rows: byCity } = await db.query(
      `SELECT c.city,
              COALESCE(SUM(p.amount),0) AS gross,
              COUNT(p.id) AS count
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN camps c ON c.id=b.camp_id
       WHERE p.status='paid'
       GROUP BY c.city ORDER BY gross DESC LIMIT 10`
    );

    // Top owners
    const { rows: topOwners } = await db.query(
      `SELECT u.full_name AS owner_name, op.company_name,
              COALESCE(SUM(p.amount),0) AS gross,
              COALESCE(SUM(b.commission_amount),0) AS our_commission,
              COUNT(p.id) AS bookings
       FROM payments p JOIN bookings b ON b.id=p.booking_id JOIN camps c ON c.id=b.camp_id
       JOIN users u ON u.id=c.owner_id LEFT JOIN owner_profiles op ON op.user_id=u.id
       WHERE p.status='paid'
       GROUP BY u.id, u.full_name, op.company_name
       ORDER BY gross DESC LIMIT 10`
    );

    res.json({
      daily: daily.map((d) => ({ day: d.day, gross: +d.gross || 0, commission: +d.commission || 0, count: +d.count || 0 })),
      by_city: byCity.map((c) => ({ city: c.city, gross: +c.gross || 0, count: +c.count || 0 })),
      top_owners: topOwners.map((o) => ({
        owner_name: o.owner_name, company_name: o.company_name,
        gross: +o.gross || 0, our_commission: +o.our_commission || 0, bookings: +o.bookings || 0,
      })),
    });
  } catch (e) { next(e); }
});

// ============ AUDIT LOGS ============
router.get('/audit-logs', async (req, res, next) => {
  try {
    const lim = Math.min(500, parseInt(req.query.limit || '100', 10));
    const { rows } = await db.query(
      `SELECT a.*, u.full_name, u.email FROM audit_logs a
       LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT ${lim}`
    );
    res.json({ logs: rows });
  } catch (e) { next(e); }
});

// ============ DISPUTES ============
router.get('/disputes', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT d.*, u.full_name AS raised_by_name, b.booking_code
       FROM disputes d LEFT JOIN users u ON u.id=d.raised_by
       LEFT JOIN bookings b ON b.id=d.booking_id
       ORDER BY d.created_at DESC LIMIT 200`
    );
    res.json({ disputes: rows });
  } catch (e) { next(e); }
});

router.put('/disputes/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status = 'resolved', resolution } = req.body;
    await db.query('UPDATE disputes SET status = $1, resolution = $2 WHERE id = $3',
      [status, resolution || null, id]);
    auditLog(req, 'resolve_dispute', 'dispute', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============ ANNOUNCEMENTS ============
router.get('/announcements', async (_req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100');
    res.json({ announcements: rows });
  } catch (e) { next(e); }
});

router.post('/announcements',
  [body('title').isString().notEmpty(), body('body').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed' });
      const { title, body: msg, audience = 'all' } = req.body;
      const { rows } = await db.query(
        `INSERT INTO announcements (title, body, audience, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
        [title, msg, audience, req.user.id]
      );
      // Fan-out to users (in-app notification)
      let userQuery = 'SELECT id, email FROM users WHERE is_active = 1';
      if (audience !== 'all') userQuery += ` AND role = '${audience.replace(/[^a-z]/g, '')}'`;
      const { rows: users } = await db.query(userQuery);
      for (const u of users) {
        notify(u.id, { type: 'announcement', title, body: msg, link: '/announcements' });
      }
      // Optional email blast (fire-and-forget; only first 50 to avoid spam in dev)
      users.slice(0, 50).forEach((u) => sendEmail({ to: u.email, subject: title, html: `<p>${msg}</p>` }).catch(() => {}));
      auditLog(req, 'announce', 'announcement', rows[0].id, { audience, recipients: users.length });
      res.status(201).json({ announcement: rows[0], recipients: users.length });
    } catch (e) { next(e); }
  }
);

module.exports = router;
