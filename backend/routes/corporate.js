/**
 * Corporate accounts & billing (E2 + E3).
 *
 * Tables (Piece 13 v2): corporate_accounts, corporate_bookings, corporate_invoices
 *
 *   ─── Accounts (admin) ─────────────────────────────────────
 *   POST   /accounts                — create
 *   GET    /accounts                — list
 *   GET    /accounts/:id            — detail
 *   PUT    /accounts/:id            — update (credit limit, terms)
 *   POST   /credit                  — alias: set credit limit
 *   GET    /credit/balance/:id      — check remaining balance
 *
 *   ─── Bulk booking ─────────────────────────────────────────
 *   POST   /bulk-booking            — book 10-500 beds at a camp
 *   GET    /bookings                — list (admin / own corporate)
 *
 *   ─── Invoices ─────────────────────────────────────────────
 *   POST   /invoice/generate        — generate monthly invoice for a corp
 *   POST   /invoice                 — generic alias for /invoice/generate
 *   GET    /invoices                — list invoices
 *   GET    /invoices/:id            — detail
 *   PUT    /invoices/:id/pay        — mark paid
 *
 *   ─── Reports ──────────────────────────────────────────────
 *   GET    /spend-report/:id        — corp spending analytics
 */
const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { sendEmail, notify } = require('../utils/emailService');
const { computeBooking } = require('../utils/vatCalculator');

const router = express.Router();

// All corporate routes are admin-only by default (we surface a balance
// check for a logged-in worker linked to a corporate account separately).
const PAYMENT_TERMS = ['net15', 'net30', 'net60'];

function invoiceNumber() {
  const y = new Date().getFullYear();
  return `CINV-${y}-${uuidv4().replace(/-/g, '').slice(0, 9).toUpperCase()}`;
}

// ─── ACCOUNTS ───
router.post('/accounts',
  authRequired, requireRole('admin'),
  [
    body('company_name').isString().isLength({ min: 2 }),
    body('cr_number').optional().isString(),
    body('contact_email').optional().isEmail(),
    body('credit_limit').optional().isFloat({ min: 0 }),
    body('payment_terms').optional().isIn(PAYMENT_TERMS),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      const { rows } = await db.query(
        `INSERT INTO corporate_accounts
           (company_name, cr_number, vat_number, contact_name, contact_email, contact_phone,
            credit_limit, current_balance, payment_terms, finance_email, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) RETURNING *`,
        [
          b.company_name, b.cr_number || null, b.vat_number || null,
          b.contact_name || null, b.contact_email || null, b.contact_phone || null,
          parseFloat(b.credit_limit || 0), parseFloat(b.credit_limit || 0),
          b.payment_terms || 'net30', b.finance_email || b.contact_email || null,
        ]
      );
      auditLog(req, 'create_corporate', 'corporate_accounts', rows[0].id);
      res.status(201).json({ account: rows[0] });
    } catch (e) { next(e); }
  }
);

router.get('/accounts', authRequired, requireRole('admin'), async (_req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM corporate_accounts ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ accounts: rows });
  } catch (e) { next(e); }
});

router.get('/accounts/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    // Add spending stats
    const { rows: stats } = await db.query(
      `SELECT COUNT(*) AS bookings,
              COALESCE(SUM(total_amount),0) AS total_spent
       FROM corporate_bookings WHERE corporate_id=$1`, [id]
    );
    res.json({
      account: rows[0],
      stats: {
        bookings: parseInt(stats[0].bookings, 10),
        total_spent: parseFloat(stats[0].total_spent || 0),
      },
    });
  } catch (e) { next(e); }
});

