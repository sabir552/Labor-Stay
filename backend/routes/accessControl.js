/**
 * Access cards & logs (F5).
 *
 *   POST   /cards                     — issue a card
 *   POST   /cards/bulk-issue          — bulk issue for group booking
 *   GET    /cards/camp/:campId        — list cards for a camp
 *   PUT    /cards/:id                 — activate/deactivate
 *   DELETE /cards/:id                 — revoke
 *
 *   POST   /logs                      — record entry/exit event
 *   GET    /logs/camp/:campId         — log history
 *   GET    /logs/active/:campId       — currently inside (by entry-exit pairs)
 *
 * When ACCESS_API_URL is unset we still record DB-side events; we just don't
 * push to a physical reader.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');

const router = express.Router();
const SYSTEM_CONFIGURED = !!(process.env.ACCESS_API_URL && process.env.ACCESS_API_KEY);

async function assertCampOwner(req, campId) {
  if (req.user.role === 'admin') return { ok: true };
  const { rows } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
  if (!rows[0]) return { error: 404, message: 'Camp not found' };
  if (rows[0].owner_id !== req.user.id) return { error: 403, message: 'Not your camp' };
  return { ok: true };
}

function generateCardUid() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ─── ISSUE CARD ───
router.post('/cards',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('user_id').isInt({ min: 1 }),
    body('booking_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const b = req.body;
      const cardNumber = b.card_number || `LS-${b.user_id}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const cardUid = b.card_uid || generateCardUid();
      const expiresAt = b.expires_at || null;

      const { rows } = await db.query(
        `INSERT INTO access_cards
           (user_id, camp_id, booking_id, card_number, card_uid, status, issued_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,'active',CURRENT_TIMESTAMP,$6) RETURNING *`,
        [b.user_id, b.camp_id, b.booking_id || null, cardNumber, cardUid, expiresAt]
      );
      auditLog(req, 'issue_access_card', 'access_cards', rows[0].id);
      res.status(201).json({
        card: rows[0],
        system_status: SYSTEM_CONFIGURED ? 'configured' : 'access control system not configured (DB-only mode)',
      });
    } catch (e) { next(e); }
  }
);

// ─── BULK ISSUE ───
router.post('/cards/bulk-issue',
  authRequired, requireRole('owner', 'admin'),
  [
    body('camp_id').isInt({ min: 1 }),
    body('user_ids').isArray({ min: 1, max: 500 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const own = await assertCampOwner(req, req.body.camp_id);
      if (!own.ok) return res.status(own.error).json({ error: own.message });

      const issued = [];
      for (const uid of req.body.user_ids) {
        const cardNumber = `LS-${uid}-${Date.now().toString(36).slice(-4).toUpperCase()}-${issued.length}`;
        const cardUid = generateCardUid();
        try {
          const { rows } = await db.query(
            `INSERT INTO access_cards (user_id, camp_id, card_number, card_uid, status, issued_at)
             VALUES ($1,$2,$3,$4,'active',CURRENT_TIMESTAMP) RETURNING *`,
            [uid, req.body.camp_id, cardNumber, cardUid]
          );
          issued.push(rows[0]);
        } catch (e) {}
      }
      auditLog(req, 'bulk_issue_cards', 'access_cards', null, { count: issued.length });
      res.status(201).json({ issued, count: issued.length });
    } catch (e) { next(e); }
  }
);

// ─── LIST ───
router.get('/cards/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const own = await assertCampOwner(req, campId);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    const { rows } = await db.query(
      `SELECT ac.*, u.full_name AS user_name, u.email AS user_email
       FROM access_cards ac LEFT JOIN users u ON u.id = ac.user_id
       WHERE ac.camp_id=$1 ORDER BY ac.issued_at DESC LIMIT 500`, [campId]
    );
    res.json({ cards: rows });
  } catch (e) { next(e); }
});

// ─── UPDATE STATUS ───
router.put('/cards/:id', authRequired, requireRole('owner', 'admin'),
  [body('status').optional().isIn(['active', 'inactive', 'lost', 'expired'])],
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { rows } = await db.query(
        `SELECT ac.*, c.owner_id FROM access_cards ac
         JOIN camps c ON c.id=ac.camp_id WHERE ac.id=$1`, [id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Card not found' });
      if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
        return res.status(403).json({ error: 'Not your card' });
      }
      const sets = []; const vals = [];
      if (req.body.status !== undefined) {
        vals.push(req.body.status); sets.push(`status=$${vals.length}`);
        if (req.body.status !== 'active') {
          vals.push(new Date().toISOString()); sets.push(`deactivated_at=$${vals.length}`);
        }
      }
      if (!sets.length) return res.json({ ok: true });
      vals.push(id);
      await db.query(`UPDATE access_cards SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
      auditLog(req, `card_${req.body.status || 'updated'}`, 'access_cards', id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
);

router.delete('/cards/:id', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT ac.*, c.owner_id FROM access_cards ac
       JOIN camps c ON c.id=ac.camp_id WHERE ac.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Card not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not your card' });
    }
    await db.query('DELETE FROM access_cards WHERE id=$1', [id]);
    auditLog(req, 'delete_card', 'access_cards', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── ACCESS EVENT ───
router.post('/logs',
  authRequired,
  [
    body('action').isIn(['entry', 'exit', 'denied']),
    body('card_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('camp_id').optional({ nullable: true }).isInt({ min: 1 }),
    body('user_id').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      let userId = b.user_id, campId = b.camp_id;
      if (b.card_id) {
        const { rows } = await db.query('SELECT user_id, camp_id, status FROM access_cards WHERE id=$1', [b.card_id]);
        if (!rows[0]) return res.status(404).json({ error: 'Card not found' });
        userId = userId || rows[0].user_id;
        campId = campId || rows[0].camp_id;
        if (rows[0].status !== 'active' && b.action === 'entry') {
          await db.query(
            `INSERT INTO access_logs (card_id, user_id, camp_id, action, gate_name, timestamp)
             VALUES ($1,$2,$3,'denied',$4,CURRENT_TIMESTAMP)`,
            [b.card_id, userId, campId, b.gate_name || 'main']
          );
          return res.status(403).json({ error: 'Card inactive', logged: 'denied' });
        }
      }

      const { rows } = await db.query(
        `INSERT INTO access_logs (card_id, user_id, camp_id, room_id, action, gate_name, timestamp)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) RETURNING *`,
        [b.card_id || null, userId || null, campId || null, b.room_id || null,
         b.action, b.gate_name || 'main']
      );
      res.status(201).json({ log: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/logs/camp/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const own = await assertCampOwner(req, campId);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    const { rows } = await db.query(
      `SELECT al.*, u.full_name AS user_name FROM access_logs al
       LEFT JOIN users u ON u.id=al.user_id
       WHERE al.camp_id=$1 ORDER BY al.timestamp DESC LIMIT 500`, [campId]
    );
    res.json({ logs: rows });
  } catch (e) { next(e); }
});

router.get('/logs/active/:campId', authRequired, requireRole('owner', 'admin'), async (req, res, next) => {
  try {
    const campId = parseInt(req.params.campId, 10);
    const own = await assertCampOwner(req, campId);
    if (!own.ok) return res.status(own.error).json({ error: own.message });
    // Last action per user — if 'entry' then they're inside
    const { rows } = await db.query(
      `SELECT al.user_id, u.full_name AS user_name, MAX(al.timestamp) AS last_time,
              (SELECT action FROM access_logs WHERE camp_id=$1 AND user_id=al.user_id
                 ORDER BY timestamp DESC LIMIT 1) AS last_action
       FROM access_logs al LEFT JOIN users u ON u.id=al.user_id
       WHERE al.camp_id=$2 AND al.user_id IS NOT NULL
       GROUP BY al.user_id, u.full_name`, [campId, campId]
    );
    const inside = rows.filter((r) => r.last_action === 'entry');
    res.json({ inside, count: inside.length });
  } catch (e) { next(e); }
});

module.exports = router;
