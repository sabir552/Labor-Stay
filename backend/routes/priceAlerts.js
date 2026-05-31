/**
 * Price alerts (H4).
 *
 * Worker subscribes to a (city, camp_type, room_type, max_price, nationality)
 * combo. A scheduler job runs daily and notifies matching workers when
 * inventory drops within their criteria.
 *
 * Table: price_alerts (Piece 13 v2)
 *
 *   POST   /                — create alert
 *   GET    /mine            — my alerts
 *   PUT    /:id             — update
 *   DELETE /:id             — delete
 *   POST   /check           — admin: trigger matching now (returns hit list)
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

router.post('/',
  authRequired,
  [
    body('max_price').optional().isFloat({ min: 1 }),
    body('city').optional().isString().isLength({ max: 50 }),
    body('camp_type').optional().isIn(['standard', 'executive', 'istira']),
    body('room_type').optional().isIn(['standard', 'executive', 'bed_space']),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO price_alerts (user_id, city, camp_type, room_type, max_price, nationality_pref, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING *`,
        [
          req.user.id, b.city || null, b.camp_type || null, b.room_type || null,
          b.max_price != null ? parseFloat(b.max_price) : null,
          b.nationality_pref || null,
        ]
      );
      auditLog(req, 'create_price_alert', 'price_alerts', rows[0].id);
      res.status(201).json({ alert: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM price_alerts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    res.json({ alerts: rows });
  } catch (e) { next(e); }
});

router.put('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM price_alerts WHERE id=$1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Alert not found' });
    if (req.user.role !== 'admin' && cur[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your alert' });
    }
    const b = req.body;
    const fields = {
      city: b.city, camp_type: b.camp_type, room_type: b.room_type,
      nationality_pref: b.nationality_pref,
      max_price: b.max_price != null ? parseFloat(b.max_price) : undefined,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.json({ alert: cur[0] });
    vals.push(id);
    await db.query(`UPDATE price_alerts SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM price_alerts WHERE id=$1', [id]);
    auditLog(req, 'update_price_alert', 'price_alerts', id);
    res.json({ alert: after[0] });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT user_id FROM price_alerts WHERE id=$1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Alert not found' });
    if (req.user.role !== 'admin' && cur[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your alert' });
    }
    await db.query('DELETE FROM price_alerts WHERE id=$1', [id]);
    auditLog(req, 'delete_price_alert', 'price_alerts', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Internal: check alerts now, notify matching workers
async function checkAlerts() {
  let notified = 0;
  try {
    const { rows: alerts } = await db.query(
      `SELECT * FROM price_alerts WHERE is_active=1`
    );
    for (const a of alerts) {
      // Build query for matching available rooms
      const where = ['c.status = \'approved\'', 'r.is_active = 1', 'r.available_beds > 0'];
      const params = [];
      if (a.city)       { params.push(a.city);       where.push(`c.city = $${params.length}`); }
      if (a.camp_type)  { params.push(a.camp_type);  where.push(`c.camp_type = $${params.length}`); }
      if (a.room_type)  { params.push(a.room_type);  where.push(`r.room_type = $${params.length}`); }
      if (a.max_price)  { params.push(parseFloat(a.max_price)); where.push(`r.price_per_day <= $${params.length}`); }

      const { rows: matches } = await db.query(
        `SELECT c.id AS camp_id, c.name AS camp_name, c.city,
                r.id AS room_id, r.name AS room_name, r.price_per_day
         FROM rooms r JOIN camps c ON c.id = r.camp_id
         WHERE ${where.join(' AND ')}
         ORDER BY r.price_per_day ASC LIMIT 5`,
        params
      );
      if (matches.length === 0) continue;

      // Throttle: don't re-notify same alert within 24h
      if (a.last_notified) {
        const last = new Date(a.last_notified).getTime();
        if (Date.now() - last < 24 * 3600 * 1000) continue;
      }

      const top = matches[0];
      await notify(a.user_id, {
        type: 'price_alert',
        title: `🔔 Match found at SAR ${top.price_per_day}/day`,
        body: `${top.camp_name} (${top.city}) — ${top.room_name}. ${matches.length} match(es) total.`,
        link: `/camps/${top.camp_id}`,
      });
      await db.query('UPDATE price_alerts SET last_notified=CURRENT_TIMESTAMP WHERE id=$1', [a.id]);
      notified++;
    }
  } catch (e) { /* ignore — table may not exist */ }
  return notified;
}

router.post('/check',
  authRequired, requireRole('admin'),
  async (req, res, next) => {
    try {
      const n = await checkAlerts();
      res.json({ ok: true, notified: n });
    } catch (e) { next(e); }
  }
);

module.exports = router;
module.exports.checkAlerts = checkAlerts;