router.put('/accounts/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: cur } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1', [id]);
    if (!cur[0]) return res.status(404).json({ error: 'Account not found' });

    const b = req.body;
    const fields = {
      company_name: b.company_name, cr_number: b.cr_number, vat_number: b.vat_number,
      contact_name: b.contact_name, contact_email: b.contact_email, contact_phone: b.contact_phone,
      finance_email: b.finance_email,
      credit_limit: b.credit_limit != null ? parseFloat(b.credit_limit) : undefined,
      payment_terms: b.payment_terms && PAYMENT_TERMS.includes(b.payment_terms) ? b.payment_terms : undefined,
      is_active: b.is_active != null ? (b.is_active ? 1 : 0) : undefined,
    };
    const sets = []; const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { vals.push(v); sets.push(`${k}=$${vals.length}`); }
    }
    // If credit_limit changed: top-up balance by the delta (don't reset, preserve usage)
    if (b.credit_limit != null) {
      const delta = parseFloat(b.credit_limit) - parseFloat(cur[0].credit_limit || 0);
      const newBalance = Math.max(0, parseFloat(cur[0].current_balance || 0) + delta);
      vals.push(newBalance); sets.push(`current_balance=$${vals.length}`);
    }
    if (!sets.length) return res.json({ account: cur[0] });
    vals.push(id);
    await db.query(`UPDATE corporate_accounts SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals);
    const { rows: after } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1', [id]);
    auditLog(req, 'update_corporate', 'corporate_accounts', id);
    res.json({ account: after[0] });
  } catch (e) { next(e); }
});

// Alias: POST /credit  → set/update credit limit for an account
router.post('/credit',
  authRequired, requireRole('admin'),
  [body('corporate_id').isInt({ min: 1 }), body('credit_limit').isFloat({ min: 0 })],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const id = parseInt(req.body.corporate_id, 10);
      const { rows: cur } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1', [id]);
      if (!cur[0]) return res.status(404).json({ error: 'Account not found' });

      const newLimit = parseFloat(req.body.credit_limit);
      const delta = newLimit - parseFloat(cur[0].credit_limit || 0);
      const newBalance = Math.max(0, parseFloat(cur[0].current_balance || 0) + delta);
      await db.query(
        `UPDATE corporate_accounts SET credit_limit=$1, current_balance=$2 WHERE id=$3`,
        [newLimit, newBalance, id]
      );
      auditLog(req, 'set_credit', 'corporate_accounts', id, { credit_limit: newLimit });
      res.json({ ok: true, credit_limit: newLimit, current_balance: newBalance });
    } catch (e) { next(e); }
  }
);

router.get('/credit/balance/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, company_name, credit_limit, current_balance FROM corporate_accounts WHERE id=$1`,
      [parseInt(req.params.id, 10)]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json({
      ...rows[0],
      used: Math.max(0, parseFloat(rows[0].credit_limit || 0) - parseFloat(rows[0].current_balance || 0)),
      utilization_pct: rows[0].credit_limit > 0
        ? Math.round(((rows[0].credit_limit - rows[0].current_balance) / rows[0].credit_limit) * 100)
        : 0,
    });
  } catch (e) { next(e); }
});

// ─── BULK BOOKING ───
router.post('/bulk-booking',
  authRequired, requireRole('admin'),
  [
    body('corporate_id').isInt({ min: 1 }),
    body('camp_id').isInt({ min: 1 }),
    body('num_beds').isInt({ min: 1, max: 500 }),
    body('start_date').isString().notEmpty(),
    body('end_date').isString().notEmpty(),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });

      const b = req.body;
      const { rows: corp } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1 AND is_active=1', [b.corporate_id]);
      if (!corp[0]) return res.status(404).json({ error: 'Corporate account not found or inactive' });

      // Pull average bed-night price from this camp's cheapest active room
      const { rows: rRow } = await db.query(
        `SELECT MIN(price_per_day) AS price FROM rooms WHERE camp_id=$1 AND is_active=1`,
        [b.camp_id]
      );
      const pricePerBedNight = parseFloat(rRow[0].price) || 0;
      if (pricePerBedNight <= 0) {
        return res.status(400).json({ error: 'No bookable rooms in this camp' });
      }

      const nights = Math.max(1, Math.ceil(
        (new Date(b.end_date) - new Date(b.start_date)) / 86400000
      ));
      const base = pricePerBedNight * b.num_beds * nights;
      const calc = computeBooking(base);

      // Credit check
      if (parseFloat(corp[0].current_balance || 0) < calc.total) {
        return res.status(402).json({
          error: 'Insufficient corporate credit balance',
          required: calc.total,
          available: parseFloat(corp[0].current_balance || 0),
        });
      }

      const { rows } = await db.query(
        `INSERT INTO corporate_bookings
           (corporate_id, camp_id, num_beds, start_date, end_date, total_amount, status)
         VALUES ($1,$2,$3,$4,$5,$6,'confirmed') RETURNING *`,
        [b.corporate_id, b.camp_id, b.num_beds, b.start_date, b.end_date, calc.total]
      );

      // Decrement balance
      await db.query(
        `UPDATE corporate_accounts SET current_balance = current_balance - $1 WHERE id=$2`,
        [calc.total, b.corporate_id]
      );

      // Notify owner of the camp
      const { rows: c } = await db.query('SELECT owner_id, name FROM camps WHERE id=$1', [b.camp_id]);
      if (c[0]) {
        notify(c[0].owner_id, {
          type: 'bulk_booking',
          title: `Bulk booking — ${b.num_beds} beds`,
          body: `${corp[0].company_name} booked ${b.num_beds} beds at ${c[0].name} (${b.start_date} → ${b.end_date}) — ${calc.total} SAR`,
          link: '/owner/bookings',
        });
      }
      auditLog(req, 'bulk_booking', 'corporate_bookings', rows[0].id, {
        corporate_id: b.corporate_id, beds: b.num_beds, total: calc.total,
      });
      res.status(201).json({
        booking: rows[0],
        breakdown: { ...calc, nights, price_per_bed_night: pricePerBedNight },
      });
    } catch (e) { next(e); }
  }
);

