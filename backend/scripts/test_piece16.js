#!/usr/bin/env node
/**
 * Piece 16 transportation tests.
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

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  if (!(await waitForServer())) { srv.kill(); process.exit(1); }

  try {
    const oLog = await req('POST', '/auth/login', { email: 'owner@riyadhcamps.sa', password: 'Owner@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com', password: 'Worker@123' });
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const w2Log = await req('POST', '/auth/login', { email: 'ahmed.khan0@email.com', password: 'Worker@123' });
    const oTok = oLog.body.token, wTok = wLog.body.token, aTok = aLog.body.token, w2Tok = w2Log.body.token;
    if (!oTok || !wTok || !aTok || !w2Tok) throw new Error('login failed');
    pass('logins ok');

    // ─── VEHICLES ───
    console.log('\n== VEHICLES ==');
    const v1 = await req('POST', '/transport/vehicles', {
      camp_id: 1, plate_number: 'ABC-1234', vehicle_type: 'bus', capacity: 50,
      driver_name: 'Ali Khan', driver_phone: '+966500000001', driver_iqama: '1234567890',
    }, oTok);
    v1.body.vehicle?.id ? pass(`POST vehicle bus (id=${v1.body.vehicle.id}, cap=${v1.body.vehicle.capacity})`)
                        : fail('create vehicle', JSON.stringify(v1.body));

    // Validation: bad vehicle_type
    const vBad = await req('POST', '/transport/vehicles', {
      plate_number: 'X', vehicle_type: 'tank', capacity: 5,
    }, oTok);
    vBad.status === 400 ? pass('invalid vehicle_type rejected')
                        : fail('vehicle validation', JSON.stringify(vBad.body));

    // Camp ownership check
    const vHack = await req('POST', '/transport/vehicles', {
      camp_id: 2, plate_number: 'HACK', vehicle_type: 'van', capacity: 10,
    }, oTok);
    vHack.status === 403 ? pass('camp ownership enforced')
                         : fail('camp guard', `status ${vHack.status}`);

    const v2 = await req('POST', '/transport/vehicles', {
      camp_id: 1, plate_number: 'XYZ-9999', vehicle_type: 'van', capacity: 12,
    }, oTok);

    const list = await req('GET', '/transport/vehicles', null, oTok);
    list.body.vehicles?.length >= 2 ? pass(`owner sees ${list.body.vehicles.length} vehicles`)
                                    : fail('list vehicles', JSON.stringify(list.body));

    // Worker is forbidden
    const wList = await req('GET', '/transport/vehicles', null, wTok);
    wList.status === 403 ? pass('worker blocked from vehicle list')
                         : fail('vehicle list auth', `status ${wList.status}`);

    const upd = await req('PUT', `/transport/vehicles/${v1.body.vehicle.id}`,
      { driver_name: 'Updated Driver' }, oTok);
    upd.body.vehicle?.driver_name === 'Updated Driver'
      ? pass('PUT vehicle') : fail('update vehicle', JSON.stringify(upd.body));

    // ─── ROUTES ───
    console.log('\n== ROUTES ==');
    const r1 = await req('POST', '/transport/routes', {
      vehicle_id: v1.body.vehicle.id, route_name: 'Camp → Industrial Zone',
      origin: 'Riyadh Camp 1', destination: 'SABIC Industrial Zone',
      stops: [{ name: 'Olaya Metro', order: 1 }, { name: 'Highway 50', order: 2 }],
      departure_time: '06:00', arrival_time: '07:30',
      days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri', 'INVALID'],
      price_per_seat: 10,
    }, oTok);
    if (r1.body.route?.id) {
      pass(`POST route id=${r1.body.route.id}`);
      r1.body.route.stops?.length === 2 ? pass('stops parsed as array') : fail('stops', JSON.stringify(r1.body.route.stops));
      r1.body.route.days_of_week?.length === 5
        ? pass(`days_of_week normalized (5 valid, 1 dropped)`)
        : fail('days normalization', JSON.stringify(r1.body.route.days_of_week));
    } else fail('create route', JSON.stringify(r1.body));

    // Route on the OTHER owner's vehicle should be 403
    const rHack = await req('POST', '/transport/routes', {
      vehicle_id: 9999, route_name: 'x', origin: 'a', destination: 'b',
    }, oTok);
    rHack.status === 404 ? pass('non-existent vehicle → 404')
                         : fail('route guard', `status ${rHack.status}`);

    // Public list
    const routes = await req('GET', '/transport/routes?camp_id=1');
    routes.body.routes?.length >= 1 ? pass(`public GET /routes → ${routes.body.routes.length}`)
                                    : fail('list routes', JSON.stringify(routes.body));

    // Append stop
    const stop = await req('POST', `/transport/routes/${r1.body.route.id}/stops`, {
      name: 'New Stop', order: 3, lat: 24.7, lng: 46.7,
    }, oTok);
    stop.body.stops?.length === 3 ? pass(`route now has ${stop.body.stops.length} stops`)
                                  : fail('append stop', JSON.stringify(stop.body));

    // Update route
    const rUpd = await req('PUT', `/transport/routes/${r1.body.route.id}`,
      { price_per_seat: 12 }, oTok);
    parseFloat(rUpd.body.route?.price_per_seat) === 12
      ? pass('PUT route price') : fail('update route', JSON.stringify(rUpd.body));

    // ─── SCHEDULES ───
    console.log('\n== SCHEDULES ==');
    const sched = await req('GET', '/transport/schedules');
    sched.body.by_day && Array.isArray(sched.body.schedules)
      ? pass(`schedules: ${sched.body.schedules.length} routes, ${Object.keys(sched.body.by_day).length} days grouped`)
      : fail('schedules', JSON.stringify(sched.body));
    sched.body.by_day?.mon?.length >= 1
      ? pass(`Monday has ${sched.body.by_day.mon.length} route(s)`)
      : fail('by_day grouping', JSON.stringify(sched.body.by_day?.mon));

    // ─── BOOKINGS ───
    console.log('\n== BOOKINGS ==');
    const TRAVEL = '2026-08-01';
    const bk1 = await req('POST', '/transport/bookings', {
      route_id: r1.body.route.id, travel_date: TRAVEL,
    }, wTok);
    bk1.body.booking?.seat_number === 1
      ? pass(`worker booked seat #${bk1.body.booking.seat_number} (auto-assigned), ${bk1.body.seats_remaining} left`)
      : fail('book seat', JSON.stringify(bk1.body));

    // Duplicate booking on same route+date should fail
    const bkDup = await req('POST', '/transport/bookings', {
      route_id: r1.body.route.id, travel_date: TRAVEL,
    }, wTok);
    bkDup.status === 409 ? pass('duplicate booking same date rejected')
                         : fail('duplicate', JSON.stringify(bkDup.body));

    // Different worker books → seat #2
    const bk2 = await req('POST', '/transport/bookings', {
      route_id: r1.body.route.id, travel_date: TRAVEL,
    }, w2Tok);
    bk2.body.booking?.seat_number === 2
      ? pass(`second worker booked seat #${bk2.body.booking.seat_number}`)
      : fail('second booking', JSON.stringify(bk2.body));

    // Worker's mine
    const mine = await req('GET', '/transport/bookings/mine', null, wTok);
    mine.body.bookings?.length >= 1
      ? pass(`/bookings/mine → ${mine.body.bookings.length}`)
      : fail('my bookings', JSON.stringify(mine.body));

    // Owner sees bookings on their fleet
    const oBk = await req('GET', '/transport/bookings', null, oTok);
    oBk.body.bookings?.length >= 2
      ? pass(`owner sees ${oBk.body.bookings.length} fleet bookings`)
      : fail('owner bookings', JSON.stringify(oBk.body));

    // Worker cancels
    const cancel = await req('PUT', `/transport/bookings/${bk1.body.booking.id}/cancel`, {}, wTok);
    cancel.body.ok ? pass('worker cancels own booking')
                   : fail('cancel', JSON.stringify(cancel.body));

    // Capacity test: spam-book until full
    // (capacity=50, already 1 seat #2 active, cancel freed #1)
    // Quickly fill remaining: cap is 50 — let's not actually book 50,
    // instead create a small-capacity vehicle for a focused test
    const vSmall = await req('POST', '/transport/vehicles', {
      camp_id: 1, plate_number: 'TINY-1', vehicle_type: 'pickup', capacity: 2,
    }, oTok);
    const rSmall = await req('POST', '/transport/routes', {
      vehicle_id: vSmall.body.vehicle.id, route_name: 'Tiny route',
      origin: 'A', destination: 'B', days_of_week: ['sat'], price_per_seat: 5,
    }, oTok);
    await req('POST', '/transport/bookings', { route_id: rSmall.body.route.id, travel_date: TRAVEL }, wTok);
    await req('POST', '/transport/bookings', { route_id: rSmall.body.route.id, travel_date: TRAVEL }, w2Tok);
    const overflow = await req('POST', '/transport/bookings', { route_id: rSmall.body.route.id, travel_date: TRAVEL }, aTok);
    overflow.status === 409 ? pass(`capacity enforced → 409 when full`)
                            : fail('capacity', JSON.stringify(overflow.body));

    // ─── TRACKING ───
    console.log('\n== GPS TRACKING ==');
    const ping1 = await req('POST', `/transport/tracking/${v1.body.vehicle.id}`, {
      latitude: 24.7136, longitude: 46.6753, speed: 45.5,
    }, oTok);
    ping1.body.location?.id ? pass('POST GPS ping')
                            : fail('ping', JSON.stringify(ping1.body));

    const last = await req('GET', `/transport/tracking/${v1.body.vehicle.id}`, null, wTok);
    parseFloat(last.body.location?.latitude) === 24.7136
      ? pass(`GET latest GPS → lat ${last.body.location.latitude}, lng ${last.body.location.longitude}`)
      : fail('get tracking', JSON.stringify(last.body));

    // No-ping vehicle returns null (no crash)
    const empty = await req('GET', `/transport/tracking/${vSmall.body.vehicle.id}`, null, wTok);
    empty.body.location === null
      ? pass('no-ping vehicle returns null + gps_provider status')
      : fail('empty tracking', JSON.stringify(empty.body));

    // Worker can't POST a ping (only owner/admin)
    const pingHack = await req('POST', `/transport/tracking/${v1.body.vehicle.id}`,
      { latitude: 0, longitude: 0 }, wTok);
    pingHack.status === 403 ? pass('worker blocked from posting ping')
                            : fail('ping auth', `status ${pingHack.status}`);

    // ─── SOFT DELETE (has bookings) ───
    console.log('\n== SOFT DELETE ==');
    const del = await req('DELETE', `/transport/vehicles/${vSmall.body.vehicle.id}`, null, oTok);
    del.body.soft === true && del.body.active_bookings >= 1
      ? pass(`vehicle with bookings soft-deleted (${del.body.active_bookings} active bookings)`)
      : fail('soft delete', JSON.stringify(del.body));

    // ─── ADMIN OVERVIEW ───
    console.log('\n== ADMIN OVERVIEW ==');
    const over = await req('GET', '/transport/admin/overview', null, aTok);
    over.body.stats?.vehicles_total >= 3
      ? pass(`admin overview: ${over.body.stats.vehicles_total} vehicles, ${over.body.stats.routes_total} routes, SAR ${over.body.stats.total_revenue} revenue`)
      : fail('admin overview', JSON.stringify(over.body));
    over.body.by_owner?.length >= 1
      ? pass(`by_owner breakdown returns ${over.body.by_owner.length} owner(s)`)
      : fail('by_owner', JSON.stringify(over.body.by_owner));

    // Worker can't access admin overview
    const wOver = await req('GET', '/transport/admin/overview', null, wTok);
    wOver.status === 403 ? pass('worker blocked from admin overview')
                         : fail('overview auth', `status ${wOver.status}`);

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 16 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
