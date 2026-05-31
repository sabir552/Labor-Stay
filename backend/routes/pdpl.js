/**
 * PDPL data privacy endpoints (F7).
 *
 *   GET    /api/users/me/export-data      — download all my data as JSON
 *   POST   /api/users/me/delete-account   — request account deletion
 *   GET    /api/admin/deletion-requests   — list (admin)
 *   PUT    /api/admin/deletion-requests/:id/process — approve+anonymize | reject
 */
const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

async function safeQuery(sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return r.rows;
  } catch (e) { return []; }
}

// ---------- USER: export all data ----------
router.get('/users/me/export-data', authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const pkg = {
      generated_at: new Date().toISOString(),
      pdpl_notice: 'This JSON contains all personal data LaborStay holds about you, per Saudi PDPL Article 8.',
      user:            await safeQuery('SELECT id,role,full_name,email,phone,preferred_language,preferred_currency,is_active,is_verified,created_at FROM users WHERE id=$1',[uid]),
      worker_profile:  await safeQuery('SELECT * FROM worker_profiles WHERE user_id=$1', [uid]),
      owner_profile:   await safeQuery('SELECT * FROM owner_profiles  WHERE user_id=$1', [uid]),
      bookings:        await safeQuery('SELECT * FROM bookings WHERE worker_id=$1 ORDER BY created_at DESC', [uid]),
      payments:        await safeQuery('SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC', [uid]),
      reviews:         await safeQuery('SELECT * FROM reviews WHERE worker_id=$1', [uid]),
      messages:        await safeQuery('SELECT * FROM messages WHERE sender_id=$1 OR receiver_id=$1', [uid]),
      notifications:   await safeQuery('SELECT * FROM notifications WHERE user_id=$1', [uid]),
      waiting_list:    await safeQuery('SELECT * FROM waiting_list WHERE worker_id=$1', [uid]),
      worker_service_requests: await safeQuery('SELECT * FROM worker_service_requests WHERE worker_id=$1', [uid]),
      loyalty_points:  await safeQuery('SELECT * FROM loyalty_points WHERE user_id=$1', [uid]),
      referrals:       await safeQuery('SELECT * FROM referrals WHERE referrer_id=$1 OR referred_id=$1', [uid]),
      sessions:        await safeQuery('SELECT id,device_info,ip_address,created_at,last_used_at FROM sessions WHERE user_id=$1', [uid]),
    };
    auditLog(req, 'pdpl_export_data', 'user', uid);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="laborstay-data-${uid}.json"`);
    res.send(JSON.stringify(pkg, null, 2));
  } catch (e) { next(e); }
});

// ---------- USER: request account deletion ----------
router.post('/users/me/delete-account',
  authRequired,
  [body('password').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const { rows: u } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
      const ok = await bcrypt.compare(req.body.password || '', u[0]?.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Wrong password' });

      // De-dup: don't create a second pending request
      const { rows: ex } = await db.query(
        `SELECT id FROM deletion_requests WHERE user_id=$1 AND status='pending' LIMIT 1`,
        [req.user.id]
      );
      if (ex[0]) return res.json({ ok: true, message: 'Already requested', id: ex[0].id });

      const { rows } = await db.query(
        `INSERT INTO deletion_requests (user_id, reason, status) VALUES ($1,$2,'pending') RETURNING *`,
        [req.user.id, req.body.reason || null]
      );
      auditLog(req, 'pdpl_request_deletion', 'user', req.user.id);
      res.status(201).json({ request: rows[0], message: 'Deletion request submitted. Admin will review within 30 days per PDPL.' });
    } catch (e) { next(e); }
  }
);

// ---------- ADMIN ----------
router.get('/admin/deletion-requests',
  authRequired, requireRole('admin'),
  async (_req, res, next) => {
    try {
      const { rows } = await db.query(
        `SELECT d.*, u.full_name, u.email
         FROM deletion_requests d JOIN users u ON u.id = d.user_id
         ORDER BY d.created_at DESC LIMIT 200`
      );
      res.json({ requests: rows });
    } catch (e) { next(e); }
  }
);

router.put('/admin/deletion-requests/:id/process',
  authRequired, requireRole('admin'),
  [body('action').isIn(['approve', 'reject'])],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query('SELECT * FROM deletion_requests WHERE id=$1', [id]);
      if (!rows[0]) return res.status(404).json({ error: 'Request not found' });
      const dr = rows[0];

      if (req.body.action === 'reject') {
        await db.query(
          `UPDATE deletion_requests SET status='rejected', processed_by=$1, processed_at=CURRENT_TIMESTAMP WHERE id=$2`,
          [req.user.id, id]
        );
        auditLog(req, 'pdpl_reject_deletion', 'deletion_request', id);
        return res.json({ ok: true, action: 'rejected' });
      }

      // Approve: anonymize the user. Keep booking history (legal/tax retention)
      // but strip personally-identifying data.
      const anonEmail = `deleted-${dr.user_id}@laborstay.deleted`;
      await db.query(
        `UPDATE users SET full_name='[deleted user]', email=$1, phone=NULL,
           password_hash='x', is_active=0, avatar_url=NULL, updated_at=CURRENT_TIMESTAMP
         WHERE id=$2`,
        [anonEmail, dr.user_id]
      );
      try { await db.query(`UPDATE worker_profiles SET nationality=NULL, iqama_number=NULL,
          iqama_expiry=NULL, iqama_photo_url=NULL, iqama_verified=0 WHERE user_id=$1`, [dr.user_id]); } catch {}
      try { await db.query(`UPDATE owner_profiles SET company_name=NULL, cr_number=NULL,
          vat_number=NULL, address=NULL WHERE user_id=$1`, [dr.user_id]); } catch {}
      try { await db.query(`DELETE FROM sessions  WHERE user_id=$1`, [dr.user_id]); } catch {}
      try { await db.query(`DELETE FROM user_2fa  WHERE user_id=$1`, [dr.user_id]); } catch {}
      try { await db.query(`DELETE FROM messages  WHERE sender_id=$1 OR receiver_id=$1`, [dr.user_id]); } catch {}

      await db.query(
        `UPDATE deletion_requests SET status='completed', processed_by=$1, processed_at=CURRENT_TIMESTAMP WHERE id=$2`,
        [req.user.id, id]
      );
      auditLog(req, 'pdpl_complete_deletion', 'user', dr.user_id);
      res.json({ ok: true, action: 'completed', user_id: dr.user_id });
    } catch (e) { next(e); }
  }
);

module.exports = router;
