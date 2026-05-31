/**
 * Chatbot routes (D5).
 *
 *   POST /api/chatbot/whatsapp/webhook    — Twilio webhook
 *   POST /api/chatbot/message             — in-app AI chat
 *   GET  /api/chatbot/status              — service availability
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { authRequired } = require('../middleware/auth');
const { parseIntent, handleIntent, aiChat, sendWhatsApp,
        twilioReady, openaiReady } = require('../utils/chatbot');

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json({
    whatsapp_enabled: twilioReady,
    ai_enabled: openaiReady,
    fallback_active: !twilioReady || !openaiReady,
  });
});

// ─── Twilio WhatsApp webhook ───
router.post('/whatsapp/webhook',
  express.urlencoded({ extended: true }),
  async (req, res) => {
    try {
      const from = req.body.From || req.body.from || 'unknown';
      const text = req.body.Body || req.body.body || '';
      const intent = parseIntent(text);
      const reply = await handleIntent(intent, from);

      // Reply via Twilio (or no-op in dev)
      await sendWhatsApp(from, reply);

      // Respond with empty TwiML — Twilio expects 200 OK
      res.set('Content-Type', 'text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (e) {
      res.status(200).set('Content-Type', 'text/xml')
        .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }
);

// ─── In-app AI chat ───
router.post('/message',
  authRequired,
  [body('message').isString().isLength({ min: 1, max: 2000 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const lang = req.user.preferred_language || 'en';
      const out = await aiChat(req.body.message, lang);
      res.json(out);
    } catch (e) { next(e); }
  }
);

module.exports = router;
