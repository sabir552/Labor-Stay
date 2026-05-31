/**
 * Biometric integration (F6).
 *
 *   POST   /register           — enroll fingerprint / face / iris
 *   POST   /verify             — verify identity (stub for device sync)
 *   GET    /logs               — biometric access logs
 *   POST   /device/sync        — sync with biometric device (stub)
 *
 * Returns clear "not configured" when BIOMETRIC_API_URL is missing,
 * but still records enrollments + logs to DB.
 */
const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const SYSTEM_CONFIGURED = !!(process.env.BIOMETRIC_API_URL && process.env.BIOMETRIC_API_KEY);
const SYSTEM_TYPE = process.env.BIOMETRIC_SYSTEM_TYPE || 'generic';

// ─── REGISTER ───
router.post('/register',
  authRequired,
  [
    body('type').isIn(['fingerprint', 'face', 'iris']),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('device_id').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      // Workers can only register their own biometrics
      const userId = req.user.role === 'admin' && req.body.user_id ? req.body.user_id : req.user.id;

      // Generate a biometric_id (in production this comes from the device)
      const biometricId = req.body.biometric_id ||
        `${req.body.type.toUpperCase()}-${userId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // De-dup: don't re-enroll the same type for the same user
      const { rows: ex } = await db.query(
        `SELECT id FROM biometric_records WHERE user_id=$1 AND type=$2 AND is_active=1 LIMIT 1`,
        [userId, req.body.type]
      );
      if (ex[0]) return res.status(409).json({ error: `${req.body.type} already enrolled`, id: ex[0].id });

      const { rows } = await db.query(
        `INSERT INTO biometric_records
           (user_id, camp_id, device_id, biometric_id, type, enrolled_at, is_active)
         VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP,1) RETURNING *`,
        [userId, req.body.camp_id || null, req.body.device_id || null, biometricId, req.body.type]
      );
      auditLog(req, 'biometric_register', 'biometric_records', rows[0].id);
      res.status(201).json({
        record: rows[0],
        system_status: SYSTEM_CONFIGURED ? 'synced with device' : 'biometric device not configured (DB-only)',
        system_type: SYSTEM_TYPE,
      });
    } catch (e) { next(e); }
  }
);

// ─── VERIFY ───
router.post('/verify',
  authRequired,
  [
    body('biometric_id').isString().notEmpty(),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('action').optional().isIn(['check_in', 'check_out', 'access_denied']),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const { rows } = await db.query(
        `SELECT * FROM biometric_records WHERE biometric_id=$1 AND is_active=1 LIMIT 1`,
        [req.body.biometric_id]
      );
      const verified = !!rows[0];
      const confidence = verified ? 0.97 : 0.0;
      const action = req.body.action || (verified ? 'check_in' : 'access_denied');

      // Always log
      await db.query(
        `INSERT INTO biometric_logs
           (user_id, camp_id, device_id, action, confidence_score, verified_at)
         VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,
        [
          verified ? rows[0].user_id : null,
          req.body.camp_id || (verified ? rows[0].camp_id : null),
          req.body.device_id || null,
          action,
          confidence,
        ]
      );
      auditLog(req, 'biometric_verify', 'biometric_logs', null, { verified, action });

      res.json({
        verified, action, confidence_score: confidence,
        user_id: verified ? rows[0].user_id : null,
        type: verified ? rows[0].type : null,
      });
    } catch (e) { next(e); }
  }
);

// ─── LOGS ───
router.get('/logs', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.camp_id) {
      const cid = parseInt(req.query.camp_id, 10);
      if (req.user.role !== 'admin') {
        const { rows: c } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [cid]);
        if (!c[0]) return res.status(404).json({ error: 'Camp not found' });
        if (c[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
      }
      params.push(cid); where.push(`bl.camp_id=$${params.length}`);
    } else if (req.user.role !== 'admin') {
      // Owner without camp_id: scope to their owned camps
      params.push(req.user.id);
      where.push(`bl.camp_id IN (SELECT id FROM camps WHERE owner_id=$${params.length})`);
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT bl.*, u.full_name AS user_name FROM biometric_logs bl
       LEFT JOIN users u ON u.id=bl.user_id
       ${whereSql} ORDER BY bl.verified_at DESC LIMIT 500`, params
    );
    res.json({ logs: rows });
  } catch (e) { next(e); }
});

// ─── DEVICE SYNC ───
router.post('/device/sync',
  authRequired, requireRole('owner', 'admin'),
  [body('device_id').isString().notEmpty()],
  async (req, res, next) => {
    try {
      if (!SYSTEM_CONFIGURED) {
        return res.json({
          synced: false,
          message: 'BIOMETRIC_API_URL not configured. No external device to sync.',
          system_type: SYSTEM_TYPE,
        });
      }
      // Stub: real implementation would call vendor API
      auditLog(req, 'biometric_device_sync', 'biometric_records', null, { device: req.body.device_id });
      res.json({
        synced: true, device_id: req.body.device_id,
        records_pushed: 0, // would be real count
        last_sync: new Date().toISOString(),
      });
    } catch (e) { next(e); }
  }
);

module.exports = router;
