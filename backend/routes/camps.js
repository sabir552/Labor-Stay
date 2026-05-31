/**
 * Camps routes
 *   GET    /api/camps/search          — full text/filter/sort/paginate
 *   GET    /api/camps/featured        — featured carousel
 *   GET    /api/camps/owner/my-camps  — owner's camps
 *   GET    /api/camps/:id             — full detail (photos, rooms, reviews, owner)
 *   POST   /api/camps                 — owner creates
 *   PUT    /api/camps/:id             — owner updates
 *   DELETE /api/camps/:id             — owner deletes
 *   POST   /api/camps/:id/photos      — owner uploads photos (multi)
 *   DELETE /api/camps/:id/photos/:pid — owner removes a photo
 */
const express = require('express');
const path = require('path');
const { body, query, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole, optionalAuth } = require('../middleware/auth');
const { makeUploader, publicUrl } = require('../middleware/upload');
const { auditLog } = require('../middleware/auditLog');
const { CAMP_TYPES, KSA_CITIES } = require('../config/constants');

const router = express.Router();
const photoUploader = makeUploader('camps', { maxSizeMB: 5 });

// --------- helpers ---------
function parseJSON(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function decorateCamp(row) {
  if (!row) return row;
  return {
    ...row,
    amenities: parseJSON(row.amenities, []),
    nearby_pois: parseJSON(row.nearby_pois, []),
    nationality_preference: parseJSON(row.nationality_preference, []),
    is_featured: !!row.is_featured,
    family_allowed: !!row.family_allowed,
    smoking_allowed: !!row.smoking_allowed,
  };
}

async function attachCover(camps) {
  if (!camps.length) return camps;
  const ids = camps.map((c) => c.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT camp_id, url, is_cover FROM camp_photos WHERE camp_id IN (${placeholders}) ORDER BY is_cover DESC, id ASC`,
    ids
  );
  const byCamp = {};
  for (const p of rows) {
    if (!byCamp[p.camp_id]) byCamp[p.camp_id] = [];
    byCamp[p.camp_id].push(p.url);
  }
  return camps.map((c) => ({
    ...c,
    cover_photo: byCamp[c.id]?.[0] || null,
    photos_count: byCamp[c.id]?.length || 0,
  }));
}

async function attachMinPrice(camps) {
  if (!camps.length) return camps;
  const ids = camps.map((c) => c.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT camp_id, MIN(price_per_day) as min_day, MIN(price_per_month) as min_month
     FROM rooms WHERE is_active = 1 AND camp_id IN (${placeholders}) GROUP BY camp_id`,
    ids
  );
  const byCamp = Object.fromEntries(rows.map((r) => [r.camp_id, r]));
  return camps.map((c) => ({
    ...c,
    min_price_day: byCamp[c.id]?.min_day || null,
    min_price_month: byCamp[c.id]?.min_month || null,
  }));
}

// --------- SEARCH ---------
router.get('/search', optionalAuth, async (req, res, next) => {
  try {
    const {
      q, city, region, camp_type, family_allowed, smoking_allowed,
      nationality, min_price, max_price, min_rating, amenities,
      available_only, lat, lng, radius_km,
      sort = 'featured', page = 1, limit = 12,
    } = req.query;

    const where = ["status = 'approved'"];
    const params = [];
    const add = (clause, val) => { params.push(val); where.push(clause.replace('?', `$${params.length}`)); };

    if (q) {
      params.push(`%${q.toLowerCase()}%`); params.push(`%${q.toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length - 1} OR LOWER(description) LIKE $${params.length})`);
    }
    if (city) add('city = ?', city);
    if (region) add('region = ?', region);
    if (camp_type) add('camp_type = ?', camp_type);
    if (family_allowed === 'true') where.push('family_allowed = 1');
    if (smoking_allowed === 'true') where.push('smoking_allowed = 1');
    if (min_rating) add('rating >= ?', parseFloat(min_rating));

    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const offset = (pageNum - 1) * lim;

    // Sort
    let orderBy = 'is_featured DESC, rating DESC, id DESC';
    if (sort === 'rating') orderBy = 'rating DESC, review_count DESC';
    else if (sort === 'newest') orderBy = 'created_at DESC';
    else if (sort === 'price_asc') orderBy = 'id ASC';   // handled post-fetch (rooms join)
    else if (sort === 'price_desc') orderBy = 'id DESC';

    const sql = `SELECT * FROM camps WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT ${lim} OFFSET ${offset}`;
    const { rows } = await db.query(sql, params);

    // Total count
    const countSql = `SELECT COUNT(*) as c FROM camps WHERE ${where.join(' AND ')}`;
    const { rows: cRows } = await db.query(countSql, params);
    let total = parseInt(cRows[0].c || cRows[0].C || 0, 10);

    let camps = rows.map(decorateCamp);
    camps = await attachCover(camps);
    camps = await attachMinPrice(camps);

    // Post-filters that need decorated data
    if (nationality) {
      camps = camps.filter((c) =>
        !c.nationality_preference?.length ||
        c.nationality_preference.map((n) => n.toLowerCase()).includes(nationality.toLowerCase())
      );
    }
    if (amenities) {
      const wanted = amenities.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      camps = camps.filter((c) => {
        const have = (c.amenities || []).map((a) => a.toLowerCase());
        return wanted.every((w) => have.includes(w));
      });
    }
    if (min_price) camps = camps.filter((c) => c.min_price_day != null && c.min_price_day >= parseFloat(min_price));
    if (max_price) camps = camps.filter((c) => c.min_price_day != null && c.min_price_day <= parseFloat(max_price));

    if (available_only === 'true') {
      const ids = camps.map((c) => c.id);
      if (ids.length) {
        const ph = ids.map((_, i) => `$${i + 1}`).join(',');
        const { rows: avail } = await db.query(
          `SELECT camp_id, SUM(available_beds) as beds FROM rooms WHERE is_active = 1 AND camp_id IN (${ph}) GROUP BY camp_id`,
          ids
        );
        const m = Object.fromEntries(avail.map((r) => [r.camp_id, r.beds]));
        camps = camps.filter((c) => (m[c.id] || 0) > 0);
      }
    }

    // GPS radius filter
    if (lat && lng && radius_km) {
      const la = parseFloat(lat), ln = parseFloat(lng), r = parseFloat(radius_km);
      camps = camps
        .map((c) => ({ ...c, distance_km: c.latitude && c.longitude ? haversineKm(la, ln, +c.latitude, +c.longitude) : null }))
        .filter((c) => c.distance_km != null && c.distance_km <= r);
      if (sort === 'distance') camps.sort((a, b) => a.distance_km - b.distance_km);
    }

    if (sort === 'price_asc') camps.sort((a, b) => (a.min_price_day ?? 1e9) - (b.min_price_day ?? 1e9));
    if (sort === 'price_desc') camps.sort((a, b) => (b.min_price_day ?? -1) - (a.min_price_day ?? -1));

    res.json({
      camps,
      page: pageNum,
      limit: lim,
      total,
      total_pages: Math.ceil(total / lim),
    });
  } catch (e) { next(e); }
});

// --------- FEATURED ---------
router.get('/featured', async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM camps WHERE status = 'approved' AND is_featured = 1 ORDER BY rating DESC LIMIT 8`
    );
    let camps = rows.map(decorateCamp);
    camps = await attachCover(camps);
    camps = await attachMinPrice(camps);
    res.json({ camps });
  } catch (e) { next(e); }
});

// --------- OWNER'S CAMPS ---------
router.get('/owner/my-camps', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const ownerFilter = req.user.role === 'admin' && req.query.owner_id
      ? parseInt(req.query.owner_id, 10) : req.user.id;
    const { rows } = await db.query(
      `SELECT * FROM camps WHERE owner_id = $1 ORDER BY created_at DESC`,
      [ownerFilter]
    );
    let camps = rows.map(decorateCamp);
    camps = await attachCover(camps);
    camps = await attachMinPrice(camps);

    // Add occupancy stats
    for (const c of camps) {
      const { rows: stat } = await db.query(
        `SELECT SUM(capacity) as cap, SUM(available_beds) as free FROM rooms WHERE camp_id = $1 AND is_active = 1`,
        [c.id]
      );
      c.total_capacity = parseInt(stat[0].cap || 0, 10);
      c.total_available = parseInt(stat[0].free || 0, 10);
      c.occupancy_pct = c.total_capacity > 0
        ? Math.round(((c.total_capacity - c.total_available) / c.total_capacity) * 100) : 0;
    }
    res.json({ camps });
  } catch (e) { next(e); }
});

// --------- DETAIL ---------
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    // If :id is not a number (e.g. 'compare'), fall through to next router.
    if (!Number.isFinite(id)) return next();
    const { rows } = await db.query('SELECT * FROM camps WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Camp not found' });
    const camp = decorateCamp(rows[0]);

    // Photos
    const { rows: photos } = await db.query(
      'SELECT id, url, is_cover FROM camp_photos WHERE camp_id = $1 ORDER BY is_cover DESC, id ASC',
      [id]
    );
    // Rooms
    const { rows: rooms } = await db.query(
      'SELECT * FROM rooms WHERE camp_id = $1 ORDER BY price_per_day ASC',
      [id]
    );
    const decoratedRooms = rooms.map((r) => ({
      ...r,
      amenities: parseJSON(r.amenities, []),
      photos: parseJSON(r.photos, []),
      is_active: !!r.is_active,
    }));
    // Reviews
    const { rows: reviews } = await db.query(
      `SELECT r.*, u.full_name AS worker_name, u.avatar_url
       FROM reviews r JOIN users u ON u.id = r.worker_id
       WHERE r.camp_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
      [id]
    );
    // Owner (limited public info)
    const { rows: owner } = await db.query(
      `SELECT u.id, u.full_name, u.phone, u.avatar_url, op.company_name
       FROM users u LEFT JOIN owner_profiles op ON op.user_id = u.id WHERE u.id = $1`,
      [camp.owner_id]
    );

    // Hide owner phone unless requester has a confirmed booking for this camp
    let ownerInfo = owner[0] || null;
    if (ownerInfo) {
      let canSeeContact = false;
      if (req.user && (req.user.role === 'admin' || req.user.id === ownerInfo.id)) canSeeContact = true;
      else if (req.user) {
        const { rows: bk } = await db.query(
          `SELECT id FROM bookings WHERE worker_id = $1 AND camp_id = $2 AND status IN ('confirmed','checked_in','checked_out') LIMIT 1`,
          [req.user.id, id]
        );
        canSeeContact = bk.length > 0;
      }
      if (!canSeeContact) ownerInfo = { ...ownerInfo, phone: null };
    }

    res.json({ camp, photos, rooms: decoratedRooms, reviews, owner: ownerInfo });
  } catch (e) { next(e); }
});

