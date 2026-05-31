/**
 * CCTV camera registration (F4).
 *
 *   POST   /cameras                — register camera (owner)
 *   GET    /cameras/camp/:campId   — list cameras for camp
 *   GET    /cameras/:id            — detail
 *   PUT    /cameras/:id            — update
 *   DELETE /cameras/:id            — remove
 *   GET    /cameras/:id/feed       — stream URL (placeholder)
 *   POST   /cameras/:id/snapshot   — request snapshot URL (placeholder)
 *
 * Returns clear "not configured" when CCTV_SYSTEM_TYPE / CCTV_API_URL is missing.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const SYSTEM_TYPE = process.env.CCTV_SYSTEM_TYPE || 'generic';
const SYSTEM_CONFIGURED = !!(process.env.CCTV_API_URL && process.env.CCTV_API_KEY);

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

router.post('/cameras',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('camera_name').isString().notEmpty(),
    body('camera_type').optional().isIn(['ip', 'analog', 'ptz']),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO cctv_cameras
           (camp_id, camera_name, location_description, stream_url, snapshot_url,
            camera_type, manufacturer, model, ip_address, username, password, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1) RETURNING *`,
        [
          b.camp_id, b.camera_name, b.location_description || null,
          b.stream_url || null, b.snapshot_url || null,
          b.camera_type || 'ip',
          b.manufacturer || null, b.model || null, b.ip_address || null,
          b.username || null, b.password || null,
        ]
      );
      auditLog(req, 'create_cctv', 'cctv_cameras', rows[0].id);
      // Strip password from response
      const out = { ...rows[0] }; delete out.password;
      res.status(201).json({ camera: out });
    } catch (e) { next(e); }
  }
);

router.get('/cameras/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const own = await assertCampOwner(req, campId);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    const { rows } = await db.query(
      'SELECT id, camp_id, camera_name, location_description, stream_url, snapshot_url, camera_type, manufacturer, model, ip_address, username, is_active, created_at FROM cctv_cameras WHERE camp_id=$1',
      [campId]
    );
    res.json({
      cameras: rows,
      system_status: SYSTEM_CONFIGURED ? 'configured' : 'CCTV system not configured',
      system_type: SYSTEM_TYPE,
    });
  } catch (e) { next(e); }
});

router.get('/cameras/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT cc.*, c.owner_id FROM cctv_cameras cc JOIN camps c ON c.id=cc.camp_id WHERE cc.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camera' });
    }
    const out = { ...rows[0] }; delete out.password; delete out.owner_id;
    res.json({ camera: out });
  } catch (e) { next(e); }
});

router.put('/cameras/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT cc.*, c.owner_id FROM cctv_cameras cc JOIN camps c ON c.id=cc.camp_id WHERE cc.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camera' });
    }
    const b = req.body;
    const fields = {
      camera_name: b.camera_name, location_description: b.location_description,
      stream_url: b.stream_url, snapshot_url: b.snapshot_url,
      manufacturer: b.manufacturer, model: b.model, ip_address: b.ip_address,
      username: b.username, password: b.password,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    if (!sets.length) return res.json({ ok: true });
    vals.push(id);
    await db.query(`UPDATE cctv_cameras SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    auditLog(req, 'update_cctv', 'cctv_cameras', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.delete('/cameras/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT cc.*, c.owner_id FROM cctv_cameras cc JOIN camps c ON c.id=cc.camp_id WHERE cc.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camera' });
    }
    await db.query('DELETE FROM cctv_cameras WHERE id=$1', [id]);
    auditLog(req, 'delete_cctv', 'cctv_cameras', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/cameras/:id/feed', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT cc.*, c.owner_id FROM cctv_cameras cc JOIN camps c ON c.id=cc.camp_id WHERE cc.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camera' });
    }
    if (!SYSTEM_CONFIGURED) {
      return res.json({
        status: 'CCTV not configured',
        stream_url: rows[0].stream_url || null,
        message: 'Direct stream URL from device. Set CCTV_API_URL + CCTV_API_KEY for managed streaming.',
      });
    }
    // Real implementation would proxy / sign the URL here
    res.json({
      stream_url: rows[0].stream_url,
      system_type: SYSTEM_TYPE,
      expires_in: 300,
    });
  } catch (e) { next(e); }
});

router.post('/cameras/:id/snapshot', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT cc.*, c.owner_id FROM cctv_cameras cc JOIN camps c ON c.id=cc.camp_id WHERE cc.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Camera not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your camera' });
    }
    if (!SYSTEM_CONFIGURED) {
      return res.json({
        status: 'CCTV not configured',
        snapshot_url: rows[0].snapshot_url || null,
        message: 'Returning configured static snapshot_url. Live capture requires CCTV API.',
      });
    }
    res.json({
      snapshot_url: rows[0].snapshot_url + `?t=${Date.now()}`,
      captured_at: new Date().toISOString(),
    });
  } catch (e) { next(e); }
});

module.exports = router;
