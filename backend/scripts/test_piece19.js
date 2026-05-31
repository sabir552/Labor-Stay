#!/usr/bin/env node
/**
 * Piece 19 tests: E1 multi-currency, E2 credit, E3 corporate billing,
 * E4 financial reports, E5 payouts.
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:5000/api';
let FAIL = 0;
const pass = (n) => console.log(`  ✅ ${n}`);
const fail = (n, why) => { console.log(`  ❌ ${n}: ${why}`); FAIL++; };

function req(method, p, body, token) {
  return new Promise((resolve) => {
    const url = new URL(BASE + p);
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => {
        let parsed; try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data); r.end();
  });
}

async function waitForServer(maxMs = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await req('GET', '/health');
    if (r.status === 200) return true;
    await new Promise((res) => setTimeout(res, 200));
  }
  return false;
}

(async () => {
  const db = require('../config/database');
  await db.query('DELETE FROM ip_blocks', []);
  await db.query('DELETE FROM user_2fa', []);
  await db.query('DELETE FROM sessions', []);
  for (const t of ['corporate_invoices', 'corporate_bookings', 'corporate_accounts',
                   'payout_requests']) {
    await db.query(`DELETE FROM ${t}`, []).catch(() => {});
  }

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  if (!(await waitForServer())) { srv.kill(); process.exit(1); }

  try {
    // Find owner of camp 1 dynamically
    const { rows: ownerOf1 } = await db.query(
      `SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=1`, []
    );
    const ownerEmail = ownerOf1[0]?.email || 'owner@riyadhcamps.sa';

    const oLog = await req('POST', '/auth/login', { email: ownerEmail,           password: 'Owner@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com',   password: 'Worker@123' });
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const oTok = oLog.body.token, wTok = wLog.body.token, aTok = aLog.body.token;
    if (!oTok || !wTok || !aTok) throw new Error('login failed');
    pass(`logins ok (owner=${ownerEmail})`);

    // ═══════════════════════════════════════════════════
    // E1: MULTI-CURRENCY
    // ═══════════════════════════════════════════════════
    console.log('\n== E1 MULTI-CURRENCY ==');
    const rates = await req('GET', '/currency/rates');
    if (rates.body.supported?.length === 9 && rates.body.rates?.SAR === 1) {
      pass(`9 currencies supported, base SAR=1`);
    } else fail('rates', JSON.stringify(rates.body));

    // Convert 1000 SAR → USD
    const conv = await req('GET', '/currency/convert?amount=1000&to=USD');
    if (typeof conv.body.converted === 'number' && conv.body.converted > 0) {
      pass(`1000 SAR → ${conv.body.converted} USD`);
    } else fail('convert', JSON.stringify(conv.body));

    // Unsupported currency rejected
    const convBad = await req('GET', '/currency/convert?amount=100&to=DOGE');
    convBad.status === 400 ? pass('unsupported currency rejected')
                            : fail('unsupported', JSON.stringify(convBad.body));

    // Set user preference
    const setPref = await req('PUT', '/users/me/currency', { currency: 'usd' }, wTok);
    setPref.body.preferred_currency === 'USD'
      ? pass(`set preferred currency to ${setPref.body.preferred_currency}`)
      : fail('set currency', JSON.stringify(setPref.body));

    // ═══════════════════════════════════════════════════
    // E2 + E3: CORPORATE
    // ═══════════════════════════════════════════════════
    console.log('\n== E2/E3 CORPORATE ==');
    // Create corporate account
    const corp = await req('POST', '/corporate/accounts', {
      company_name: 'Saudi Aramco Contractors',
      cr_number: '1010012345', vat_number: '300012345600003',
      contact_name: 'Ahmad Manager', contact_email: 'finance@aramco-contractors.com',
      contact_phone: '+966500000001', credit_limit: 100000, payment_terms: 'net30',
    }, aTok);
    corp.body.account?.id && corp.body.account.current_balance === 100000
      ? pass(`POST corporate (id=${corp.body.account.id}, balance ${corp.body.account.current_balance})`)
      : fail('create corp', JSON.stringify(corp.body));

    // Worker / owner blocked from creating corp accounts
    const corpHack = await req('POST', '/corporate/accounts', { company_name: 'x' }, oTok);
    corpHack.status === 403 ? pass('owner blocked from creating corp')
                            : fail('corp auth', `status ${corpHack.status}`);

    // Bulk booking
    const bulk = await req('POST', '/corporate/bulk-booking', {
      corporate_id: corp.body.account.id,
      camp_id: 1, num_beds: 20,
      start_date: '2026-09-01', end_date: '2026-09-15',  // 14 nights
    }, aTok);
    if (bulk.body.booking?.id && bulk.body.breakdown?.nights === 14) {
      pass(`bulk booking: 20 beds × 14 nights = ${bulk.body.booking.total_amount} SAR`);
    } else fail('bulk booking', JSON.stringify(bulk.body));

    // Credit balance decremented
    const bal = await req('GET', `/corporate/credit/balance/${corp.body.account.id}`, null, aTok);
    bal.body.used > 0 && bal.body.current_balance < 100000
      ? pass(`credit deducted: used ${bal.body.used} SAR, balance ${bal.body.current_balance} (${bal.body.utilization_pct}% utilized)`)
      : fail('balance check', JSON.stringify(bal.body));

    // Insufficient credit → 402
    const bulk2 = await req('POST', '/corporate/bulk-booking', {
      corporate_id: corp.body.account.id, camp_id: 1, num_beds: 500,
      start_date: '2026-10-01', end_date: '2026-12-31',
    }, aTok);
    bulk2.status === 402
      ? pass(`insufficient credit → 402 (required ${bulk2.body.required}, available ${bulk2.body.available})`)
      : fail('credit guard', JSON.stringify(bulk2.body));

    // Update credit limit (delta-based)
    const credUp = await req('POST', '/corporate/credit', {
      corporate_id: corp.body.account.id, credit_limit: 200000,
    }, aTok);
    credUp.body.credit_limit === 200000 && credUp.body.current_balance > 100000
      ? pass(`credit increased to ${credUp.body.credit_limit}, balance now ${credUp.body.current_balance}`)
      : fail('credit increase', JSON.stringify(credUp.body));

    // Generate monthly invoice (Sep 2026)
    const inv = await req('POST', '/corporate/invoice/generate', {
      corporate_id: corp.body.account.id, month: 9, year: 2026,
    }, aTok);
    inv.body.invoice?.invoice_number && inv.body.invoice.vat_amount > 0
      ? pass(`generated invoice ${inv.body.invoice.invoice_number} total ${inv.body.invoice.total_amount} VAT ${inv.body.invoice.vat_amount}`)
      : fail('invoice gen', JSON.stringify(inv.body));

    // No more unbilled bookings for that period
    const inv2 = await req('POST', '/corporate/invoice/generate', {
      corporate_id: corp.body.account.id, month: 9, year: 2026,
    }, aTok);
    inv2.status === 400 ? pass('duplicate period → no unbilled bookings (400)')
                        : fail('dup invoice', JSON.stringify(inv2.body));

    // Mark paid
    const invPay = await req('PUT', `/corporate/invoices/${inv.body.invoice.id}/pay`, {}, aTok);
    invPay.body.ok ? pass('mark invoice paid')
                   : fail('mark paid', JSON.stringify(invPay.body));

    // Spend report
    const spend = await req('GET', `/corporate/spend-report/${corp.body.account.id}`, null, aTok);
    spend.body.by_month?.length >= 1 && spend.body.invoices?.paid === 1
      ? pass(`spend report: ${spend.body.by_month.length} months, ${spend.body.invoices.paid} paid invoice`)
      : fail('spend report', JSON.stringify(spend.body));

    // List endpoints
    const invList = await req('GET', '/corporate/invoices', null, aTok);
    invList.body.invoices?.length >= 1
      ? pass(`/corporate/invoices → ${invList.body.invoices.length}`)
      : fail('invoice list', JSON.stringify(invList.body));

    // ═══════════════════════════════════════════════════
    // E5: PAYOUTS
    // ═══════════════════════════════════════════════════
    console.log('\n== E5 PAYOUTS ==');
    // Owner earnings summary (helper)
    const ownerSummary = await req('GET', `/payouts/summary/owner/${oLog.body.user.id}`, null, oTok);
    typeof ownerSummary.body.available === 'number'
      ? pass(`owner earnings: earned ${ownerSummary.body.earned}, available ${ownerSummary.body.available}`)
      : fail('owner summary', JSON.stringify(ownerSummary.body));

    // Worker can't request payout
    const wPay = await req('POST', '/payouts/request', { amount: 100 }, wTok);
    wPay.status === 403 ? pass('worker blocked from /payouts/request')
                         : fail('payout auth', `status ${wPay.status}`);

    // Owner requests payout (use a small valid amount if there's anything earned)
    let payoutId = null;
    if (ownerSummary.body.available > 0) {
      const amt = Math.min(50, ownerSummary.body.available);
      const pay = await req('POST', '/payouts/request', {
        amount: amt, bank_name: 'SNB', iban: 'SA0380000000608010167519', account_holder: 'Test Owner',
      }, oTok);
      payoutId = pay.body.request?.id;
      pay.body.request?.id ? pass(`payout requested for SAR ${amt}`)
                            : fail('payout req', JSON.stringify(pay.body));
    } else {
      pass('owner has no available earnings yet — skip request flow');
    }

    // Over-balance rejected
    const overBal = await req('POST', '/payouts/request', { amount: 999999999 }, oTok);
    overBal.status === 400 ? pass('over-balance request rejected (400)')
                            : fail('over balance', JSON.stringify(overBal.body));

    // Admin sees all requests
    const allPays = await req('GET', '/payouts', null, aTok);
    Array.isArray(allPays.body.requests)
      ? pass(`admin /payouts → ${allPays.body.requests.length} request(s)`)
      : fail('admin payouts', JSON.stringify(allPays.body));

    // Approve (if we created one)
    if (payoutId) {
      const apr = await req('PUT', `/payouts/${payoutId}/approve`, {}, aTok);
      apr.body.ok ? pass('admin approves payout')
                  : fail('approve payout', JSON.stringify(apr.body));
    }

    // ═══════════════════════════════════════════════════
    // E4: FINANCIAL REPORTS
    // ═══════════════════════════════════════════════════
    console.log('\n== E4 FINANCIAL REPORTS ==');
    const pnl = await req('GET', '/admin/finance/profit-loss', null, aTok);
    pnl.body.totals && Array.isArray(pnl.body.months)
      ? pass(`P&L: ${pnl.body.months.length} months, gross ${pnl.body.totals.gross_revenue} SAR, VAT ${pnl.body.totals.vat_collected}`)
      : fail('P&L', JSON.stringify(pnl.body));

    const comm = await req('GET', '/admin/finance/commission-report', null, aTok);
    typeof comm.body.total_commission === 'number'
      ? pass(`commission report: ${comm.body.by_owner?.length || 0} owners, ${comm.body.by_city?.length || 0} cities, total ${comm.body.total_commission} SAR`)
      : fail('commission', JSON.stringify(comm.body));

    const vat = await req('GET', '/admin/finance/vat-report', null, aTok);
    vat.body.header?.zatca_compliant && vat.body.totals
      ? pass(`VAT report: base ${vat.body.totals.taxable_base}, VAT ${vat.body.totals.vat_amount}, ${vat.body.line_items?.length || 0} line items`)
      : fail('VAT', JSON.stringify(vat.body));

    const outs = await req('GET', '/admin/finance/outstanding', null, aTok);
    outs.body.totals && Array.isArray(outs.body.unpaid_bookings)
      ? pass(`outstanding: corp ${outs.body.totals.corporate_outstanding} + bookings ${outs.body.totals.bookings_outstanding} = ${outs.body.totals.grand_total} SAR`)
      : fail('outstanding', JSON.stringify(outs.body));

    const refunds = await req('GET', '/admin/finance/refunds', null, aTok);
    Array.isArray(refunds.body.refunds) && typeof refunds.body.total === 'number'
      ? pass(`refunds: ${refunds.body.count} totaling SAR ${refunds.body.total}`)
      : fail('refunds', JSON.stringify(refunds.body));

    const payRpt = await req('GET', '/admin/finance/payout-requests', null, aTok);
    Array.isArray(payRpt.body.requests) && payRpt.body.totals
      ? pass(`payout report: ${payRpt.body.requests.length} requests, paid ${payRpt.body.totals.paid}`)
      : fail('payout report', JSON.stringify(payRpt.body));

    // Worker blocked
    const wPnl = await req('GET', '/admin/finance/profit-loss', null, wTok);
    wPnl.status === 403 ? pass('worker blocked from /admin/finance/*')
                         : fail('finance auth', `status ${wPnl.status}`);

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 19 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
