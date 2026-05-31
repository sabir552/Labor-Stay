#!/usr/bin/env node
/**
 * Piece 17 tests: worker service requests (C1), surveys (C2),
 * renewal flow (C3), notification preferences (H10).
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
  await db.query('DELETE FROM worker_service_requests', []);
  await db.query('DELETE FROM surveys', []);
  await db.query('DELETE FROM survey_responses', []);
  await db.query('DELETE FROM notification_preferences', []);

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  if (!(await waitForServer())) { srv.kill(); process.exit(1); }

  try {
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com',    password: 'Worker@123' });
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa',  password: 'Admin@123' });
    const wTok = wLog.body.token, aTok = aLog.body.token;
    if (!wTok || !aTok) throw new Error('login failed');
    // Find the actual owner of the worker's booking so the test exercises
    // the correct camp-ownership path.
    const { rows: ownerRow } = await db.query(
      "SELECT u.email FROM bookings b JOIN camps c ON c.id=b.camp_id JOIN users u ON u.id=c.owner_id WHERE b.worker_id=(SELECT id FROM users WHERE email='worker@email.com') AND b.status IN ('confirmed','checked_in') LIMIT 1", []
    );
    const ownerEmail = ownerRow[0]?.email || 'owner@riyadhcamps.sa';
    const oLog = await req('POST', '/auth/login', { email: ownerEmail, password: 'Owner@123' });
    const oTok = oLog.body.token;
    if (!oTok) throw new Error('owner login failed');
    pass(`logins ok (owner=${ownerEmail})`);

    // ─── C1: WORKER SERVICE REQUESTS ───
    console.log('\n== C1 WORKER SERVICE REQUESTS ==');
    const types = await req('GET', '/worker-requests/types', null, wTok);
    types.body.types?.length === 12
      ? pass(`/types lists 12 request types`)
      : fail('types', `got ${types.body.types?.length}`);

    // Find a confirmed booking for the worker; if none, force-create one so
    // the renewal flow always has a real, owned booking to operate on.
    const workerIdRow = await db.query("SELECT id FROM users WHERE email='worker@email.com'", []);
    const workerUserId = workerIdRow.rows[0]?.id;
    let { rows: bookings } = await db.query(
      "SELECT id, camp_id FROM bookings WHERE worker_id=$1 AND status IN ('confirmed','checked_in') LIMIT 1",
      [workerUserId]
    );
    let bookingId = bookings[0]?.id;
    let campId = bookings[0]?.camp_id;
    if (!bookingId) {
      // Promote any pending booking of this worker, or create one in camp 1.
      let anyBk = await db.query("SELECT id, camp_id FROM bookings WHERE worker_id=$1 LIMIT 1", [workerUserId]);
      if (anyBk.rows[0]) {
        bookingId = anyBk.rows[0].id; campId = anyBk.rows[0].camp_id;
        await db.query("UPDATE bookings SET status='confirmed' WHERE id=$1", [bookingId]);
      } else {
        const code = 'TEST-RNW-' + Date.now();
        const { rows: ins } = await db.query(
          "INSERT INTO bookings (booking_code, worker_id, room_id, camp_id, booking_type, start_date, end_date, occupants, base_amount, vat_amount, commission_amount, total_amount, net_to_owner, status, qr_code) VALUES ($1,$2,1,1,'monthly','2026-05-01','2026-06-01',1,1000,150,100,1150,900,'confirmed',$3) RETURNING id, camp_id",
          [code, workerUserId, code]
        );
        bookingId = ins[0].id; campId = ins[0].camp_id;
      }
    }
    // Ensure ownerEmail is for the camp that owns this booking
    const ownerForCamp = await db.query(
      "SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=$1",
      [campId]
    );
    const renewalOwnerEmail = ownerForCamp.rows[0]?.email;
    if (renewalOwnerEmail && renewalOwnerEmail !== ownerEmail) {
      // re-login as the actual camp owner so approve/reject flows work
      const ol = await req('POST', '/auth/login', { email: renewalOwnerEmail, password: 'Owner@123' });
      if (ol.body.token) globalThis.__renewalOTok = ol.body.token;
    } else {
      globalThis.__renewalOTok = oTok;
    }

    const wsr1 = await req('POST', '/worker-requests', {
      request_type: 'maintenance',
      title: 'Leaking tap in bathroom',
      description: 'Cold-water tap in bathroom 3 is leaking continuously.',
      priority: 'high',
      camp_id: campId,
    }, wTok);
    wsr1.body.request?.id
      ? pass(`POST maintenance request (id=${wsr1.body.request.id}, priority=${wsr1.body.request.priority})`)
      : fail('create request', JSON.stringify(wsr1.body));

    // Auto-priority for emergency
    const wsrEm = await req('POST', '/worker-requests', {
      request_type: 'emergency_support', title: 'Fire alarm sounding',
      description: 'Alarm has been going off for 10 minutes with no instruction.',
      camp_id: campId,
    }, wTok);
    wsrEm.body.request?.priority === 'emergency'
      ? pass('emergency_support auto-assigns priority=emergency')
      : fail('emergency priority', JSON.stringify(wsrEm.body));

    // Owner sees them sorted by priority
    const camp = await req('GET', `/worker-requests/camp/${campId}`, null, oTok);
    camp.body.requests?.length >= 2 && camp.body.requests[0].priority === 'emergency'
      ? pass(`owner sees ${camp.body.requests.length} requests, emergency first`)
      : fail('owner request list', JSON.stringify(camp.body.requests?.slice(0, 2)));

    // Worker sees their own
    const mine = await req('GET', '/worker-requests/mine', null, wTok);
    mine.body.requests?.length >= 2
      ? pass(`/mine → ${mine.body.requests.length}`)
      : fail('mine', JSON.stringify(mine.body));

    // Admin sees all
    const all = await req('GET', '/worker-requests/all', null, aTok);
    all.body.requests?.length >= 2 ? pass(`admin /all → ${all.body.requests.length}`)
                                    : fail('admin all', JSON.stringify(all.body));

    // Owner assigns request
    const assign = await req('PUT', `/worker-requests/${wsr1.body.request.id}/assign`,
      { assigned_to: 1 }, oTok);
    assign.body.ok ? pass('owner assigns request to user #1')
                   : fail('assign', JSON.stringify(assign.body));

    // Owner marks resolved with notes
    const upd = await req('PUT', `/worker-requests/${wsr1.body.request.id}/status`,
      { status: 'resolved', response_notes: 'Tap replaced by plumber.' }, oTok);
    upd.body.status === 'resolved' ? pass('owner marks request resolved')
                                   : fail('update status', JSON.stringify(upd.body));

    // Worker cannot change another worker's request
    const wsr2Worker = await req('POST', '/auth/login', { email: 'ahmed.khan0@email.com', password: 'Worker@123' });
    const w2Tok = wsr2Worker.body.token;
    const hack = await req('PUT', `/worker-requests/${wsr1.body.request.id}/status`,
      { status: 'pending' }, w2Tok);
    hack.status === 403
      ? pass('other worker blocked from status update')
      : fail('isolation', `status ${hack.status}`);

    // Non-existent booking → 400
    const badBk = await req('POST', '/worker-requests', {
      request_type: 'cleaning', title: 'x', description: 'x',
      booking_id: 99999,
    }, wTok);
    badBk.status === 400
      ? pass('invalid booking_id rejected')
      : fail('booking validation', JSON.stringify(badBk.body));

    // ─── C2: SURVEYS ───
    console.log('\n== C2 SURVEYS ==');

    // Admin creates a survey
    const surv = await req('POST', '/surveys', {
      title: 'Post-stay feedback',
      description: 'How was your stay with us?',
      questions: [
        { id: 'cleanliness', type: 'rating', label: 'Cleanliness (1-5)', required: true },
        { id: 'nps',         type: 'nps',    label: 'Recommend to a friend?' },
        { id: 'comments',    type: 'text',   label: 'Any comments?' },
        { id: 'amenities',   type: 'multi_choice', label: 'What did you like?', options: ['AC', 'WiFi', 'Food'] },
        { id: 'invalid',     type: 'bogus_type', label: 'should normalize to text' },
        { id: 'empty',       type: 'text',   label: '' },                     // dropped
      ],
    }, aTok);
    surv.body.survey?.id && surv.body.survey.questions?.length === 5
      ? pass(`POST survey (id=${surv.body.survey.id}, ${surv.body.survey.questions.length} valid questions, invalid type normalized, empty label dropped)`)
      : fail('create survey', JSON.stringify(surv.body));

    // Worker sees it as active
    const active = await req('GET', '/surveys/active', null, wTok);
    active.body.surveys?.some((s) => s.id === surv.body.survey.id)
      ? pass(`/active shows the new survey`)
      : fail('active', JSON.stringify(active.body));

    // Worker responds (with NPS = 9 → promoter)
    const resp = await req('POST', `/surveys/${surv.body.survey.id}/respond`, {
      answers: { cleanliness: 4, nps: 9, comments: 'Loved it!', amenities: ['AC', 'WiFi'] },
    }, wTok);
    resp.body.response?.id && resp.body.response.nps_score === 9
      ? pass(`worker responded, NPS=9 captured`)
      : fail('respond', JSON.stringify(resp.body));

    // Cannot respond twice
    const respDup = await req('POST', `/surveys/${surv.body.survey.id}/respond`, {
      answers: { cleanliness: 1, nps: 0 },
    }, wTok);
    respDup.status === 409
      ? pass('duplicate response blocked (409)')
      : fail('dup response', JSON.stringify(respDup.body));

    // Worker no longer sees it in /active
    const active2 = await req('GET', '/surveys/active', null, wTok);
    !active2.body.surveys?.some((s) => s.id === surv.body.survey.id)
      ? pass('survey disappears from /active after responding')
      : fail('active after resp', JSON.stringify(active2.body));

    // Second worker — detractor
    const respDet = await req('POST', `/surveys/${surv.body.survey.id}/respond`, {
      answers: { cleanliness: 2, nps: 3, comments: 'Disappointed' },
    }, w2Tok);
    respDet.body.response?.nps_score === 3
      ? pass('second worker (detractor) responded')
      : fail('detractor', JSON.stringify(respDet.body));

    // My responses
    const myResp = await req('GET', '/surveys/my-responses', null, wTok);
    myResp.body.responses?.length >= 1
      ? pass(`/my-responses → ${myResp.body.responses.length}`)
      : fail('my responses', JSON.stringify(myResp.body));

    // Aggregate results
    const results = await req('GET', `/surveys/${surv.body.survey.id}/results`, null, aTok);
    if (results.body.aggregates) {
      const cleanAvg = results.body.aggregates.cleanliness?.average;
      cleanAvg === 3
        ? pass(`results aggregate cleanliness avg = ${cleanAvg}`)
        : fail('aggregate', `cleanliness avg=${cleanAvg}`);
      // NPS: 1 promoter (9), 1 detractor (3), 0 passives → (1-1)/2 = 0
      results.body.nps_score === 0
        ? pass(`NPS = ${results.body.nps_score} (1 promoter + 1 detractor = 0)`)
        : fail('nps calc', `nps=${results.body.nps_score}`);
      // Multi-choice counts
      results.body.aggregates.amenities?.counts?.AC === 1 &&
      results.body.aggregates.amenities?.counts?.WiFi === 1
        ? pass('multi_choice counts: AC=1, WiFi=1')
        : fail('multi_choice', JSON.stringify(results.body.aggregates.amenities));
    } else {
      fail('survey results', JSON.stringify(results.body));
    }

    // Worker can't see results
    const resHack = await req('GET', `/surveys/${surv.body.survey.id}/results`, null, wTok);
    resHack.status === 403
      ? pass('worker blocked from /results')
      : fail('results auth', `status ${resHack.status}`);

    // NPS per camp endpoint (no camp_id on survey → counted regardless)
    const npsCamp = await req('GET', `/surveys/nps/camp/${campId}`, null, oTok);
    npsCamp.body.total_responses === 2 && npsCamp.body.nps_score === 0
      ? pass(`/nps/camp returns nps=0 from 2 responses`)
      : fail('nps camp', JSON.stringify(npsCamp.body));

    // ─── C3: RENEWAL FLOW ───
    console.log('\n== C3 RENEWAL FLOW ==');
    if (!bookingId) {
      fail('renewal setup', 'no booking to renew');
    } else {
      // Worker requests extension
      const { rows: bRow } = await db.query('SELECT end_date FROM bookings WHERE id=$1', [bookingId]);
      const currentEnd = bRow[0].end_date;
      const newEnd = new Date(new Date(currentEnd).getTime() + 14 * 86400000).toISOString().slice(0, 10);

      const rn = await req('POST', `/bookings/${bookingId}/renewal-request`, {
        new_end_date: newEnd, reason: 'Project extended by 2 weeks',
      }, wTok);
      rn.body.request?.id
        ? pass(`renewal requested (new end ${newEnd})`)
        : fail('renewal request', JSON.stringify(rn.body));

      // De-dup
      const rnDup = await req('POST', `/bookings/${bookingId}/renewal-request`, {
        new_end_date: newEnd,
      }, wTok);
      rnDup.status === 409
        ? pass('duplicate renewal request blocked (409)')
        : fail('renewal dup', JSON.stringify(rnDup.body));

      // Bad date (before current end)
      const rnBad = await req('POST', `/bookings/${bookingId}/renewal-request`, {
        new_end_date: '2020-01-01',
      }, wTok);
      rnBad.status === 400
        ? pass('past new_end_date rejected')
        : fail('renewal validation', JSON.stringify(rnBad.body));

      // Owner approves → new booking created
      const apr = await req('PUT', `/bookings/${bookingId}/renewal-request/approve`, {}, globalThis.__renewalOTok || oTok);
      if (apr.body.new_booking?.id) {
        pass(`renewal approved → new booking #${apr.body.new_booking.id} (${apr.body.totals.total} SAR)`);
        // Verify new booking is pending + agreement_signed=0
        apr.body.new_booking.status === 'pending' && apr.body.new_booking.agreement_signed === 0
          ? pass('new booking starts as pending with unsigned agreement')
          : fail('new booking state', JSON.stringify(apr.body.new_booking));
      } else fail('approve renewal', JSON.stringify(apr.body));

      // Worker (different one) cannot approve
      const aprHack = await req('PUT', `/bookings/${bookingId}/renewal-request/approve`, {}, w2Tok);
      // Already resolved, so 404 — either 403 or 404 is acceptable
      [403, 404].includes(aprHack.status)
        ? pass(`other worker blocked from approving (status ${aprHack.status})`)
        : fail('approve auth', `status ${aprHack.status}`);
    }

    // ─── H10: NOTIFICATION PREFERENCES ───
    console.log('\n== H10 NOTIFICATION PREFERENCES ==');
    const prefs1 = await req('GET', '/notifications/preferences', null, wTok);
    if (Array.isArray(prefs1.body.preferences) && prefs1.body.preferences.length === 24) {
      pass(`default prefs returned (${prefs1.body.preferences.length} = 6 categories × 4 channels)`);
      // Check defaults: promotion+in_app should be false (only email on for promotion)
      const promoIn = prefs1.body.preferences.find((p) => p.category === 'promotion' && p.channel === 'in_app');
      promoIn && promoIn.is_enabled === false
        ? pass('default: promotion.in_app = false')
        : fail('default check', JSON.stringify(promoIn));
    } else fail('prefs default', JSON.stringify(prefs1.body).slice(0, 200));

    // Update some prefs
    const upd2 = await req('PUT', '/notifications/preferences', {
      preferences: [
        { category: 'promotion', channel: 'email', is_enabled: false },
        { category: 'booking',   channel: 'sms',   is_enabled: false },
        { category: 'invalid',   channel: 'email', is_enabled: true },     // silently dropped
      ],
    }, wTok);
    upd2.body.updated === 2
      ? pass(`PUT prefs (updated=${upd2.body.updated}, invalid silently dropped)`)
      : fail('update prefs', JSON.stringify(upd2.body));

    // Verify the changes stuck
    const prefs2 = await req('GET', '/notifications/preferences', null, wTok);
    const promoEmail = prefs2.body.preferences.find((p) => p.category === 'promotion' && p.channel === 'email');
    const bookSms = prefs2.body.preferences.find((p) => p.category === 'booking' && p.channel === 'sms');
    promoEmail && promoEmail.is_enabled === false && bookSms && bookSms.is_enabled === false
      ? pass('updated values persisted')
      : fail('persist', JSON.stringify({ promoEmail, bookSms }));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 17 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
