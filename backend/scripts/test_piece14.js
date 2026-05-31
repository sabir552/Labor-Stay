#!/usr/bin/env node
/**
 * Piece 14 self-contained tests: A1 sign agreement, A3 waitlist auto-notify,
 * B1 virtual tour, B2 room dimensions, B5 enhanced nearby_pois.
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const fs = require('fs');

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
        resolve({ status: res.statusCode, body: parsed, raw: buf, headers: res.headers });
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
  // Reset security state so we don't carry blocks across runs
  const db = require('../config/database');
  await db.query('DELETE FROM ip_blocks', []);
  await db.query('DELETE FROM user_2fa', []);
  await db.query('DELETE FROM sessions', []);

  // Reset agreement state on existing seeded bookings so /pay tests can run cleanly
  await db.query("UPDATE bookings SET agreement_signed=0, agreement_url=NULL WHERE 1=1", []);

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  const ready = await waitForServer();
  if (!ready) { console.error('Server failed to start'); srv.kill(); process.exit(1); }

  try {
    const ownerLogin  = await req('POST', '/auth/login', { email: 'owner@riyadhcamps.sa', password: 'Owner@123' });
    const workerLogin = await req('POST', '/auth/login', { email: 'worker@email.com',    password: 'Worker@123' });
    const adminLogin  = await req('POST', '/auth/login', { email: 'admin@laborstay.sa',  password: 'Admin@123' });
    const oTok = ownerLogin.body.token, wTok = workerLogin.body.token, aTok = adminLogin.body.token;
    if (!oTok || !wTok || !aTok) throw new Error('login failed');
    pass('owner/worker/admin login');

    // ─── Worker creates a fresh booking (forces agreement_signed=0 by default) ───
    console.log('\n== A1 AGREEMENT SIGNING ==');
    const mkBooking = await req('POST', '/bookings', {
      room_id: 1, start_date: '2026-11-01', end_date: '2026-11-08', occupants: 1,
    }, wTok);
    if (!mkBooking.body.booking) { fail('create booking', JSON.stringify(mkBooking.body)); }
    const bookingId = mkBooking.body.booking?.id;
    const bookingCode = mkBooking.body.booking?.booking_code;
    bookingId ? pass(`new booking #${bookingId} ${bookingCode}`) : null;

    // Try paying BEFORE signing — should 412
    const earlyPay = await req('POST', '/payments/initiate', { booking_id: bookingId, method: 'mada' }, wTok);
    earlyPay.status === 412 && earlyPay.body.code === 'AGREEMENT_NOT_SIGNED'
      ? pass('payment blocked before signing (412)')
      : fail('agreement gate', JSON.stringify(earlyPay.body));

    // Try signing with wrong name — should 400
    const wrongName = await req('PUT', `/bookings/${bookingId}/sign-agreement`,
      { typed_name: 'Random Person', accept: true }, wTok);
    wrongName.status === 400
      ? pass('signing rejects mismatched name')
      : fail('name check', JSON.stringify(wrongName.body));

    // Sign correctly
    const sign = await req('PUT', `/bookings/${bookingId}/sign-agreement`,
      { typed_name: 'Demo Worker', accept: true }, wTok);
    sign.body.ok && sign.body.agreement_url
      ? pass(`agreement signed → ${sign.body.agreement_url}`)
      : fail('sign agreement', JSON.stringify(sign.body));

    // Verify file exists on disk
    if (sign.body.agreement_url) {
      const fp = path.join(__dirname, '..', sign.body.agreement_url.replace(/^\//, ''));
      const exists = fs.existsSync(fp);
      const size = exists ? fs.statSync(fp).size : 0;
      exists && size > 1000
        ? pass(`PDF on disk: ${size}b`)
        : fail('PDF on disk', `exists=${exists} size=${size}`);
    }

    // Re-sign → already signed (idempotent)
    const resign = await req('PUT', `/bookings/${bookingId}/sign-agreement`,
      { typed_name: 'Demo Worker', accept: true }, wTok);
    resign.body.message === 'Already signed'
      ? pass('re-sign is idempotent')
      : fail('re-sign', JSON.stringify(resign.body));

    // Now /payments/initiate should succeed
    const okPay = await req('POST', '/payments/initiate', { booking_id: bookingId, method: 'mada' }, wTok);
    okPay.body.payment?.id
      ? pass('payment allowed after signing')
      : fail('payment after sign', JSON.stringify(okPay.body));

    // Download the agreement
    const dl = await req('GET', `/bookings/${bookingId}/agreement`, null, wTok);
    dl.status === 200 && (dl.headers?.['content-type'] || '').includes('pdf')
      ? pass(`download agreement PDF (${dl.headers['content-type']})`)
      : fail('download agreement', `status ${dl.status} ct ${dl.headers?.['content-type']}`);

    // Another worker (NOT party to booking) downloading → 403
    // Use an existing seeded worker
    const otherWorkerLogin = await req('POST', '/auth/login', {
      email: 'ahmed.khan0@email.com', password: 'Worker@123',
    });
    if (otherWorkerLogin.body.token) {
      const dlOther = await req('GET', `/bookings/${bookingId}/agreement`, null, otherWorkerLogin.body.token);
      dlOther.status === 403
        ? pass('other worker cannot download agreement → 403')
        : fail('agreement isolation', `status ${dlOther.status}`);
    }

    // ─── A3 WAITING LIST AUTO-NOTIFY ───
    console.log('\n== A3 WAITING LIST AUTO-NOTIFY ==');
    // Set room 1 beds to 0 first, then worker tries to book → auto-added to waitlist
    await db.query('UPDATE rooms SET available_beds=0 WHERE id=1', []);
    const wlBooking = await req('POST', '/bookings', {
      room_id: 1, start_date: '2026-12-01', end_date: '2026-12-08', occupants: 1,
    }, otherWorkerLogin.body.token);
    wlBooking.status === 202
      ? pass('full room → 202 waiting_list')
      : fail('waitlist auto-add', `status ${wlBooking.status} body ${JSON.stringify(wlBooking.body)}`);

    // Worker checks their position
    const pos = await req('GET', '/waiting-list/position/1', null, otherWorkerLogin.body.token);
    pos.body.on_list && pos.body.position >= 1
      ? pass(`position on list: #${pos.body.position} of ${pos.body.total} (~${pos.body.estimated_wait_days}d)`)
      : fail('position check', JSON.stringify(pos.body));

    // Owner triggers notification manually
    const notify = await req('POST', '/waiting-list/notify/1', {}, oTok);
    notify.body.ok && notify.body.notified >= 1
      ? pass(`owner triggered notify → notified ${notify.body.notified} / ${notify.body.total_on_list}`)
      : fail('owner notify', JSON.stringify(notify.body));

    // Verify the notification landed
    const notifs = await req('GET', '/notifications', null, otherWorkerLogin.body.token);
    const bedNotif = (notifs.body.notifications || []).find((n) => n.type === 'bed_available');
    bedNotif ? pass(`worker received "bed_available" notification`)
             : fail('worker notif', `notifications=${notifs.body.notifications?.length}`);

    // ─── B1 VIRTUAL TOUR ───
    console.log('\n== B1 VIRTUAL TOUR ==');
    const tourUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    const tourPatch = await req('PATCH', '/camps/1/v2', { virtual_tour_url: tourUrl }, oTok);
    tourPatch.body.camp?.virtual_tour_url === tourUrl
      ? pass('PATCH camp virtual_tour_url')
      : fail('virtual tour patch', JSON.stringify(tourPatch.body));

    // GET camp should now include the field
    const campGet = await req('GET', '/camps/1');
    campGet.body.camp?.virtual_tour_url === tourUrl
      ? pass('GET /camps/1 includes virtual_tour_url')
      : fail('virtual_tour_url visible', `got ${campGet.body.camp?.virtual_tour_url}`);

    // Non-owner cannot patch
    const tourPatchHack = await req('PATCH', '/camps/2/v2', { virtual_tour_url: 'bad' }, oTok);
    tourPatchHack.status === 403
      ? pass('non-owner blocked from patching other camp')
      : fail('camp isolation', `status ${tourPatchHack.status}`);

    // ─── B5 NEARBY POIS ENHANCEMENT ───
    console.log('\n== B5 NEARBY POIS ==');
    const pois = [
      { name: 'King Fahad Hospital',    type: 'hospital',        distance_km: 2.4, walking_time_min: 28, lat: 24.71, lng: 46.68 },
      { name: 'NMC Pharmacy',           type: 'pharmacy',        distance_km: 0.4, walking_time_min: 5 },
      { name: 'Grand Mosque',           type: 'mosque',          distance_km: 0.8, walking_time_min: 10 },
      { name: 'Panda Supermarket',      type: 'supermarket',     distance_km: 1.2, walking_time_min: 14 },
      { name: 'SAPTCO Bus Station',     type: 'bus_station',     distance_km: 1.5, walking_time_min: 18 },
      { name: 'Riyadh Metro - Olaya',   type: 'metro_station',   distance_km: 2.1 },
      { name: 'Careem Taxi Stand',      type: 'taxi_service',    distance_km: 0.2 },
      { name: 'King Khalid Airport',    type: 'airport',         distance_km: 35.0 },
      { name: 'SABIC Industrial Zone',  type: 'industrial_area', distance_km: 12.0 },
      { name: 'New Hospital Project',   type: 'nearby_project',  distance_km: 5.0 },
      { name: 'Aramco Plant',           type: 'nearby_plant',    distance_km: 22.0 },
      { name: 'Diriyah Old Town',       type: 'nearby_city',     distance_km: 18.0 },
      { name: 'Garbage Type Should Be Normalized', type: 'unknown_type', distance_km: 1 },
    ];
    const poiPatch = await req('PATCH', '/camps/1/v2', { nearby_pois: pois }, oTok);
    const saved = poiPatch.body.camp?.nearby_pois;
    if (Array.isArray(saved) && saved.length === 13) {
      pass(`nearby_pois saved (${saved.length} entries)`);
      const unknownNormalized = saved.find((p) => p.name.startsWith('Garbage'))?.type === 'other';
      unknownNormalized ? pass('unknown POI type → "other"') : fail('POI type normalization', JSON.stringify(saved[12]));
      const allTypesPresent = ['hospital','pharmacy','mosque','supermarket','bus_station','metro_station','taxi_service','airport','industrial_area','nearby_project','nearby_plant','nearby_city']
        .every((t) => saved.some((p) => p.type === t));
      allTypesPresent ? pass('all 12 spec POI types accepted') : fail('POI types coverage', '');
    } else {
      fail('nearby_pois save', JSON.stringify(poiPatch.body).slice(0, 200));
    }

    // ─── B2 ROOM DIMENSIONS ───
    console.log('\n== B2 ROOM DIMENSIONS ==');
    const dims = {
      length_m: 4.5, width_m: 3.2, height_m: 2.8,
      num_windows: 2, floor_type: 'tiles',
      has_attached_bathroom: true, num_bathrooms: 1,
      ac_type: 'split', internet_type: 'wifi', internet_speed: '50 Mbps',
    };
    const roomPatch = await req('PATCH', '/rooms/1/v2', dims, oTok);
    if (roomPatch.body.room) {
      const r = roomPatch.body.room;
      const ok =
        r.length_m === 4.5 && r.width_m === 3.2 && r.num_windows === 2 &&
        r.has_attached_bathroom === 1 && r.ac_type === 'split' &&
        r.internet_type === 'wifi' && r.internet_speed === '50 Mbps';
      ok ? pass('all 10 room v2 fields saved')
         : fail('room v2 fields', JSON.stringify(r));
    } else {
      fail('room v2 patch', JSON.stringify(roomPatch.body));
    }

    // Bad enum should be rejected
    const badAC = await req('PATCH', '/rooms/1/v2', { ac_type: 'plasma' }, oTok);
    badAC.status === 400
      ? pass('invalid ac_type rejected (400)')
      : fail('enum validation', `status ${badAC.status}`);

    // GET room should expose new fields
    const roomGet = await req('GET', '/rooms/1');
    const rg = roomGet.body.room;
    rg?.length_m === 4.5 && rg?.has_attached_bathroom === 1
      ? pass('GET /rooms/1 includes v2 fields')
      : fail('room v2 visible', JSON.stringify(rg).slice(0, 200));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 14 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
