/**
 * Transportation module (B4).
 *
 * Tables (Piece 13 v2 schema):
 *   vehicles            — owner's fleet (bus / van / pickup / car)
 *   transport_routes    — recurring routes (camp ↔ site) for a vehicle
 *   transport_bookings  — worker books a seat on a route on a date
 *   vehicle_locations   — GPS pings for live tracking
 *
 * Endpoints
 *   POST   /vehicles                — owner adds vehicle
 *   GET    /vehicles                — list (owner sees own; admin sees all)
 *   GET    /vehicles/:id            — detail
 *   PUT    /vehicles/:id            — update
 *   DELETE /vehicles/:id            — remove (soft via is_active=0 if has bookings)
 *
 *   POST   /routes                  — owner adds route
 *   GET    /routes                  — public list (filterable)
 *   GET    /routes/:id              — detail
 *   PUT    /routes/:id              — owner updates
 *   POST   /routes/:id/stops        — append stop to route
 *
 *   GET    /schedules               — combined schedule view (filterable)
 *
 *   POST   /bookings                — worker books a seat
 *   GET    /bookings/mine           — worker's transport bookings
 *   PUT    /bookings/:id/cancel     — worker cancels
 *
 *   GET    /tracking/:vehicleId     — latest GPS location
 *   POST   /tracking/:vehicleId     — driver/owner posts new ping
 *
 *   GET    /admin/overview          — admin platform overview
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

const VEHICLE_TYPES = ['bus', 'van', 'pickup', 'car'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}

function decorateVehicle(r) {
  if (!r) return r;
  return { ...r, is_active: !!r.is_active };
}
function decorateRoute(r) {
  if (!r) return r;
  return {
    ...r,
    stops: parseJSON(r.stops, []),
    days_of_week: parseJSON(r.days_of_week, []),
    is_active: !!r.is_active,
  };
}

async function assertVehicleOwner(req, vehicleId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM vehicles WHERE id=$1', [vehicleId]);
  if (!rows[0]) return { error: 404, message: 'Vehicle not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your vehicle' };
  return { ok: true, owner_id: rows[0].owner_id };
}

async function assertRouteOwner(req, routeId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query(
    `SELECT r.id, v.owner_id FROM transport_routes r
     JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id=$1`,
    [routeId]
  );
  if (!rows[0]) return { error: 404, message: 'Route not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your route' };
  return { ok: true, owner_id: rows[0].owner_id };
}

// ============ VEHICLES ============
router.post(
  '/vehicles',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('plate_number').isString().notEmpty(),
    body('vehicle_type').isIn(VEHICLE_TYPES),
    body('capacity').isInt({ min: 1, max: 200 }),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('driver_name').optional().isString(),
    body('driver_phone').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      // If camp_id is supplied, make sure the user owns it (admins bypass)
      if (b.camp_id && req.user.role !== 'admin') {
        const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [b.camp_id]);
        if (!rows[0]) return res.status(400).json({ error: 'Camp not found' });
        if (rows[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
      }

      const { rows } = await db.query(
        `INSERT INTO vehicles (owner_id, camp_id, plate_number, vehicle_type, capacity,
           driver_name, driver_phone, driver_iqama, gps_device_id, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) RETURNING *`,
        [
          req.user.id, b.camp_id || null, b.plate_number, b.vehicle_type, b.capacity,
          b.driver_name || null, b.driver_phone || null, b.driver_iqama || null,
          b.gps_device_id || null,
        ]
      );
      auditLog(req, 'create_vehicle', 'vehicles', rows[0].id);
      res.status(201).json({ vehicle: decorateVehicle(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get('/vehicles', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'admin') {
      sql = `SELECT v.*, c.name AS camp_name, u.full_name AS owner_name
             FROM vehicles v
             LEFT JOIN camps c ON c.id = v.camp_id
             LEFT JOIN users u ON u.id = v.owner_id
             ORDER BY v.created_at DESC LIMIT 500`;
      params = [];
    } else {
      sql = `SELECT v.*, c.name AS camp_name
             FROM vehicles v LEFT JOIN camps c ON c.id = v.camp_id
             WHERE v.owner_id = $1 ORDER BY v.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ vehicles: rows.map(decorateVehicle) });
  } catch (e) { next(e); }
});

router.get('/vehicles/:id', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT v.*, c.name AS camp_name FROM vehicles v
       LEFT JOIN camps c ON c.id = v.camp_id WHERE v.id=$1`,
      [parseInt(req.params.id, 10)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Vehicle not found' });
    // Workers / public can only see if it's used on a route they could book
    if (req.user.role !== 'admin' && req.user.role !== 'owner' && rows[0].owner_id !== req.user.id) {
      // Strip sensitive fields
      const v = rows[0];
      return res.json({
        vehicle: {
          id: v.id, vehicle_type: v.vehicle_type, capacity: v.capacity,
          plate_number: v.plate_number, camp_name: v.camp_name, is_active: !!v.is_active,
        },
      });
    }
    res.json({ vehicle: decorateVehicle(rows[0]) });
  } catch (e) { next(e); }
});

router.put('/vehicles/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const own = await assertVehicleOwner(req, id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });

    const b = req.body;
    const fields = {
      camp_id: b.camp_id !== undefined ? (b.camp_id || null) : undefined,
      plate_number: b.plate_number, vehicle_type: b.vehicle_type,
      capacity: b.capacity != null ? parseInt(b.capacity, 10) : undefined,
      driver_name: b.driver_name, driver_phone: b.driver_phone, driver_iqama: b.driver_iqama,
      gps_device_id: b.gps_device_id,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) {
      const { rows } = await db.query('SELECT * FROM vehicles WHERE id=$1', [id]);
      return res.json({ vehicle: decorateVehicle(rows[0]) });
    }
    vals.push(id);
    await db.query(`UPDATE vehicles SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM vehicles WHERE id=$1', [id]);
    auditLog(req, 'update_vehicle', 'vehicles', id);
    res.json({ vehicle: decorateVehicle(after[0]) });
  } catch (e) { next(e); }
});

router.delete('/vehicles/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const own = await assertVehicleOwner(req, id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });

    // If vehicle has any confirmed bookings, soft-delete (is_active=0). Hard delete otherwise.
    const { rows: bk } = await db.query(
      `SELECT COUNT(*) AS c FROM transport_bookings tb
       JOIN transport_routes r ON r.id = tb.route_id
       WHERE r.vehicle_id = $1 AND tb.status IN ('pending','confirmed')`,
      [id]
    );
    const count = parseInt(bk[0].c || bk[0].C || 0, 10);
    if (count > 0) {
      await db.query('UPDATE vehicles SET is_active=0 WHERE id=$1', [id]);
      auditLog(req, 'soft_delete_vehicle', 'vehicles', id, { active_bookings: count });
      return res.json({ ok: true, soft: true, reason: 'has active bookings', active_bookings: count });
    }
    await db.query('DELETE FROM vehicles WHERE id=$1', [id]);
    auditLog(req, 'delete_vehicle', 'vehicles', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ============ ROUTES ============
router.post(
  '/routes',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('vehicle_id').isInt({ min: 1 }),
    body('route_name').isString().notEmpty(),
    body('origin').isString().notEmpty(),
    body('destination').isString().notEmpty(),
    body('departure_time').optional().isString(),
    body('arrival_time').optional().isString(),
    body('price_per_seat').optional().isFloat({ min: 0 }),
    body('days_of_week').optional().isArray(),
    body('stops').optional().isArray(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const own = await assertVehicleOwner(req, req.body.vehicle_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      // Pull camp_id from the vehicle if not supplied
      let campId = b.camp_id || null;
      if (!campId) {
        const { rows: v } = await db.query('SELECT camp_id FROM vehicles WHERE id=$1', [b.vehicle_id]);
        campId = v[0]?.camp_id || null;
      }

      // Normalize days_of_week (lowercase, valid only)
      const daysNorm = Array.isArray(b.days_of_week)
        ? b.days_of_week.map((d) => String(d).slice(0, 3).toLowerCase()).filter((d) => DAYS.includes(d))
        : [];

      const { rows } = await db.query(
        `INSERT INTO transport_routes (vehicle_id, camp_id, route_name, origin, destination,
           stops, departure_time, arrival_time, days_of_week, price_per_seat, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) RETURNING *`,
        [
          b.vehicle_id, campId, b.route_name, b.origin, b.destination,
          JSON.stringify(b.stops || []),
          b.departure_time || null, b.arrival_time || null,
          JSON.stringify(daysNorm),
          parseFloat(b.price_per_seat || 0),
        ]
      );
      auditLog(req, 'create_route', 'transport_routes', rows[0].id);
      res.status(201).json({ route: decorateRoute(rows[0]) });
    } catch (e) { next(e); }
  }
);

router.get('/routes', async (req, res, next) => {
  try {
    const where = ['r.is_active = 1', 'v.is_active = 1']; const params = [];
    if (req.query.camp_id) { params.push(parseInt(req.query.camp_id, 10)); where.push(`r.camp_id=$${params.length}`); }
    if (req.query.origin) { params.push(`%${req.query.origin.toLowerCase()}%`); where.push(`LOWER(r.origin) LIKE $${params.length}`); }
    if (req.query.destination) { params.push(`%${req.query.destination.toLowerCase()}%`); where.push(`LOWER(r.destination) LIKE $${params.length}`); }

    const { rows } = await db.query(
      `SELECT r.*, v.vehicle_type, v.capacity, v.plate_number, v.driver_name,
              c.name AS camp_name, c.city
       FROM transport_routes r
       JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN camps c ON c.id = r.camp_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.departure_time ASC NULLS LAST, r.id DESC`,
      params
    ).catch(async () => {
      // SQLite fallback (no NULLS LAST)
      return db.query(
        `SELECT r.*, v.vehicle_type, v.capacity, v.plate_number, v.driver_name,
                c.name AS camp_name, c.city
         FROM transport_routes r
         JOIN vehicles v ON v.id = r.vehicle_id
         LEFT JOIN camps c ON c.id = r.camp_id
         WHERE ${where.join(' AND ')}
         ORDER BY r.departure_time ASC, r.id DESC`,
        params
      );
    });
    res.json({ routes: rows.map(decorateRoute) });
  } catch (e) { next(e); }
});

router.get('/routes/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, v.vehicle_type, v.capacity, v.plate_number, v.driver_name,
              c.name AS camp_name, c.city
       FROM transport_routes r
       JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN camps c ON c.id = r.camp_id
       WHERE r.id=$1`,
      [parseInt(req.params.id, 10)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Route not found' });
    res.json({ route: decorateRoute(rows[0]) });
  } catch (e) { next(e); }
});

router.put('/routes/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const own = await assertRouteOwner(req, id);
    if (!own.ok) return res.status(own.error).json({ error: own.message });

    const b = req.body;
    const fields = {
      route_name: b.route_name, origin: b.origin, destination: b.destination,
      departure_time: b.departure_time, arrival_time: b.arrival_time,
      price_per_seat: b.price_per_seat != null ? parseFloat(b.price_per_seat) : undefined,
      stops: b.stops !== undefined ? JSON.stringify(b.stops) : undefined,
      days_of_week: b.days_of_week !== undefined
        ? JSON.stringify((Array.isArray(b.days_of_week) ? b.days_of_week : [])
            .map((d) => String(d).slice(0, 3).toLowerCase())
            .filter((d) => DAYS.includes(d)))
        : undefined,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) {
      const { rows } = await db.query('SELECT * FROM transport_routes WHERE id=$1', [id]);
      return res.json({ route: decorateRoute(rows[0]) });
    }
    vals.push(id);
    await db.query(`UPDATE transport_routes SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM transport_routes WHERE id=$1', [id]);
    auditLog(req, 'update_route', 'transport_routes', id);
    res.json({ route: decorateRoute(after[0]) });
  } catch (e) { next(e); }
});

router.post('/routes/:id/stops',
  authRequired, requireRole('owner', 'admin'),
  [body('name').isString().notEmpty(), body('order').optional().isInt({ min: 0 })],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const own = await assertRouteOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows } = await db.query('SELECT stops FROM transport_routes WHERE id=$1', [id]);
      const stops = parseJSON(rows[0].stops, []);
      stops.push({
        name: req.body.name,
        order: req.body.order ?? stops.length,
        lat: Number.isFinite(+req.body.lat) ? +req.body.lat : null,
        lng: Number.isFinite(+req.body.lng) ? +req.body.lng : null,
        time: req.body.time || null,
      });
      stops.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      await db.query('UPDATE transport_routes SET stops=$1 WHERE id=$2', [JSON.stringify(stops), id]);
      auditLog(req, 'add_route_stop', 'transport_routes', id);
      res.json({ stops });
    } catch (e) { next(e); }
  }
);

// ============ SCHEDULES ============
router.get('/schedules', async (req, res, next) => {
  try {
    // Combined view: active routes with vehicle + camp info, grouped by day of week
    const where = ['r.is_active=1', 'v.is_active=1']; const params = [];
    if (req.query.camp_id) { params.push(parseInt(req.query.camp_id, 10)); where.push(`r.camp_id=$${params.length}`); }
    const { rows } = await db.query(
      `SELECT r.id, r.route_name, r.origin, r.destination, r.departure_time, r.arrival_time,
              r.days_of_week, r.price_per_seat, v.vehicle_type, v.capacity, v.plate_number,
              v.driver_name, c.name AS camp_name
       FROM transport_routes r
       JOIN vehicles v ON v.id = r.vehicle_id
       LEFT JOIN camps c ON c.id = r.camp_id
       WHERE ${where.join(' AND ')}
       ORDER BY r.departure_time ASC, r.id DESC`,
      params
    );
    const schedules = rows.map((r) => ({ ...r, days_of_week: parseJSON(r.days_of_week, []) }));
    // Group by day for convenience
    const byDay = {};
    for (const d of DAYS) byDay[d] = [];
    for (const s of schedules) {
      for (const d of s.days_of_week) if (byDay[d]) byDay[d].push(s);
    }
    res.json({ schedules, by_day: byDay });
  } catch (e) { next(e); }
});

// ============ BOOKINGS ============
router.post(
  '/bookings',
  authRequired,
  [
    body('route_id').isInt({ min: 1 }),
    body('travel_date').isString().notEmpty(),
    body('seat_number').optional({ nullable: true }).isInt({ min: 1, max: 200 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { rows: r } = await db.query(
        `SELECT r.*, v.capacity, v.owner_id FROM transport_routes r
         JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id=$1`,
        [req.body.route_id]
      );
      const route = r[0];
      if (!route) return res.status(404).json({ error: 'Route not found' });
      if (!route.is_active) return res.status(400).json({ error: 'Route inactive' });

      // Check seat capacity (count existing pending/confirmed bookings for this date)
      const { rows: existing } = await db.query(
        `SELECT COUNT(*) AS c, COALESCE(MAX(seat_number),0) AS max_seat
         FROM transport_bookings
         WHERE route_id=$1 AND travel_date=$2 AND status IN ('pending','confirmed')`,
        [req.body.route_id, req.body.travel_date]
      );
      const taken = parseInt(existing[0].c || existing[0].C || 0, 10);
      if (taken >= route.capacity) {
        return res.status(409).json({ error: 'No seats available on this date', capacity: route.capacity, taken });
      }

      // Auto-assign seat number if not given
      let seat = req.body.seat_number;
      if (!seat) seat = parseInt(existing[0].max_seat || 0, 10) + 1;
      if (seat > route.capacity) seat = taken + 1;

      // Prevent worker double-booking on the same route+date
      const { rows: dup } = await db.query(
        `SELECT id FROM transport_bookings
         WHERE user_id=$1 AND route_id=$2 AND travel_date=$3 AND status IN ('pending','confirmed') LIMIT 1`,
        [req.user.id, req.body.route_id, req.body.travel_date]
      );
      if (dup[0]) return res.status(409).json({ error: 'You already have a booking on this route for this date' });

      const { rows: ins } = await db.query(
        `INSERT INTO transport_bookings (user_id, route_id, travel_date, seat_number, status, amount)
         VALUES ($1,$2,$3,$4,'confirmed',$5) RETURNING *`,
        [req.user.id, req.body.route_id, req.body.travel_date, seat, route.price_per_seat || 0]
      );

      notify(route.owner_id, {
        type: 'transport_booking',
        title: `Seat booked — ${route.route_name}`,
        body: `Seat #${seat} on ${req.body.travel_date}`,
        link: '/owner/transport',
      });
      auditLog(req, 'create_transport_booking', 'transport_bookings', ins[0].id);
      res.status(201).json({
        booking: ins[0],
        seat_number: seat,
        seats_remaining: route.capacity - taken - 1,
      });
    } catch (e) { next(e); }
  }
);

router.get('/bookings/mine', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT tb.*, r.route_name, r.origin, r.destination, r.departure_time,
              v.vehicle_type, v.plate_number
       FROM transport_bookings tb
       JOIN transport_routes r ON r.id = tb.route_id
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE tb.user_id=$1 ORDER BY tb.travel_date DESC, tb.created_at DESC`,
      [req.user.id]
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

router.put('/bookings/:id/cancel', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM transport_bookings WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Booking not found' });
    if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your booking' });
    }
    if (rows[0].status === 'cancelled') return res.json({ ok: true, already: true });
    await db.query("UPDATE transport_bookings SET status='cancelled' WHERE id=$1", [id]);
    auditLog(req, 'cancel_transport_booking', 'transport_bookings', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Owner sees bookings for their fleet
router.get('/bookings', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    let sql, params;
    if (req.user.role === 'admin') {
      sql = `SELECT tb.*, r.route_name, v.plate_number, u.full_name AS passenger
             FROM transport_bookings tb
             JOIN transport_routes r ON r.id = tb.route_id
             JOIN vehicles v ON v.id = r.vehicle_id
             JOIN users u ON u.id = tb.user_id
             ORDER BY tb.created_at DESC LIMIT 500`;
      params = [];
    } else {
      sql = `SELECT tb.*, r.route_name, v.plate_number, u.full_name AS passenger
             FROM transport_bookings tb
             JOIN transport_routes r ON r.id = tb.route_id
             JOIN vehicles v ON v.id = r.vehicle_id
             JOIN users u ON u.id = tb.user_id
             WHERE v.owner_id=$1 ORDER BY tb.created_at DESC`;
      params = [req.user.id];
    }
    const { rows } = await db.query(sql, params);
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ============ TRACKING (GPS) ============
router.post(
  '/tracking/:vehicleId',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('speed').optional().isFloat({ min: 0 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.vehicleId, 10);
      const own = await assertVehicleOwner(req, id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const { rows } = await db.query(
        `INSERT INTO vehicle_locations (vehicle_id, latitude, longitude, speed)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [id, parseFloat(req.body.latitude), parseFloat(req.body.longitude), parseFloat(req.body.speed || 0)]
      );
      res.status(201).json({ location: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/tracking/:vehicleId', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.vehicleId, 10);
    const { rows } = await db.query(
      `SELECT * FROM vehicle_locations WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 1`,
      [id]
    );
    if (!rows[0]) {
      const cfg = process.env.GPS_PROVIDER_URL ? 'configured' : 'not configured';
      return res.json({ location: null, gps_provider: cfg, message: 'No GPS pings yet' });
    }
    res.json({ location: rows[0] });
  } catch (e) { next(e); }
});

// ============ ADMIN OVERVIEW ============
router.get('/admin/overview', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const q = async (sql) => (await db.query(sql, [])).rows[0];
    const stats = {
      vehicles_total:  parseInt((await q('SELECT COUNT(*) AS c FROM vehicles')).c, 10),
      vehicles_active: parseInt((await q('SELECT COUNT(*) AS c FROM vehicles WHERE is_active=1')).c, 10),
      routes_total:    parseInt((await q('SELECT COUNT(*) AS c FROM transport_routes')).c, 10),
      routes_active:   parseInt((await q('SELECT COUNT(*) AS c FROM transport_routes WHERE is_active=1')).c, 10),
      bookings_total:  parseInt((await q('SELECT COUNT(*) AS c FROM transport_bookings')).c, 10),
      bookings_confirmed: parseInt((await q("SELECT COUNT(*) AS c FROM transport_bookings WHERE status='confirmed'")).c, 10),
      total_revenue: parseFloat((await q("SELECT COALESCE(SUM(amount),0) AS c FROM transport_bookings WHERE status IN ('confirmed')")).c) || 0,
    };
    const { rows: byOwner } = await db.query(
      `SELECT u.full_name AS owner_name, op.company_name,
              COUNT(DISTINCT v.id) AS vehicles, COUNT(DISTINCT r.id) AS routes,
              COUNT(tb.id) AS bookings,
              COALESCE(SUM(CASE WHEN tb.status='confirmed' THEN tb.amount ELSE 0 END),0) AS revenue
       FROM vehicles v
       LEFT JOIN transport_routes r ON r.vehicle_id=v.id
       LEFT JOIN transport_bookings tb ON tb.route_id=r.id
       JOIN users u ON u.id=v.owner_id
       LEFT JOIN owner_profiles op ON op.user_id=u.id
       GROUP BY u.id, u.full_name, op.company_name
       ORDER BY revenue DESC LIMIT 50`
    );
    res.json({ stats, by_owner: byOwner });
  } catch (e) { next(e); }
});

module.exports = router;
