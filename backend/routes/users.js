/**
 * Users routes:
 *   GET    /api/users/me                  — current profile (worker/owner)
 *   PUT    /api/users/me                  — update profile (alias of /auth/update-profile)
 *   POST   /api/users/me/iqama-photo      — worker: upload Iqama photo
 *   PUT    /api/users/me/language         — quick lang switcher
 *   GET    /api/users/:id                 — public-safe view (admins / owners may see more)
 */
const express = require('express');
const path = require('path');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { makeUploader, publicUrl } = require('../middleware/upload');
const { auditLog } = require('../middleware/auditLog');
const { loadFullProfile, sanitize } = require('./auth');

const router = express.Router();
const iqamaUploader = makeUploader('iqama', { allowPdf: true, maxSizeMB: 5 });

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await loadFullProfile(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

router.put('/me', authRequired, async (req, res, next) => {
  try {
    const { full_name, phone, preferred_language, avatar_url } = req.body;
    await db.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         preferred_language = COALESCE($3, preferred_language),
         avatar_url = COALESCE($4, avatar_url),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [full_name || null, phone || null, preferred_language || null, avatar_url || null, req.user.id]
    );
    if (req.user.role === 'worker') {
      const { nationality, iqama_number, iqama_expiry } = req.body;
      await db.query(
        `UPDATE worker_profiles SET
           nationality = COALESCE($1, nationality),
           iqama_number = COALESCE($2, iqama_number),
           iqama_expiry = COALESCE($3, iqama_expiry)
         WHERE user_id = $4`,
        [nationality || null, iqama_number || null, iqama_expiry || null, req.user.id]
      );
    } else if (req.user.role === 'owner' || req.user.role === 'provider') {
      const { company_name, cr_number, vat_number, address } = req.body;
      await db.query(
        `UPDATE owner_profiles SET
           company_name = COALESCE($1, company_name),
           cr_number = COALESCE($2, cr_number),
           vat_number = COALESCE($3, vat_number),
           address = COALESCE($4, address)
         WHERE user_id = $5`,
        [company_name || null, cr_number || null, vat_number || null, address || null, req.user.id]
      );
    }
    auditLog(req, 'update_profile_self', 'user', req.user.id);
    const user = await loadFullProfile(req.user.id);
    res.json({ user });
  } catch (e) { next(e); }
});

router.post(
  '/me/iqama-photo',
  authRequired,
  requireRole('worker'),
  iqamaUploader.single('photo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const rel = path.join('iqama', req.file.filename).replace(/\\/g, '/');
      const url = publicUrl(req, rel);
      await db.query(
        `UPDATE worker_profiles SET iqama_photo_url = $1, iqama_verified = 0 WHERE user_id = $2`,
        [url, req.user.id]
      );
      auditLog(req, 'upload_iqama', 'user', req.user.id);
      res.json({ ok: true, iqama_photo_url: url });
    } catch (e) { next(e); }
  }
);

router.put('/me/language', authRequired, async (req, res, next) => {
  try {
    const { lang } = req.body;
    if (!['en', 'ar', 'ur'].includes(lang)) return res.status(400).json({ error: 'Invalid language' });
    await db.query('UPDATE users SET preferred_language = $1 WHERE id = $2', [lang, req.user.id]);
    res.json({ ok: true, preferred_language: lang });
  } catch (e) { next(e); }
});

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await db.query(
      'SELECT id, role, full_name, avatar_url, preferred_language, created_at FROM users WHERE id = $1',
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;