router.get('/bookings', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.corporate_id) { params.push(parseInt(req.query.corporate_id, 10)); where.push(`cb.corporate_id=$${params.length}`); }
    if (req.query.status)       { params.push(req.query.status);                     where.push(`cb.status=$${params.length}`); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT cb.*, ca.company_name, c.name AS camp_name, c.city
       FROM corporate_bookings cb
       JOIN corporate_accounts ca ON ca.id = cb.corporate_id
       LEFT JOIN camps c ON c.id = cb.camp_id
       ${whereSql}
       ORDER BY cb.created_at DESC LIMIT 200`,
      params
    );
    res.json({ bookings: rows });
  } catch (e) { next(e); }
});

// ─── INVOICES ───
async function generateInvoiceInternal(corpId, month, year) {
  const dateStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { rows: bk } = await db.query(
    `SELECT COALESCE(SUM(total_amount),0) AS total
     FROM corporate_bookings
     WHERE corporate_id=$1 AND invoice_id IS NULL
       AND start_date >= $2 AND start_date <= $3`,
    [corpId, dateStart, dateEnd]
  );
  const total = parseFloat(bk[0].total || 0);
  if (total <= 0) return { error: 'No unbilled bookings in that period' };

  // total already includes VAT (it was set from computeBooking().total).
  // For ZATCA: surface VAT separately.
  const vatAmount = Math.round((total * (0.15 / 1.15)) * 100) / 100;
  const invNo = invoiceNumber();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30); // default net30; reconcile with account.payment_terms below

  const { rows: corp } = await db.query('SELECT payment_terms, finance_email, company_name FROM corporate_accounts WHERE id=$1', [corpId]);
  if (corp[0]) {
    const days = corp[0].payment_terms === 'net15' ? 15 : corp[0].payment_terms === 'net60' ? 60 : 30;
    dueDate.setTime(Date.now() + days * 86400000);
  }

  const { rows: invIns } = await db.query(
    `INSERT INTO corporate_invoices
       (corporate_id, invoice_number, month, year, total_amount, vat_amount,
        status, due_date)
     VALUES ($1,$2,$3,$4,$5,$6,'sent',$7) RETURNING *`,
    [corpId, invNo, month, year, total, vatAmount, dueDate.toISOString().slice(0, 10)]
  );

  // Link the bookings to the invoice
  await db.query(
    `UPDATE corporate_bookings SET invoice_id=$1
     WHERE corporate_id=$2 AND invoice_id IS NULL
       AND start_date >= $3 AND start_date <= $4`,
    [invIns[0].id, corpId, dateStart, dateEnd]
  );

  // Email to finance contact
  if (corp[0]?.finance_email) {
    sendEmail({
      to: corp[0].finance_email,
      subject: `Invoice ${invNo} — ${corp[0].company_name}`,
      html: `<p>Hello,</p><p>Please find attached your invoice <b>${invNo}</b> for ${month}/${year}.</p>
             <p>Total: SAR ${total} (VAT incl: SAR ${vatAmount})</p>
             <p>Due: ${invIns[0].due_date}</p>`,
    }).catch(() => {});
  }
  return { invoice: invIns[0] };
}

router.post('/invoice/generate',
  authRequired, requireRole('admin'),
  [
    body('corporate_id').isInt({ min: 1 }),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2020, max: 2100 }),
  ],
  async (req, res, next) => {
    try {
      const errs = validationResult(req);
      if (!errs.isEmpty()) return res.status(400).json({ error: 'Validation failed', details: errs.array() });
      const out = await generateInvoiceInternal(parseInt(req.body.corporate_id, 10), parseInt(req.body.month, 10), parseInt(req.body.year, 10));
      if (out.error) return res.status(400).json(out);
      auditLog(req, 'generate_invoice', 'corporate_invoices', out.invoice.id);
      res.status(201).json(out);
    } catch (e) { next(e); }
  }
);
// alias
router.post('/invoice', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const out = await generateInvoiceInternal(
      parseInt(req.body.corporate_id, 10),
      parseInt(req.body.month, 10),
      parseInt(req.body.year, 10)
    );
    if (out.error) return res.status(400).json(out);
    res.status(201).json(out);
  } catch (e) { next(e); }
});

router.get('/invoices', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const where = []; const params = [];
    if (req.query.corporate_id) { params.push(parseInt(req.query.corporate_id, 10)); where.push(`ci.corporate_id=$${params.length}`); }
    if (req.query.status)       { params.push(req.query.status);                     where.push(`ci.status=$${params.length}`); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await db.query(
      `SELECT ci.*, ca.company_name FROM corporate_invoices ci
       JOIN corporate_accounts ca ON ca.id = ci.corporate_id
       ${whereSql} ORDER BY ci.created_at DESC LIMIT 200`, params
    );
    // Mark overdue
    const today = new Date().toISOString().slice(0, 10);
    const out = rows.map((r) => ({
      ...r,
      is_overdue: r.status !== 'paid' && r.due_date && r.due_date < today,
    }));
    res.json({ invoices: out });
  } catch (e) { next(e); }
});

router.get('/invoices/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await db.query(
      `SELECT ci.*, ca.company_name, ca.vat_number, ca.contact_email
       FROM corporate_invoices ci JOIN corporate_accounts ca ON ca.id=ci.corporate_id
       WHERE ci.id=$1`, [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
    const { rows: bks } = await db.query(
      `SELECT cb.*, c.name AS camp_name FROM corporate_bookings cb
       LEFT JOIN camps c ON c.id=cb.camp_id WHERE cb.invoice_id=$1`, [id]
    );
    res.json({ invoice: rows[0], bookings: bks });
  } catch (e) { next(e); }
});

router.put('/invoices/:id/pay', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.query(
      `UPDATE corporate_invoices SET status='paid', paid_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id]
    );
    auditLog(req, 'invoice_paid', 'corporate_invoices', id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ─── SPEND REPORT ───
router.get('/spend-report/:id', authRequired, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: acc } = await db.query('SELECT * FROM corporate_accounts WHERE id=$1', [id]);
    if (!acc[0]) return res.status(404).json({ error: 'Account not found' });

    // By month
    const monthExpr = db.driver === 'postgres'
      ? "TO_CHAR(cb.created_at::date, 'YYYY-MM')"
      : "strftime('%Y-%m', cb.created_at)";

    const { rows: byMonth } = await db.query(
      `SELECT ${monthExpr} AS month,
              COUNT(*) AS bookings,
              COALESCE(SUM(num_beds),0) AS beds,
              COALESCE(SUM(total_amount),0) AS total
       FROM corporate_bookings cb WHERE corporate_id=$1
       GROUP BY ${monthExpr} ORDER BY month DESC LIMIT 12`,
      [id]
    );
    const { rows: byCamp } = await db.query(
      `SELECT c.name AS camp_name, c.city,
              COUNT(cb.id) AS bookings,
              COALESCE(SUM(cb.total_amount),0) AS total
       FROM corporate_bookings cb LEFT JOIN camps c ON c.id=cb.camp_id
       WHERE cb.corporate_id=$1
       GROUP BY c.id, c.name, c.city ORDER BY total DESC LIMIT 20`,
      [id]
    );
    const { rows: invoices } = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid,
              COALESCE(SUM(CASE WHEN status!='paid' THEN total_amount ELSE 0 END),0) AS outstanding
       FROM corporate_invoices WHERE corporate_id=$1`, [id]
    );
    res.json({
      account: acc[0], by_month: byMonth, by_camp: byCamp,
      invoices: {
        total: parseInt(invoices[0].total, 10),
        paid:  parseInt(invoices[0].paid, 10),
        outstanding: parseFloat(invoices[0].outstanding || 0),
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
