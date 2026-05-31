/**
 * Currency endpoints (E1).
 *
 *   GET /api/currency/rates                — full meta + rates
 *   GET /api/currency/convert?amount=&to=  — convert SAR → target
 *   PUT /api/users/me/currency             — set user's preferred currency
 */
const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../config/database');
const { authRequired } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const currency = require('../utils/currency');

const router = express.Router();

router.get('/currency/rates', async (_req, res, next) => {
  try { res.json(await currency.meta()); }
  catch (e) { next(e); }
});

router.get('/currency/convert', async (req, res, next) => {
  try {
    const amount = parseFloat(req.query.amount);
    const target = String(req.query.to || 'SAR').toUpperCase();
    if (!Number.isFinite(amount)) return res.status(400).json({ error: 'amount required' });
    if (!currency.isSupported(target)) return res.status(400).json({ error: 'unsupported currency' });
    const converted = await currency.convert(amount, target);
    res.json({
      amount_sar: amount, target, converted,
      symbol: currency.SYMBOLS[target],
    });
  } catch (e) { next(e); }
});

router.put('/users/me/currency',
  authRequired,
  [body('currency').isString().notEmpty()],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const ccy = String(req.body.currency).toUpperCase();
      if (!currency.isSupported(ccy)) return res.status(400).json({ error: 'unsupported currency' });
      await db.query('UPDATE users SET preferred_currency=$1 WHERE id=$2', [ccy, req.user.id]);
      auditLog(req, 'set_currency', 'user', req.user.id, { currency: ccy });
      res.json({ ok: true, preferred_currency: ccy });
    } catch (e) { next(e); }
  }
);

module.exports = router;
