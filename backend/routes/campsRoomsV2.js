/**
 * Camps + Rooms v2 (Piece 14) — additive write endpoints for the new
 * columns introduced by Piece 13 ALTERs.
 *
 *   PATCH /api/camps/:id/v2        — update virtual_tour_url + enhanced nearby_pois
 *   PATCH /api/rooms/:id/v2        — update dimensions, ac/internet/bathroom details
 *
 * These do NOT overlap with the existing PUT /api/camps/:id and
 * PUT /api/rooms/:id endpoints — they're additive, with stricter validation
 * for the new fields only.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

async function assertCampOwner(req, campId) {
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return { error: 403, message: 'Not your camp' };
  }
  return { ok: true };
}

async function assertRoomOwner(req, roomId) {
  const { rows } = await db.query(
    `SELECT c.owner_id FROM rooms r JOIN camps c ON c.id=r.camp_id WHERE r.id=$1`,
    [roomId]
  );
  if (!rows[0]) return { error: 404, message: 'Room not found' };
  if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
    return { error: 403, message: 'Not your camp' };
  }
  return { ok: true };
}

// ─── B1/B5: camp v2 update ──────────────────────────────────────────
router.patch('/camps/:id/v2',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('virtual_tour_url').optional({ nullable: true }).isString().isLength({ max: 600 }),
    body('nearby_pois').optional().isArray().withMessage('nearby_pois must be an array'),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const own = await assertCampOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { virtual_tour_url, nearby_pois } = req.body;

      // Normalize POI items: enforce { name, type, distance_km, walking_time_min?, lat?, lng? }
      let poisJson;
      if (Array.isArray(nearby_pois)) {
        const ALLOWED_TYPES = new Set([
          'hospital', 'pharmacy', 'mosque', 'supermarket', 'bus_station',
          'metro_station', 'taxi_service', 'airport', 'industrial_area',
          'nearby_project', 'nearby_plant', 'nearby_city', 'other',
        ]);
        const cleaned = nearby_pois.map((p) => ({
          name: String(p.name || '').slice(0, 120),
          type: ALLOWED_TYPES.has(String(p.type)) ? p.type : 'other',
          distance_km: Number.isFinite(+p.distance_km) ? +p.distance_km : null,
          walking_time_min: Number.isFinite(+p.walking_time_min) ? +p.walking_time_min : null,
          lat: Number.isFinite(+p.lat) ? +p.lat : null,
          lng: Number.isFinite(+p.lng) ? +p.lng : null,
        })).filter((p) => p.name);
        poisJson = JSON.stringify(cleaned);
      }

      const sets = [];
      const vals = [];
      if (virtual_tour_url !== undefined) { vals.push(virtual_tour_url || null); sets.push(`virtual_tour_url=$${vals.length}`); }
      if (poisJson !== undefined)         { vals.push(poisJson);                  sets.push(`nearby_pois=$${vals.length}`); }
      if (!sets.length) return res.json({ ok: true, message: 'No fields to update' });
      vals.push(id);
      await db.query(`UPDATE camps SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${vals.length}`, vals);
      auditLog(req, 'update_camp_v2', 'camp', id);

      const { rows } = await db.query('SELECT * FROM camps WHERE id=$1', [id]);
      // Decorate JSON fields for the client
      const camp = rows[0];
      try { camp.nearby_pois = camp.nearby_pois ? JSON.parse(camp.nearby_pois) : []; } catch {}
      try { camp.amenities = camp.amenities ? (typeof camp.amenities === 'string' ? JSON.parse(camp.amenities) : camp.amenities) : []; } catch {}
      try { camp.nationality_preference = camp.nationality_preference ? (typeof camp.nationality_preference === 'string' ? JSON.parse(camp.nationality_preference) : camp.nationality_preference) : []; } catch {}
      res.json({ camp });
    } catch (e) { next(e); }
  }
);

// ─── B2: room v2 update ─────────────────────────────────────────────
router.patch('/rooms/:id/v2',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('length_m').optional({ nullable: true }).isFloat({ min: 0 }),
    body('width_m').optional({ nullable: true }).isFloat({ min: 0 }),
    body('height_m').optional({ nullable: true }).isFloat({ min: 0 }),
    body('num_windows').optional({ nullable: true }).isInt({ min: 0 }),
    body('floor_type').optional({ nullable: true }).isString().isLength({ max: 50 }),
    body('has_attached_bathroom').optional().isBoolean(),
    body('num_bathrooms').optional({ nullable: true }).isInt({ min: 0 }),
    body('ac_type').optional({ nullable: true }).isIn(['split', 'central', 'window', 'none']),
    body('internet_type').optional({ nullable: true }).isIn(['wifi', 'ethernet', 'none']),
    body('internet_speed').optional({ nullable: true }).isString().isLength({ max: 30 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const own = await assertRoomOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const fields = [
        'length_m', 'width_m', 'height_m', 'num_windows', 'floor_type',
        'num_bathrooms', 'ac_type', 'internet_type', 'internet_speed',
      ];
      const sets = []; const vals = [];
      for (const f of fields) {
        if (req.body[f] !== undefined) { vals.push(req.body[f]); sets.push(`${f}=$${vals.length}`); }
      }
      if (req.body.has_attached_bathroom !== undefined) {
        vals.push(req.body.has_attached_bathroom ? 1 : 0);
        sets.push(`has_attached_bathroom=$${vals.length}`);
      }
      if (!sets.length) return res.json({ ok: true, message: 'No fields to update' });
      vals.push(id);
      await db.query(`UPDATE rooms SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      auditLog(req, 'update_room_v2', 'room', id);

      const { rows } = await db.query('SELECT * FROM rooms WHERE id=$1', [id]);
      res.json({ room: rows[0] });
    } catch (e) { next(e); }
  }
);

module.exports = router;
