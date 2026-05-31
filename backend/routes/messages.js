/**
 * Messages routes — simple internal chat.
 *   POST /api/messages                       — send a message to another user
 *   GET  /api/messages/conversations         — list conversations for current user
 *   GET  /api/messages/:conversationId       — full thread
 *   PUT  /api/messages/:conversationId/read  — mark thread as read
 *
 * conversation_id = `${min(a,b)}-${max(a,b)}` so any two users always share one thread.
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { notify } = require('../utils/emailService');

const router = express.Router();

function convId(a, b) {
  const lo = Math.min(a, b); const hi = Math.max(a, b);
  return `${lo}-${hi}`;
}

router.post(
  '/',
  authRequired,
  [body('receiver_id').isInt({ min: 1 }), body('content').isString().isLength({ min: 1, max: 4000 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const { receiver_id, content } = req.body;
      if (receiver_id === req.user.id) return res.status(400).json({ error: 'Cannot message yourself' });

      const { rows: rcv } = await db.query('SELECT id, full_name FROM users WHERE id = $1', [receiver_id]);
      if (!rcv[0]) return res.status(404).json({ error: 'Receiver not found' });

      const cid = convId(req.user.id, receiver_id);
      const { rows } = await db.query(
        `INSERT INTO messages (conversation_id, sender_id, receiver_id, content, is_read)
         VALUES ($1,$2,$3,$4,0) RETURNING *`,
        [cid, req.user.id, receiver_id, content]
      );
      notify(receiver_id, {
        type: 'message',
        title: `Message from ${req.user.full_name}`,
        body: content.slice(0, 120),
        link: `/messages/${cid}`,
      });
      auditLog(req, 'send_message', 'message', rows[0].id);
      res.status(201).json({ message: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/conversations', authRequired, async (req, res, next) => {
  try {
    // Note: same value passed thrice because our adapter requires one $N per slot.
    const uid = req.user.id;
    const { rows } = await db.query(
      `SELECT m.conversation_id,
              MAX(m.id) AS last_msg_id,
              COUNT(*) AS msg_count,
              SUM(CASE WHEN m.is_read = 0 AND m.receiver_id = $1 THEN 1 ELSE 0 END) AS unread_count
       FROM messages m
       WHERE m.sender_id = $2 OR m.receiver_id = $3
       GROUP BY m.conversation_id
       ORDER BY MAX(m.created_at) DESC`,
      [uid, uid, uid]
    );

    // Hydrate with last message + counterpart
    const conversations = [];
    for (const r of rows) {
      const { rows: lm } = await db.query('SELECT * FROM messages WHERE id = $1', [r.last_msg_id]);
      const last = lm[0];
      const otherId = last.sender_id === req.user.id ? last.receiver_id : last.sender_id;
      const { rows: u } = await db.query(
        'SELECT id, full_name, avatar_url, role FROM users WHERE id = $1', [otherId]
      );
      conversations.push({
        conversation_id: r.conversation_id,
        unread_count: parseInt(r.unread_count || 0, 10),
        msg_count: parseInt(r.msg_count || 0, 10),
        last_message: last,
        counterpart: u[0] || null,
      });
    }
    res.json({ conversations });
  } catch (e) { next(e); }
});

router.get('/:conversationId', authRequired, async (req, res, next) => {
  try {
    const cid = req.params.conversationId;
    // Verify current user is part of this conversation
    const [a, b] = cid.split('-').map((n) => parseInt(n, 10));
    if (req.user.role !== 'admin' && req.user.id !== a && req.user.id !== b) {
      return res.status(403).json({ error: 'Not in this conversation' });
    }
    const { rows } = await db.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [cid]
    );
    res.json({ messages: rows });
  } catch (e) { next(e); }
});

router.put('/:conversationId/read', authRequired, async (req, res, next) => {
  try {
    const cid = req.params.conversationId;
    await db.query(
      `UPDATE messages SET is_read = 1 WHERE conversation_id = $1 AND receiver_id = $2`,
      [cid, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
