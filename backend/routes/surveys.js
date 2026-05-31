/**
 * Surveys (C2).
 *
 * Admin-defined surveys with arbitrary questions (JSON schema), per-user
 * responses with optional NPS score (0-10).
 *
 * Tables (Piece 13 v2): surveys, survey_responses
 *
 * Endpoints
 *   POST   /api/surveys                  — create (admin)
 *   GET    /api/surveys/active           — active surveys for current user
 *   GET    /api/surveys/:id              — survey detail
 *   POST   /api/surveys/:id/respond      — submit response
 *   GET    /api/surveys/:id/results      — aggregate results (admin/owner of camp)
 *   GET    /api/surveys/my-responses     — current user's responses
 *   GET    /api/surveys/nps/camp/:campId — NPS score for a camp (owner/admin)
 *   GET    /api/surveys                  — list all (admin)
 *   PUT    /api/surveys/:id/deactivate   — admin deactivates
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();

function parseJSON(v, fb = null) {
  if (v == null) return fb;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fb; }
}
function decorate(s) {
  if (!s) return s;
  return { ...s, questions: parseJSON(s.questions, []), is_active: !!s.is_active };
}

// ─── CREATE survey (admin) ───
router.post(
  '/',
  authRequired,
  requireRole('admin'),
  [
    body('title').isString().isLength({ min: 3, max: 200 }),
    body('questions').isArray({ min: 1 }).withMessage('At least one question required'),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('start_date').optional().isString(),
    body('end_date').optional().isString(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      // Normalize questions: each must have { id, type, label, options? }
      const VALID_TYPES = new Set(['text', 'rating', 'nps', 'choice', 'multi_choice', 'boolean']);
      const questions = (req.body.questions || []).map((q, i) => ({
        id: q.id || `q${i + 1}`,
        type: VALID_TYPES.has(q.type) ? q.type : 'text',
        label: String(q.label || '').slice(0, 500),
        required: !!q.required,
        options: Array.isArray(q.options) ? q.options.map(String) : [],
      })).filter((q) => q.label);

      if (!questions.length) {
        return res.status(400).json({ error: 'At least one valid question required' });
      }

      const { rows } = await db.query(
        `INSERT INTO surveys (title, description, questions, camp_id, is_active, start_date, end_date)
         VALUES ($1,$2,$3,$4,1,$5,$6) RETURNING *`,
        [
          req.body.title, req.body.description || null,
          JSON.stringify(questions),
          req.body.camp_id || null,
          req.body.start_date || null, req.body.end_date || null,
        ]
      );
      auditLog(req, 'create_survey', 'surveys', rows[0].id);
      res.status(201).json({ survey: decorate(rows[0]) });
    } catch (e) { next(e); }
  }
);

// ─── ALL (admin) ───
router.get('/', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, c.name AS camp_name,
              (SELECT COUNT(*) FROM survey_responses WHERE survey_id=s.id) AS response_count
       FROM surveys s LEFT JOIN camps c ON c.id=s.camp_id
       ORDER BY s.created_at DESC LIMIT 200`
    );
    res.json({ surveys: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── ACTIVE (for current user) ───
router.get('/active', authRequired, async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Show surveys that are active AND (no date range OR within range)
    // AND that this worker hasn't responded to yet
    const { rows } = await db.query(
      `SELECT s.*, c.name AS camp_name FROM surveys s
       LEFT JOIN camps c ON c.id = s.camp_id
       WHERE s.is_active = 1
         AND (s.start_date IS NULL OR s.start_date <= $1)
         AND (s.end_date IS NULL OR s.end_date >= $2)
         AND NOT EXISTS (
           SELECT 1 FROM survey_responses sr
           WHERE sr.survey_id = s.id AND sr.user_id = $3
         )
       ORDER BY s.created_at DESC LIMIT 50`,
      [today, today, req.user.id]
    );
    res.json({ surveys: rows.map(decorate) });
  } catch (e) { next(e); }
});

// ─── MY RESPONSES (must come before /:id) ───
router.get('/my-responses', authRequired, async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT sr.*, s.title AS survey_title, s.camp_id, c.name AS camp_name
       FROM survey_responses sr
       JOIN surveys s ON s.id = sr.survey_id
       LEFT JOIN camps c ON c.id = s.camp_id
       WHERE sr.user_id = $1 ORDER BY sr.created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const out = rows.map((r) => ({ ...r, answers: parseJSON(r.answers, {}) }));
    res.json({ responses: out });
  } catch (e) { next(e); }
});

// ─── NPS per camp (must come before /:id) ───
router.get('/nps/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    if (req.user.role !== 'admin') {
      const { rows: c } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
      if (!c[0]) return res.status(404).json({ error: 'Camp not found' });
      if (c[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
    }
    const { rows } = await db.query(
      `SELECT sr.nps_score FROM survey_responses sr
       JOIN surveys s ON s.id = sr.survey_id
       WHERE (s.camp_id = $1 OR s.camp_id IS NULL) AND sr.nps_score IS NOT NULL`,
      [campId]
    );
    const scores = rows.map((r) => parseInt(r.nps_score, 10)).filter((n) => Number.isFinite(n));
    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const passives = scores.filter((s) => s === 7 || s === 8).length;
    const nps = scores.length
      ? Math.round((((promoters - detractors) / scores.length) * 100))
      : null;
    res.json({
      camp_id: campId,
      total_responses: scores.length,
      promoters, passives, detractors,
      nps_score: nps,                            // -100 .. +100, null if no data
      category: nps == null ? 'no_data' :
        nps >= 50 ? 'excellent' : nps >= 30 ? 'great' : nps >= 0 ? 'good' : 'needs_work',
    });
  } catch (e) { next(e); }
});

// ─── SURVEY detail ───
router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await db.query('SELECT * FROM surveys WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Survey not found' });
    res.json({ survey: decorate(rows[0]) });
  } catch (e) { next(e); }
});

// ─── RESPOND ───
router.post(
  '/:id/respond',
  authRequired,
  [
    body('answers').isObject().withMessage('answers must be an object keyed by question id'),
    body('nps_score').optional({ nullable: true }).isInt({ min: 0, max: 10 }),
    body('booking_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.params.id, 10);
      const { rows: s } = await db.query('SELECT * FROM surveys WHERE id=$1', [id]);
      if (!s[0]) return res.status(404).json({ error: 'Survey not found' });
      if (!s[0].is_active) return res.status(400).json({ error: 'Survey is inactive' });

      // One response per user per survey
      const { rows: ex } = await db.query(
        'SELECT id FROM survey_responses WHERE survey_id=$1 AND user_id=$2 LIMIT 1',
        [id, req.user.id]
      );
      if (ex[0]) return res.status(409).json({ error: 'You have already responded to this survey' });

      // Pull NPS from answers if a `nps` question exists and nps_score not provided
      let nps = req.body.nps_score;
      const questions = parseJSON(s[0].questions, []);
      if (nps == null) {
        const npsQ = questions.find((q) => q.type === 'nps');
        if (npsQ && req.body.answers[npsQ.id] != null) {
          const v = parseInt(req.body.answers[npsQ.id], 10);
          if (Number.isFinite(v) && v >= 0 && v <= 10) nps = v;
        }
      }

      const { rows } = await db.query(
        `INSERT INTO survey_responses (survey_id, user_id, booking_id, answers, nps_score)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [id, req.user.id, req.body.booking_id || null,
         JSON.stringify(req.body.answers || {}),
         nps != null ? parseInt(nps, 10) : null]
      );
      auditLog(req, 'survey_response', 'survey_responses', rows[0].id);
      res.status(201).json({ response: { ...rows[0], answers: parseJSON(rows[0].answers, {}) } });
    } catch (e) { next(e); }
  }
);

// ─── RESULTS (admin / camp owner) ───
router.get('/:id/results', authRequired, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: s } = await db.query(
      `SELECT s.*, c.owner_id FROM surveys s LEFT JOIN camps c ON c.id=s.camp_id WHERE s.id=$1`,
      [id]
    );
    if (!s[0]) return res.status(404).json({ error: 'Survey not found' });
    const canSee = req.user.role === 'admin' || s[0].owner_id === req.user.id;
    if (!canSee) return res.status(403).json({ error: 'Not authorized' });

    const { rows: responses } = await db.query(
      `SELECT sr.id, sr.user_id, sr.booking_id, sr.answers, sr.nps_score, sr.created_at,
              u.full_name AS user_name
       FROM survey_responses sr LEFT JOIN users u ON u.id=sr.user_id
       WHERE sr.survey_id=$1 ORDER BY sr.created_at DESC`,
      [id]
    );

    // Aggregate
    const questions = parseJSON(s[0].questions, []);
    const aggregates = {};
    const npsScores = [];
    for (const q of questions) aggregates[q.id] = { type: q.type, label: q.label, counts: {}, totals: { sum: 0, n: 0 } };
    for (const r of responses) {
      const ans = parseJSON(r.answers, {});
      for (const q of questions) {
        const v = ans[q.id];
        if (v == null || v === '') continue;
        const a = aggregates[q.id];
        if (q.type === 'rating' || q.type === 'nps') {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) { a.totals.sum += n; a.totals.n++; }
        } else if (q.type === 'choice' || q.type === 'multi_choice' || q.type === 'boolean') {
          const arr = Array.isArray(v) ? v : [v];
          for (const opt of arr) a.counts[String(opt)] = (a.counts[String(opt)] || 0) + 1;
        }
      }
      if (r.nps_score != null) npsScores.push(parseInt(r.nps_score, 10));
    }
    for (const q of questions) {
      const a = aggregates[q.id];
      if (a.totals.n > 0) a.average = Math.round((a.totals.sum / a.totals.n) * 100) / 100;
    }

    let nps = null;
    if (npsScores.length) {
      const p = npsScores.filter((s) => s >= 9).length;
      const d = npsScores.filter((s) => s <= 6).length;
      nps = Math.round(((p - d) / npsScores.length) * 100);
    }

    res.json({
      survey: decorate(s[0]),
      total_responses: responses.length,
      aggregates,
      nps_score: nps,
      responses: responses.map((r) => ({ ...r, answers: parseJSON(r.answers, {}) })),
    });
  } catch (e) { next(e); }
});

// ─── DEACTIVATE ───
router.put('/:id/deactivate', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.query('UPDATE surveys SET is_active=0 WHERE id=$1', [id]);
    auditLog(req, 'deactivate_survey', 'surveys', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