// --------- CREATE ---------
router.post(
  '/',
  authRequired,
  requireRole('owner', 'admin'),
  [
    body('name').isString().isLength({ min: 2 }),
    body('city').isString().notEmpty(),
    body('camp_type').isIn(CAMP_TYPES),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO camps (owner_id, name, description, camp_type, address, city, region, latitude, longitude,
                            amenities, nearby_pois, nationality_preference, family_allowed, smoking_allowed,
                            rules, licence_number, capacity, emergency_contact, status, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending',0) RETURNING *`,
        [
          req.user.id, b.name, b.description || '', b.camp_type,
          b.address || '', b.city, b.region || '',
          b.latitude || null, b.longitude || null,
          JSON.stringify(b.amenities || []),
          JSON.stringify(b.nearby_pois || []),
          JSON.stringify(b.nationality_preference || []),
          b.family_allowed ? 1 : 0,
          b.smoking_allowed ? 1 : 0,
          b.rules || '', b.licence_number || '',
          parseInt(b.capacity || 0, 10), b.emergency_contact || '',
        ]
      );
      const camp = decorateCamp(rows[0]);
      auditLog(req, 'create_camp', 'camp', camp.id);
      res.status(201).json({ camp });
    } catch (e) { next(e); }
  }
);

// --------- UPDATE ---------
router.put('/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM camps WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Camp not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    const b = req.body;
    const fields = {
      name: b.name, description: b.description, camp_type: b.camp_type,
      address: b.address, city: b.city, region: b.region,
      latitude: b.latitude, longitude: b.longitude,
      amenities: b.amenities !== undefined ? JSON.stringify(b.amenities) : undefined,
      nearby_pois: b.nearby_pois !== undefined ? JSON.stringify(b.nearby_pois) : undefined,
      nationality_preference: b.nationality_preference !== undefined ? JSON.stringify(b.nationality_preference) : undefined,
      family_allowed: b.family_allowed !== undefined ? (b.family_allowed ? 1 : 0) : undefined,
      smoking_allowed: b.smoking_allowed !== undefined ? (b.smoking_allowed ? 1 : 0) : undefined,
      rules: b.rules, licence_number: b.licence_number,
      capacity: b.capacity, emergency_contact: b.emergency_contact,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k} = $${vals.length}`); }
    }
    if (!sets.length) return res.json({ camp: decorateCamp(cur[0]) });
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    vals.push(id);
    await db.query(`UPDATE camps SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM camps WHERE id = $1', [id]);
    auditLog(req, 'update_camp', 'camp', id);
    res.json({ camp: decorateCamp(after[0]) });
  } catch (e) { next(e); }
});

