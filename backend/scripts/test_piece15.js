#!/usr/bin/env node
/**
 * Piece 15 catering module tests.
 * Verifies menu CRUD, attendance, packages, orders, reports.
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
  // Reset security state
  const db = require('../config/database');
  await db.query('DELETE FROM ip_blocks', []);
  await db.query('DELETE FROM user_2fa', []);
  await db.query('DELETE FROM sessions', []);

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  if (!(await waitForServer())) { srv.kill(); process.exit(1); }

  try {
    const oLog = await req('POST', '/auth/login', { email: 'owner@riyadhcamps.sa', password: 'Owner@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com',    password: 'Worker@123' });
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa',  password: 'Admin@123' });
    const w2Log = await req('POST', '/auth/login', { email: 'ahmed.khan0@email.com', password: 'Worker@123' });
    const oTok = oLog.body.token, wTok = wLog.body.token, aTok = aLog.body.token, w2Tok = w2Log.body.token;
    if (!oTok || !wTok || !aTok) throw new Error('login failed');
    pass('owner/worker/admin login');

    // Owner has camps 1 and 6 in seed. Use camp 1.
    const CAMP_ID = 1;

    // ─── MENU ───
    console.log('\n== MENU ==');
    const today = new Date().toISOString().slice(0, 10);
    const tom   = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

    const m1 = await req('POST', '/catering/menu', {
      camp_id: CAMP_ID, date: today, meal_type: 'breakfast',
      items: ['Foul medames', 'Falafel', 'Pita bread', 'Tea'],
      dietary_options: ['halal', 'vegetarian'],
      cost_per_person: 12.5,
    }, oTok);
    m1.body.menu?.id && Array.isArray(m1.body.menu.items)
      ? pass(`POST menu breakfast (id=${m1.body.menu.id}, ${m1.body.menu.items.length} items)`)
      : fail('create menu', JSON.stringify(m1.body));

    // Upsert — same date+meal_type → updates
    const m1again = await req('POST', '/catering/menu', {
      camp_id: CAMP_ID, date: today, meal_type: 'breakfast',
      items: ['Foul medames', 'Falafel', 'Yogurt', 'Pita', 'Tea'],
      cost_per_person: 13.0,
    }, oTok);
    m1again.body.updated === true
      ? pass('POST menu same key → upserts (updated)')
      : fail('menu upsert', JSON.stringify(m1again.body));

    const m2 = await req('POST', '/catering/menu', {
      camp_id: CAMP_ID, date: today, meal_type: 'lunch',
      items: ['Kabsa with chicken', 'Salad', 'Laban'],
      dietary_options: ['halal'], cost_per_person: 22.0,
    }, oTok);
    const m3 = await req('POST', '/catering/menu', {
      camp_id: CAMP_ID, date: tom, meal_type: 'breakfast',
      items: ['Shakshuka', 'Tea'], cost_per_person: 11.0,
    }, oTok);
    m2.status === 201 && m3.status === 201 ? pass('POST 2 more menus') : fail('extra menus', '');

    // GET menu
    const menuGet = await req('GET', `/catering/menu/${CAMP_ID}?start=${today}&end=${tom}`, null, wTok);
    menuGet.body.menu?.length === 3
      ? pass(`GET menu → 3 entries`)
      : fail('get menu', JSON.stringify(menuGet.body));

    // Update a menu item
    const upd = await req('PUT', `/catering/menu/${m1.body.menu.id}`, {
      items: ['Updated breakfast'], cost_per_person: 15.0,
    }, oTok);
    upd.body.menu?.items?.[0] === 'Updated breakfast'
      ? pass('PUT menu update')
      : fail('update menu', JSON.stringify(upd.body));

    // Non-owner cannot update other camp's menu
    const hack = await req('POST', '/catering/menu', {
      camp_id: 2, date: today, meal_type: 'lunch', items: ['hack'], cost_per_person: 1,
    }, oTok);
    hack.status === 403
      ? pass('non-owner blocked from camp 2')
      : fail('camp isolation', `status ${hack.status}`);

    // ─── ATTENDANCE ───
    console.log('\n== ATTENDANCE ==');
    const att = await req('POST', '/catering/attendance', {
      camp_id: CAMP_ID, date: today, meal_type: 'breakfast', attended: true,
    }, wTok);
    att.body.attendance?.id ? pass('worker self-records attendance')
                            : fail('attendance', JSON.stringify(att.body));

    // Re-post → upsert
    const att2 = await req('POST', '/catering/attendance', {
      camp_id: CAMP_ID, date: today, meal_type: 'breakfast', attended: false,
    }, wTok);
    att2.body.updated === true ? pass('attendance upsert (toggle to absent)')
                               : fail('attendance upsert', JSON.stringify(att2.body));

    // Second worker
    await req('POST', '/catering/attendance', {
      camp_id: CAMP_ID, date: today, meal_type: 'breakfast', attended: true,
    }, w2Tok);
    await req('POST', '/catering/attendance', {
      camp_id: CAMP_ID, date: today, meal_type: 'lunch', attended: true,
    }, w2Tok);

    // Owner-side log for someone else
    const ownerLog = await req('POST', '/catering/attendance', {
      camp_id: CAMP_ID, user_id: 11, date: today, meal_type: 'lunch', attended: true,
    }, oTok);
    ownerLog.status === 201 || ownerLog.body.updated
      ? pass('owner logs attendance for worker')
      : fail('owner attendance log', JSON.stringify(ownerLog.body));

    // GET attendance report
    const report = await req('GET', `/catering/attendance/${CAMP_ID}`, null, oTok);
    report.body.summary?.total >= 3
      ? pass(`attendance summary: ${report.body.summary.total} entries, ${report.body.summary.unique_workers} workers`)
      : fail('attendance report', JSON.stringify(report.body.summary));

    // Worker cannot view attendance report
    const wAtt = await req('GET', `/catering/attendance/${CAMP_ID}`, null, wTok);
    wAtt.status === 403 ? pass('worker blocked from attendance report')
                        : fail('attendance auth', `status ${wAtt.status}`);

    // ─── PACKAGES ───
    console.log('\n== PACKAGES ==');
    const p1 = await req('POST', '/catering/packages', {
      camp_id: CAMP_ID, name: 'Full Board',
      description: 'Breakfast, lunch and dinner',
      includes_breakfast: true, includes_lunch: true, includes_dinner: true,
      price_per_day: 45,
    }, oTok);
    p1.body.package?.id ? pass(`POST package "${p1.body.package.name}"`)
                        : fail('create package', JSON.stringify(p1.body));

    const p2 = await req('POST', '/catering/packages', {
      camp_id: CAMP_ID, name: 'Lunch Only', includes_lunch: true, price_per_day: 18,
    }, oTok);
    const p3 = await req('POST', '/catering/packages', {
      camp_id: CAMP_ID, name: 'B & D', includes_breakfast: true, includes_dinner: true, price_per_day: 32,
    }, oTok);
    p2.status === 201 && p3.status === 201 ? pass('POST 2 more packages') : fail('extra packages', '');

    const pkgList = await req('GET', `/catering/packages/${CAMP_ID}`, null, wTok);
    pkgList.body.packages?.length === 3
      ? pass(`GET packages → 3 entries, sorted by price (cheapest first: ${pkgList.body.packages[0].name})`)
      : fail('list packages', JSON.stringify(pkgList.body));

    // Deactivate a package
    const deact = await req('PUT', `/catering/packages/${p2.body.package.id}`, { is_active: false }, oTok);
    deact.body.package?.is_active === false
      ? pass('PUT package is_active=false')
      : fail('deactivate package', JSON.stringify(deact.body));

    // ─── ORDERS ───
    console.log('\n== ORDERS ==');
    // Worker orders the Full Board for 5 days × 2 persons
    const ord = await req('POST', '/catering/orders', {
      camp_id: CAMP_ID, package_id: p1.body.package.id,
      start_date: today, end_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      num_persons: 2, notes: 'Halal only',
    }, wTok);
    ord.body.order?.id && ord.body.total === 450
      ? pass(`POST order (5d × 2p × 45 SAR = ${ord.body.total})`)
      : fail('create order', JSON.stringify(ord.body));

    // Worker cannot order inactive package
    const ordBad = await req('POST', '/catering/orders', {
      camp_id: CAMP_ID, package_id: p2.body.package.id,
      start_date: today, end_date: tom, num_persons: 1,
    }, wTok);
    ordBad.status === 404
      ? pass('order rejected for inactive package')
      : fail('inactive package order', JSON.stringify(ordBad.body));

    // Worker sees their orders
    const myOrders = await req('GET', '/catering/orders/mine', null, wTok);
    myOrders.body.orders?.length >= 1
      ? pass(`/orders/mine returned ${myOrders.body.orders.length} order(s)`)
      : fail('my orders', JSON.stringify(myOrders.body));

    // Owner sees orders for their camp
    const ownerOrders = await req('GET', '/catering/orders', null, oTok);
    ownerOrders.body.orders?.length >= 1
      ? pass(`owner /orders → ${ownerOrders.body.orders.length}`)
      : fail('owner orders', JSON.stringify(ownerOrders.body));

    // Owner approves
    const apr = await req('PUT', `/catering/orders/${ord.body.order.id}/status`,
      { status: 'approved' }, oTok);
    apr.body.status === 'approved'
      ? pass('owner approves order')
      : fail('approve order', JSON.stringify(apr.body));

    // Worker tries to cancel approved order — should fail
    const cancelLate = await req('DELETE', `/catering/orders/${ord.body.order.id}`, null, wTok);
    cancelLate.status === 400
      ? pass('worker cannot cancel non-pending order')
      : fail('cancel approved', JSON.stringify(cancelLate.body));

    // ─── REPORTS ───
    console.log('\n== REPORTS ==');
    const rpt = await req('GET', `/catering/reports/${CAMP_ID}`, null, oTok);
    rpt.body.summary
      ? pass(`owner report — meals: ${rpt.body.summary.meals_served}, revenue: SAR ${rpt.body.summary.revenue}`)
      : fail('owner report', JSON.stringify(rpt.body));

    const aRpt = await req('GET', '/catering/reports/admin', null, aTok);
    aRpt.body.totals && Array.isArray(aRpt.body.camps)
      ? pass(`admin report: ${aRpt.body.camps.length} camps, total revenue SAR ${aRpt.body.totals.revenue}`)
      : fail('admin report', JSON.stringify(aRpt.body));

    // Worker cannot access admin report
    const wRpt = await req('GET', '/catering/reports/admin', null, wTok);
    wRpt.status === 403 ? pass('worker blocked from admin report')
                        : fail('admin report auth', `status ${wRpt.status}`);

    // ─── DELETE menu ───
    console.log('\n== DELETE ==');
    const del = await req('DELETE', `/catering/menu/${m1.body.menu.id}`, null, oTok);
    del.body.ok ? pass('DELETE menu item') : fail('delete menu', JSON.stringify(del.body));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 15 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
