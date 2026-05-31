/**
 * Reviews routes
 *   POST   /api/reviews                 — worker leaves a review (must have a booking)
 *   GET    /api/reviews/camp/:campId    — list reviews for a camp
 *   PUT    /api/reviews/:id/reply       — camp owner replies
 *   DELETE /api/reviews/:id             — admin removes
 *
 * Side effect: when a review is created/deleted/changed, the parent camp's
 * `rating` (avg) and `review_count` are recomputed.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

async function recomputeCampRating(campId) {
  const { rows } = await db.query(
    `SELECT AVG(rating) AS avg_rating, COUNT(*) AS cnt FROM reviews WHERE camp_id = $1`,
    [campId]
  );
  const avg = parseFloat(rows[0].avg_rating || rows[0].AVG_RATING || 0) || 0;
  const cnt = parseInt(rows[0].cnt || rows[0].CNT || 0, 10);
  await db.query(
    `UPDATE camps SET rating = $1, review_count = $2 WHERE id = $3`,
    [Math.round(avg * 10) / 10, cnt, campId]
  );
}

router.post(
  '/',
  authRequired,
  requireRole('worker'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().isLength({ max: 2000 }),
    body('booking_id').optional().isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { camp_id, booking_id, rating, comment } = req.body;

      // Must have a confirmed/checked-out booking at this camp
      const { rows: bk } = await db.query(
        `SELECT id FROM bookings WHERE worker_id = $1 AND camp_id = $2
         AND status IN ('confirmed','checked_in','checked_out') LIMIT 1`,
        [req.user.id, camp_id]
      );
      if (!bk[0]) {
        return res.status(403).json({ error: 'You can only review a camp after staying at it.' });
      }

      // One review per worker per camp
      const { rows: ex } = await db.query(
        `SELECT id FROM reviews WHERE worker_id = $1 AND camp_id = $2 LIMIT 1`,
        [req.user.id, camp_id]
      );
      if (ex[0]) return res.status(409).json({ error: 'You have already reviewed this camp.' });

      const { rows } = await db.query(
        `INSERT INTO reviews (camp_id, worker_id, booking_id, rating, comment)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [camp_id, req.user.id, booking_id || null, rating, comment || '']
      );
      await recomputeCampRating(camp_id);

      // Notify owner
      const { rows: c } = await db.query('SELECT owner_id, name FROM camps WHERE id = $1', [camp_id]);
      if (c[0]) {
        notify(c[0].owner_id, {
          type: 'new_review',
          title: `New ${rating}★ review for ${c[0].name}`,
          body: comment ? comment.slice(0, 120) : '',
          link: `/owner/camps/${camp_id}`,
        });
      }
      auditLog(req, 'create_review', 'review', rows[0].id);
      res.status(201).json({ review: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/camp/:campId', async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const { rows } = await db.query(
      `SELECT r.*, u.full_name AS worker_name, u.avatar_url
       FROM reviews r JOIN users u ON u.id = r.worker_id
       WHERE r.camp_id = $1 ORDER BY r.created_at DESC`,
      [campId]
    );
    // Summary
    const summary = {
      total: rows.length,
      average: rows.length ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10 : 0,
      distribution: [1, 2, 3, 4, 5].map((s) => ({ stars: s, count: rows.filter((r) => r.rating === s).length })),
    };
    res.json({ reviews: rows, summary });
  } catch (e) { next(e); }
});

router.put(
  '/:id/reply',
  authRequired,
  requireRole('owner', 'admin'),
  [body('reply').isString().isLength({ min: 1, max: 2000 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT r.*, c.owner_id FROM reviews r JOIN camps c ON c.id = r.camp_id WHERE r.id = $1`, [id]
      );
      const rv = rows[0];
      if (!rv) return res.status(404).json({ error: 'Review not found' });
      if (req.user.role !== 'admin' && rv.owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your camp' });
      }
      await db.query('UPDATE reviews SET owner_reply = $1 WHERE id = $2', [req.body.reply, id]);
      notify(rv.worker_id, {
        type: 'review_reply',
        title: 'Camp owner replied to your review',
        body: req.body.reply.slice(0, 150),
        link: `/camps/${rv.camp_id}`,
      });
      auditLog(req, 'reply_review', 'review', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.delete('/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT camp_id FROM reviews WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Review not found' });
    await db.query('DELETE FROM reviews WHERE id = $1', [id]);
    await recomputeCampRating(rows[0].camp_id);
    auditLog(req, 'delete_review', 'review', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