// --------- DELETE ---------
router.delete('/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT owner_id FROM camps WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Camp not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    await db.query('DELETE FROM camps WHERE id = $1', [id]);
    auditLog(req, 'delete_camp', 'camp', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// --------- PHOTOS ---------
router.post(
  '/:id/photos',
  authRequired,
  requireRole('owner', 'admin'),
  photoUploader.array('photos', 10),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows: cur } = await db.query('SELECT owner_id FROM camps WHERE id = $1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Camp not found' });
      if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

      const { rows: existing } = await db.query('SELECT COUNT(*) as c FROM camp_photos WHERE camp_id = $1', [id]);
      const isFirstBatch = parseInt(existing[0].c || 0, 10) === 0;

      const saved = [];
      for (let i = 0; i < req.files.length; i++) {
        const rel = path.join('camps', req.files[i].filename).replace(/\\/g, '/');
        const url = publicUrl(req, rel);
        const cover = isFirstBatch && i === 0 ? 1 : 0;
        const ins = await db.query(
          `INSERT INTO camp_photos (camp_id, url, is_cover) VALUES ($1,$2,$3) RETURNING *`,
          [id, url, cover]
        );
        saved.push(ins.rows[0]);
      }
      auditLog(req, 'upload_camp_photos', 'camp', id, { count: saved.length });
      res.status(201).json({ photos: saved });
    } catch (e) { next(e); }
  }
);

router.delete('/:id/photos/:pid', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pid = parseInt(req.params.pid, 10);
    const { rows: cur } = await db.query('SELECT owner_id FROM camps WHERE id = $1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Camp not found' });
    if (req.user.role !== 'admin' && cur[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camp' });
    }
    await db.query('DELETE FROM camp_photos WHERE id = $1 AND camp_id = $2', [pid, id]);
    auditLog(req, 'delete_camp_photo', 'camp', id, { photo: pid });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
