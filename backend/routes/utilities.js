/**
 * Utility tracking (G3).
 *
 *   POST   /readings              — add meter reading
 *   GET    /readings/camp/:campId — list readings (filterable)
 *   PUT    /readings/:id          — update
 *   DELETE /readings/:id          — remove
 *   GET    /reports/camp/:campId  — consumption + cost report
 *   POST   /alerts                — set threshold alert
 *   GET    /alerts/camp/:campId   — list alerts
 *   PUT    /alerts/:id            — update (toggle)
 *   DELETE /alerts/:id            — remove
 *   GET    /cost/camp/:campId     — cost-per-worker analysis
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify, sendEmail } = require('../utils/emailService');

const router = express.Router();
const TYPES = ['electricity', 'water', 'gas', 'diesel'];
const UNITS = { electricity: 'kWh', water: 'm³', gas: 'm³', diesel: 'L' };

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

// ─── READINGS ───
router.post('/readings',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('utility_type').isIn(TYPES),
    body('current_reading').isFloat({ min: 0 }),
    body('reading_date').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      // Pull previous reading for same meter (or null)
      let prev = parseFloat(b.previous_reading || 0);
      if (b.previous_reading == null) {
        const { rows } = await db.query(
          `SELECT current_reading FROM utility_readings
           WHERE camp_id=$1 AND utility_type=$2
             AND COALESCE(meter_number,'') = COALESCE($3,'')
           ORDER BY reading_date DESC, id DESC LIMIT 1`,
          [b.camp_id, b.utility_type, b.meter_number || '']
        );
        prev = rows[0] ? parseFloat(rows[0].current_reading) : 0;
      }
      const consumption = Math.max(0, parseFloat(b.current_reading) - prev);
      const rate = parseFloat(b.rate_per_unit || 0);
      const totalCost = Math.round(consumption * rate * 100) / 100;

      const { rows } = await db.query(
        `INSERT INTO utility_readings
           (camp_id, utility_type, meter_number, previous_reading, current_reading,
            consumption, unit, rate_per_unit, total_cost, reading_date, recorded_by, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          b.camp_id, b.utility_type, b.meter_number || null,
          prev, parseFloat(b.current_reading), consumption,
          b.unit || UNITS[b.utility_type] || '', rate, totalCost,
          b.reading_date || new Date().toISOString().slice(0, 10),
          req.user.id, b.notes || null,
        ]
      );
      auditLog(req, 'add_utility_reading', 'utility_readings', rows[0].id);

      // Check thresholds
      try {
        const { rows: alerts } = await db.query(
          `SELECT * FROM utility_alerts WHERE camp_id=$1 AND utility_type=$2 AND is_active=1`,
          [b.camp_id, b.utility_type]
        );
        for (const a of alerts) {
          if (consumption > parseFloat(a.threshold_value || 0)) {
            await db.query(
              `UPDATE utility_alerts SET last_triggered=CURRENT_TIMESTAMP WHERE id=$1`, [a.id]
            );
            if (a.alert_email) {
              sendEmail({
                to: a.alert_email,
                subject: `⚠️ Utility alert: ${b.utility_type} consumption exceeded threshold`,
                html: `<p>Camp #${b.camp_id} consumed <b>${consumption} ${UNITS[b.utility_type] || ''}</b> of ${b.utility_type} (threshold ${a.threshold_value}).</p>`,
              }).catch(() => {});
            }
          }
        }
      } catch (e) {}

      res.status(201).json({ reading: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/readings/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });
      const where = ['camp_id=$1']; const params = [campId];
      if (req.query.utility_type) { params.push(req.query.utility_type); where.push(`utility_type=$${params.length}`); }
      if (req.query.from)         { params.push(req.query.from);         where.push(`reading_date >= $${params.length}`); }
      if (req.query.to)           { params.push(req.query.to);           where.push(`reading_date <= $${params.length}`); }
      const { rows } = await db.query(
        `SELECT * FROM utility_readings WHERE ${where.join(' AND ')}
         ORDER BY reading_date DESC, id DESC LIMIT 500`, params
      );
      res.json({ readings: rows });
    } catch (e) { next(e); }
  }
);

router.put('/readings/:id',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query(
        `SELECT ur.*, c.owner_id FROM utility_readings ur
         JOIN camps c ON c.id=ur.camp_id WHERE ur.id=$1`, [id]
      );
      if (!cur[0]) return res.status(404).json({ error: 'Reading not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      const b = req.body;
      const fields = {
        current_reading: b.current_reading != null ? parseFloat(b.current_reading) : undefined,
        rate_per_unit:   b.rate_per_unit   != null ? parseFloat(b.rate_per_unit)   : undefined,
        notes: b.notes,
      };
      if (fields.current_reading !== undefined || fields.rate_per_unit !== undefined) {
        const newCurr = fields.current_reading != null ? fields.current_reading : parseFloat(cur[0].current_reading);
        const newRate = fields.rate_per_unit != null ? fields.rate_per_unit : parseFloat(cur[0].rate_per_unit);
        const newCons = Math.max(0, newCurr - parseFloat(cur[0].previous_reading || 0));
        fields.consumption = newCons;
        fields.total_cost = Math.round(newCons * newRate * 100) / 100;
      }
      const sets = []; const vals = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
      }
      if (!sets.length) return res.json({ ok: true });
      vals.push(id);
      await db.query(`UPDATE utility_readings SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      auditLog(req, 'update_utility_reading', 'utility_readings', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.delete('/readings/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query(
      `SELECT ur.*, c.owner_id FROM utility_readings ur
       JOIN camps c ON c.id=ur.camp_id WHERE ur.id=$1`, [id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Reading not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    await db.query('DELETE FROM utility_readings WHERE id=$1', [id]);
    auditLog(req, 'delete_utility_reading', 'utility_readings', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── REPORTS ───
router.get('/reports/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows: byType } = await db.query(
        `SELECT utility_type, COALESCE(SUM(consumption),0) AS consumption,
                COALESCE(SUM(total_cost),0) AS total_cost, COUNT(*) AS readings
         FROM utility_readings WHERE camp_id=$1 GROUP BY utility_type`, [campId]
      );

      const monthExpr = db.driver === 'postgres'
        ? "TO_CHAR(reading_date::date, 'YYYY-MM')"
        : "strftime('%Y-%m', reading_date)";
      const { rows: byMonth } = await db.query(
        `SELECT ${monthExpr} AS month, utility_type,
                COALESCE(SUM(consumption),0) AS consumption,
                COALESCE(SUM(total_cost),0) AS total_cost
         FROM utility_readings WHERE camp_id=$1
         GROUP BY ${monthExpr}, utility_type
         ORDER BY month DESC LIMIT 50`, [campId]
      );

      res.json({ camp_id: campId, by_type: byType, by_month: byMonth });
    } catch (e) { next(e); }
  }
);

router.get('/cost/camp/:campId',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.params.campId, 10);
      const own = await assertCampOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows: tot } = await db.query(
        `SELECT COALESCE(SUM(total_cost),0) AS total_cost FROM utility_readings WHERE camp_id=$1`,
        [campId]
      );
      // Avg active occupants
      const { rows: occ } = await db.query(
        `SELECT COALESCE(SUM(occupants),0) AS occupants FROM bookings
         WHERE camp_id=$1 AND status IN ('confirmed','checked_in')`, [campId]
      );
      const totalCost = parseFloat(tot[0].total_cost || 0);
      const occupants = parseInt(occ[0].occupants || 1, 10);
      res.json({
        total_cost: Math.round(totalCost * 100) / 100,
        active_occupants: occupants,
        cost_per_worker: occupants > 0 ? Math.round((totalCost / occupants) * 100) / 100 : 0,
      });
    } catch (e) { next(e); }
  }
);

// ─── ALERTS ───
router.post('/alerts',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('utility_type').isIn(TYPES),
    body('threshold_value').isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO utility_alerts (camp_id, utility_type, threshold_value, alert_email, is_active)
         VALUES ($1,$2,$3,$4,1) RETURNING *`,
        [b.camp_id, b.utility_type, parseFloat(b.threshold_value), b.alert_email || null]
      );
      auditLog(req, 'create_utility_alert', 'utility_alerts', rows[0].id);
      res.status(201).json({ alert: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/alerts/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const own = await assertCampOwner(req, campId);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    const { rows } = await db.query(
      'SELECT * FROM utility_alerts WHERE camp_id=$1 ORDER BY created_at DESC', [campId]
    );
    res.json({ alerts: rows });
  } catch (e) { next(e); }
});

router.put('/alerts/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query(
      `SELECT ua.*, c.owner_id FROM utility_alerts ua
       JOIN camps c ON c.id=ua.camp_id WHERE ua.id=$1`, [id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Alert not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    const b = req.body;
    const fields = {
      threshold_value: b.threshold_value != null ? parseFloat(b.threshold_value) : undefined,
      alert_email: b.alert_email,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.json({ ok: true });
    vals.push(id);
    await db.query(`UPDATE utility_alerts SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    auditLog(req, 'update_utility_alert', 'utility_alerts', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/alerts/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query(
      `SELECT ua.*, c.owner_id FROM utility_alerts ua
       JOIN camps c ON c.id=ua.camp_id WHERE ua.id=$1`, [id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Alert not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    await db.query('DELETE FROM utility_alerts WHERE id=$1', [id]);
    auditLog(req, 'delete_utility_alert', 'utility_alerts', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
