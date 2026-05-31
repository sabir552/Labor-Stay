/**
 * Rooms routes — nested under camps.
 *   GET    /api/rooms/camp/:campId                 — list rooms for a camp
 *   GET    /api/rooms/:id                          — room detail
 *   POST   /api/rooms/camp/:campId                 — owner creates room
 *   PUT    /api/rooms/:id                          — owner updates room
 *   DELETE /api/rooms/:id                          — owner deletes room
 *   POST   /api/rooms/:id/pricing-rules            — add dynamic pricing rule
 *   GET    /api/rooms/:id/pricing-rules            — list rules
 *   DELETE /api/rooms/:id/pricing-rules/:ruleId    — delete rule
 *   POST   /api/rooms/:id/quote                    — get price quote for a date range
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { ROOM_TYPES, PRICING_TYPES } = require('../config/constants');
const { priceStay } = require('../utils/dynamicPricing');
const { computeBooking } = require('../utils/vatCalculator');

const router = express.Router();

function parseJSON(v, fb = null) { if (v == null) return fb; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return fb; } }
function decorate(r) {
  if (!r) return r;
  return { ...r, amenities: parseJSON(r.amenities, []), photos: parseJSON(r.photos, []), is_active: !!r.is_active };
}

async function assertOwner(req, campId) {
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id = $1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return { error: 403, message: 'Not your camp' };
  }
  return { ok: true };
}

router.get('/camp/:campId', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM rooms WHERE camp_id = $1 ORDER BY price_per_day ASC',
      [parseInt(req.params.campId, 10)]
    );
    res.json({ rooms: rows.map(decorate) });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Room not found' });
    const { rows: rules } = await db.query(
      'SELECT * FROM dynamic_pricing WHERE room_id = $1 AND is_active = 1',
      [id]
    );
    res.json({ room: decorate(rows[0]), pricing_rules: rules });
  } catch (e) { next(e); }
});

router.post(
  '/camp/:campId',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('name').isString().notEmpty(),
    body('room_type').isIn(ROOM_TYPES),
    body('capacity').isInt({ min: 1 }),
    body('price_per_day').isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const campId = parseInt(req.params.campId, 10);
      const own = await assertOwner(req, campId);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO rooms (camp_id, name, description, room_type, capacity, available_beds,
                            price_per_day, price_per_month, amenities, photos, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) RETURNING *`,
        [
          campId, b.name, b.description || '', b.room_type,
          parseInt(b.capacity, 10), parseInt(b.available_beds ?? b.capacity, 10),
          parseFloat(b.price_per_day), parseFloat(b.price_per_month || b.price_per_day * 28),
          JSON.stringify(b.amenities || []), JSON.stringify(b.photos || []),
        ]
      );
      auditLog(req, 'create_room', 'room', rows[0].id, { camp_id: campId });
      res.status(201).json({ room: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.put('/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Room not found' });
    const own = await assertOwner(req, cur[0].camp_id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });

    const b = req.body;
    const fields = {
      name: b.name, description: b.description, room_type: b.room_type,
      capacity: b.capacity != null ? parseInt(b.capacity, 10) : undefined,
      available_beds: b.available_beds != null ? parseInt(b.available_beds, 10) : undefined,
      price_per_day: b.price_per_day != null ? parseFloat(b.price_per_day) : undefined,
      price_per_month: b.price_per_month != null ? parseFloat(b.price_per_month) : undefined,
      amenities: b.amenities !== undefined ? JSON.stringify(b.amenities) : undefined,
      photos: b.photos !== undefined ? JSON.stringify(b.photos) : undefined,
      is_active: b.is_active !== undefined ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return res.json({ room: decorate(cur[0]) });
    vals.push(id);
    await db.query(`UPDATE rooms SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    auditLog(req, 'update_room', 'room', id);
    res.json({ room: decorate(after[0]) });
  } catch (e) { next(e); }
});

router.delete('/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT camp_id FROM rooms WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Room not found' });
    const own = await assertOwner(req, cur[0].camp_id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    await db.query('DELETE FROM rooms WHERE id = $1', [id]);
    auditLog(req, 'delete_room', 'room', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- DYNAMIC PRICING RULES ----------
router.get('/:id/pricing-rules', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM dynamic_pricing WHERE room_id = $1 ORDER BY id DESC',
      [parseInt(req.params.id, 10)]
    );
    res.json({ rules: rows });
  } catch (e) { next(e); }
});

router.post(
  '/:id/pricing-rules',
  authRequired,
  requireRole('owner', 'admin'),
  [body('pricing_type').isIn(PRICING_TYPES), body('multiplier').isFloat({ min: 0.1, max: 10 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { rows: r } = await db.query('SELECT camp_id FROM rooms WHERE id = $1', [id]);
      if (!r[0]) return res.status(404).json({ error: 'Room not found' });
      const own = await assertOwner(req, r[0].camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { pricing_type, multiplier, start_date, end_date } = req.body;
      const { rows } = await db.query(
        `INSERT INTO dynamic_pricing (room_id, pricing_type, multiplier, start_date, end_date, is_active)
         VALUES ($1,$2,$3,$4,$5,1) RETURNING *`,
        [id, pricing_type, parseFloat(multiplier), start_date || null, end_date || null]
      );
      auditLog(req, 'create_pricing_rule', 'room', id, { pricing_type, multiplier });
      res.status(201).json({ rule: rows[0] });
    } catch (e) { next(e); }
  }
);

router.delete('/:id/pricing-rules/:ruleId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ruleId = parseInt(req.params.ruleId, 10);
    const { rows: r } = await db.query('SELECT camp_id FROM rooms WHERE id = $1', [id]);
    if (!r[0]) return res.status(404).json({ error: 'Room not found' });
    const own = await assertOwner(req, r[0].camp_id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    await db.query('DELETE FROM dynamic_pricing WHERE id = $1 AND room_id = $2', [ruleId, id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- QUOTE (no auth required for browsing prices) ----------
router.post('/:id/quote', optionalAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { start_date, end_date, occupants = 1 } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });
    const { rows } = await db.query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Room not found' });
    const room = rows[0];
    const stay = await priceStay({
      roomId: id, startDate: start_date, endDate: end_date, pricePerDay: room.price_per_day,
    });
    const totals = computeBooking(stay.base * (parseInt(occupants, 10) || 1));
    res.json({ stay, totals, room: decorate(room) });
  } catch (e) { next(e); }
});

module.exports = router;
