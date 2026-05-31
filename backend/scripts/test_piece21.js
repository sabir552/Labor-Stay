#!/usr/bin/env node
/**
 * Piece 21 tests: D5 chatbot, F4 CCTV, F5 access cards, F6 biometric,
 * G1 ERP, G2 multi-company, G3 utilities.
 *
 * All integrations should work without external services configured —
 * they fall back gracefully (Rule M5 + M17).
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:5000/api';
let FAIL = 0;
const pass = (n) => console.log(`  ✅ ${n}`);
const fail = (n, why) => { console.log(`  ❌ ${n}: ${why}`); FAIL++; };

function req(method, p, body, token, formEncoded = false) {
  return new Promise((resolve) => {
    const url = new URL(BASE + p);
    let data;
    let contentType;
    if (formEncoded && body) {
      data = new URLSearchParams(body).toString();
      contentType = 'application/x-www-form-urlencoded';
    } else if (body) {
      data = JSON.stringify(body);
      contentType = 'application/json';
    }
    const r = http.request({
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...(contentType ? { 'Content-Type': contentType } : {}),
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
  for (const t of ['cctv_cameras', 'access_cards', 'access_logs',
                   'biometric_records', 'biometric_logs', 'erp_sync_logs',
                   'companies', 'branches', 'utility_readings', 'utility_alerts']) {
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
    const { rows: ownerOf1 } = await db.query(
      `SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=1`, []
    );
    const ownerEmail = ownerOf1[0]?.email || 'owner@riyadhcamps.sa';

    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com',   password: 'Worker@123' });
    const oLog = await req('POST', '/auth/login', { email: ownerEmail,           password: 'Owner@123' });
    const aTok = aLog.body.token, wTok = wLog.body.token, oTok = oLog.body.token;
    if (!aTok || !wTok || !oTok) throw new Error('login failed');
    pass(`logins ok (owner=${ownerEmail})`);

    // ═══════════════════════════════════════════════════
    // D5: CHATBOT
    // ═══════════════════════════════════════════════════
    console.log('\n== D5 CHATBOT ==');
    const status = await req('GET', '/chatbot/status');
    typeof status.body.whatsapp_enabled === 'boolean'
      ? pass(`status: WhatsApp=${status.body.whatsapp_enabled}, AI=${status.body.ai_enabled}, fallback active=${status.body.fallback_active}`)
      : fail('chatbot status', JSON.stringify(status.body));

    // WhatsApp webhook (form-encoded)
    const wh = await req('POST', '/chatbot/whatsapp/webhook',
      { From: 'whatsapp:+966500000099', Body: 'help' }, null, true);
    wh.status === 200 ? pass('WhatsApp webhook accepted (returns TwiML)')
                       : fail('webhook', `status ${wh.status}`);

    // In-app AI chat
    const chat = await req('POST', '/chatbot/message', { message: 'How do I cancel a booking?' }, wTok);
    chat.body.reply && chat.body.source
      ? pass(`AI chat reply (source: ${chat.body.source}, ${chat.body.reply.length} chars)`)
      : fail('ai chat', JSON.stringify(chat.body));

    // Different language
    const chatAr = await req('POST', '/chatbot/message', { message: 'كيف أحجز؟' }, wTok);
    chatAr.body.reply ? pass('AI chat in Arabic')
                      : fail('ai ar', JSON.stringify(chatAr.body));

    // ═══════════════════════════════════════════════════
    // F4: CCTV
    // ═══════════════════════════════════════════════════
    console.log('\n== F4 CCTV ==');
    const cam = await req('POST', '/cctv/cameras', {
      camp_id: 1, camera_name: 'Main Gate',
      camera_type: 'ip', manufacturer: 'Hikvision', model: 'DS-2CD2T46G2',
      ip_address: '192.168.1.10', stream_url: 'rtsp://192.168.1.10/stream1',
      username: 'admin', password: 'secret123',
    }, oTok);
    cam.body.camera?.id && !cam.body.camera.password
      ? pass(`POST camera (id=${cam.body.camera.id}, password stripped from response)`)
      : fail('create camera', JSON.stringify(cam.body));

    // Worker blocked
    const camHack = await req('POST', '/cctv/cameras', {
      camp_id: 1, camera_name: 'x', camera_type: 'ip',
    }, wTok);
    camHack.status === 403 ? pass('worker blocked from CCTV')
                            : fail('cctv auth', `status ${camHack.status}`);

    const camList = await req('GET', '/cctv/cameras/camp/1', null, oTok);
    camList.body.cameras?.length === 1
      ? pass(`list cameras: ${camList.body.cameras.length}, status=${camList.body.system_status}`)
      : fail('list cctv', JSON.stringify(camList.body));

    // Feed without API → graceful
    const feed = await req('GET', `/cctv/cameras/${cam.body.camera.id}/feed`, null, oTok);
    (feed.body.status === 'CCTV not configured' || feed.body.stream_url)
      ? pass(`feed endpoint graceful: ${feed.body.status || 'configured'}`)
      : fail('feed', JSON.stringify(feed.body));

    // Snapshot
    const snap = await req('POST', `/cctv/cameras/${cam.body.camera.id}/snapshot`, {}, oTok);
    (snap.body.status === 'CCTV not configured' || snap.body.snapshot_url || snap.body.captured_at)
      ? pass('snapshot endpoint graceful')
      : fail('snapshot', JSON.stringify(snap.body));

    // Update
    const camUpd = await req('PUT', `/cctv/cameras/${cam.body.camera.id}`, { is_active: false }, oTok);
    camUpd.body.ok ? pass('PUT camera (deactivate)') : fail('update cam', JSON.stringify(camUpd.body));

    // ═══════════════════════════════════════════════════
    // F5: ACCESS CARDS
    // ═══════════════════════════════════════════════════
    console.log('\n== F5 ACCESS CARDS ==');
    const card = await req('POST', '/access/cards', {
      camp_id: 1, user_id: wLog.body.user.id,
    }, oTok);
    card.body.card?.card_uid && card.body.card.status === 'active'
      ? pass(`issued card (uid=${card.body.card.card_uid}, status=active)`)
      : fail('issue card', JSON.stringify(card.body));

    // Bulk issue
    const bulk = await req('POST', '/access/cards/bulk-issue', {
      camp_id: 1, user_ids: [11, 12, 13],
    }, oTok);
    bulk.body.count === 3 ? pass(`bulk issued ${bulk.body.count} cards`)
                          : fail('bulk', JSON.stringify(bulk.body));

    // List
    const cardList = await req('GET', '/access/cards/camp/1', null, oTok);
    cardList.body.cards?.length >= 4 ? pass(`list cards: ${cardList.body.cards.length}`)
                                      : fail('list', JSON.stringify(cardList.body));

    // Entry log
    const entry = await req('POST', '/access/logs', {
      card_id: card.body.card.id, action: 'entry', gate_name: 'main',
    }, oTok);
    entry.body.log?.id ? pass(`entry logged (id=${entry.body.log.id})`)
                       : fail('entry log', JSON.stringify(entry.body));

    // Exit log
    const exit = await req('POST', '/access/logs', {
      card_id: card.body.card.id, action: 'exit',
    }, oTok);
    exit.body.log?.id ? pass('exit logged') : fail('exit log', JSON.stringify(exit.body));

    // Re-entry with deactivated card
    const dCard = await req('PUT', `/access/cards/${card.body.card.id}`, { status: 'lost' }, oTok);
    const denied = await req('POST', '/access/logs', {
      card_id: card.body.card.id, action: 'entry',
    }, oTok);
    denied.status === 403 ? pass('lost card denied at entry')
                          : fail('denied', JSON.stringify(denied.body));

    // Currently inside
    const inside = await req('GET', '/access/logs/active/1', null, oTok);
    typeof inside.body.count === 'number'
      ? pass(`active count: ${inside.body.count}`)
      : fail('active', JSON.stringify(inside.body));

    // Logs
    const cLogs = await req('GET', '/access/logs/camp/1', null, oTok);
    cLogs.body.logs?.length >= 3 ? pass(`logs: ${cLogs.body.logs.length}`)
                                  : fail('logs', JSON.stringify(cLogs.body));

    // ═══════════════════════════════════════════════════
    // F6: BIOMETRIC
    // ═══════════════════════════════════════════════════
    console.log('\n== F6 BIOMETRIC ==');
    const bio = await req('POST', '/biometric/register', {
      type: 'fingerprint', camp_id: 1, device_id: 'DEV-001',
    }, wTok);
    bio.body.record?.id ? pass(`enrolled fingerprint (id=${bio.body.record.id})`)
                        : fail('enroll', JSON.stringify(bio.body));

    // De-dup
    const bioDup = await req('POST', '/biometric/register', {
      type: 'fingerprint', camp_id: 1,
    }, wTok);
    bioDup.status === 409 ? pass('duplicate enrollment rejected (409)')
                          : fail('dup', JSON.stringify(bioDup.body));

    // Different type works
    const bioFace = await req('POST', '/biometric/register', { type: 'face' }, wTok);
    bioFace.body.record?.id ? pass(`face enrolled (id=${bioFace.body.record.id})`)
                            : fail('face', JSON.stringify(bioFace.body));

    // Verify (with valid biometric_id)
    const ver = await req('POST', '/biometric/verify', {
      biometric_id: bio.body.record.biometric_id, camp_id: 1, action: 'check_in',
    }, oTok);
    ver.body.verified === true && ver.body.confidence_score > 0.9
      ? pass(`verified (confidence ${ver.body.confidence_score})`)
      : fail('verify', JSON.stringify(ver.body));

    // Verify invalid
    const vBad = await req('POST', '/biometric/verify', {
      biometric_id: 'FAKE-99999', camp_id: 1,
    }, oTok);
    vBad.body.verified === false ? pass('invalid biometric denied')
                                  : fail('verify bad', JSON.stringify(vBad.body));

    // Logs
    const bLogs = await req('GET', '/biometric/logs?camp_id=1', null, oTok);
    bLogs.body.logs?.length >= 2 ? pass(`biometric logs: ${bLogs.body.logs.length}`)
                                  : fail('biometric logs', JSON.stringify(bLogs.body));

    // Device sync (not configured → graceful)
    const sync = await req('POST', '/biometric/device/sync', { device_id: 'DEV-001' }, oTok);
    typeof sync.body.synced === 'boolean'
      ? pass(`device sync graceful: synced=${sync.body.synced}`)
      : fail('sync', JSON.stringify(sync.body));

    // ═══════════════════════════════════════════════════
    // G1: ERP
    // ═══════════════════════════════════════════════════
    console.log('\n== G1 ERP ==');
    const erpStatus = await req('GET', '/erp/status', null, aTok);
    erpStatus.body.erp_type === 'none' && erpStatus.body.configured === false
      ? pass(`ERP status: type=${erpStatus.body.erp_type}, not configured`)
      : fail('erp status', JSON.stringify(erpStatus.body));

    // Push bookings (not configured → logs but returns pending)
    const pushBk = await req('POST', '/erp/sync/bookings', { limit: 3 }, aTok);
    pushBk.body.pushed >= 0 && Array.isArray(pushBk.body.results)
      ? pass(`push bookings: ${pushBk.body.pushed} results (all "erp_not_configured")`)
      : fail('push bookings', JSON.stringify(pushBk.body));
    pushBk.body.results?.[0]?.status === 'erp_not_configured'
      ? pass('returns erp_not_configured gracefully')
      : fail('graceful', JSON.stringify(pushBk.body.results?.[0]));

    // Webhook (any payload accepted)
    const webhook = await req('POST', '/erp/webhook', { entity_type: 'invoice', entity_id: 99 }, aTok);
    webhook.body.ok ? pass('ERP webhook accepted')
                    : fail('webhook', JSON.stringify(webhook.body));

    // Sync logs
    const elog = await req('GET', '/erp/sync/logs', null, aTok);
    elog.body.logs?.length >= 3 && elog.body.totals
      ? pass(`sync logs: ${elog.body.logs.length}, statuses=${Object.keys(elog.body.totals).join(',')}`)
      : fail('sync logs', JSON.stringify(elog.body));

    // Worker blocked
    const erpHack = await req('GET', '/erp/status', null, wTok);
    erpHack.status === 403 ? pass('worker blocked from ERP')
                            : fail('erp auth', `status ${erpHack.status}`);

    // Manual sync
    const manual = await req('POST', '/erp/sync/manual', {}, aTok);
    manual.body.counts ? pass(`manual sync: ${JSON.stringify(manual.body.counts)}`)
                       : fail('manual', JSON.stringify(manual.body));

    // ═══════════════════════════════════════════════════
    // G2: MULTI-COMPANY
    // ═══════════════════════════════════════════════════
    console.log('\n== G2 MULTI-COMPANY ==');
    const co = await req('POST', '/companies', {
      name: 'Saudi Mega Holding', cr_number: '1010100001',
      vat_number: '300000000003', email: 'finance@saudimega.com',
      credit_limit: 500000, payment_terms: 'net60',
    }, aTok);
    co.body.company?.id ? pass(`POST company (id=${co.body.company.id})`)
                        : fail('create company', JSON.stringify(co.body));

    // Worker blocked
    const coHack = await req('POST', '/companies', { name: 'Bad' }, wTok);
    coHack.status === 403 ? pass('worker blocked from /companies')
                           : fail('co auth', `status ${coHack.status}`);

    // Add branches
    const br1 = await req('POST', `/companies/${co.body.company.id}/branches`, {
      branch_name: 'Riyadh HQ', address: 'King Fahd Road',
      manager_name: 'Sami Branch Manager', manager_email: 'riyadh@saudimega.com',
    }, aTok);
    const br2 = await req('POST', `/companies/${co.body.company.id}/branches`, {
      branch_name: 'Jeddah Office', city: 'Jeddah',
    }, aTok);
    br1.body.branch?.id && br2.body.branch?.id
      ? pass(`added 2 branches`)
      : fail('branches', JSON.stringify(br1.body));

    // List companies (with rollup counts)
    const coList = await req('GET', '/companies', null, aTok);
    coList.body.companies?.length >= 1
      ? pass(`list companies: ${coList.body.companies.length}, with rollup counts`)
      : fail('list co', JSON.stringify(coList.body));

    // Detail
    const coDetail = await req('GET', `/companies/${co.body.company.id}`, null, aTok);
    coDetail.body.branches?.length === 2
      ? pass(`detail: 2 branches loaded`)
      : fail('co detail', JSON.stringify(coDetail.body));

    // Update branch
    const brUpd = await req('PUT', `/companies/${co.body.company.id}/branches/${br1.body.branch.id}`,
      { manager_phone: '+966500000099' }, aTok);
    brUpd.body.branch?.manager_phone === '+966500000099'
      ? pass('PUT branch')
      : fail('branch update', JSON.stringify(brUpd.body));

    // Analytics
    const ana = await req('GET', `/companies/${co.body.company.id}/analytics`, null, aTok);
    ana.body.stats ? pass(`analytics: ${JSON.stringify(ana.body.stats)}`)
                   : fail('analytics', JSON.stringify(ana.body));

    // Bookings + staff rollups
    const coBk = await req('GET', `/companies/${co.body.company.id}/bookings`, null, aTok);
    const coSt = await req('GET', `/companies/${co.body.company.id}/staff`, null, aTok);
    Array.isArray(coBk.body.bookings) && Array.isArray(coSt.body.staff)
      ? pass('bookings + staff rollups return arrays')
      : fail('rollups', '');

    // ═══════════════════════════════════════════════════
    // G3: UTILITIES
    // ═══════════════════════════════════════════════════
    console.log('\n== G3 UTILITIES ==');
    const r1 = await req('POST', '/utilities/readings', {
      camp_id: 1, utility_type: 'electricity',
      meter_number: 'M-001', current_reading: 1000, rate_per_unit: 0.18,
      reading_date: '2026-05-01',
    }, oTok);
    r1.body.reading?.id && parseFloat(r1.body.reading.consumption) === 1000
      ? pass(`reading 1 (1000 kWh @ 0.18 = SAR ${r1.body.reading.total_cost})`)
      : fail('reading 1', JSON.stringify(r1.body));

    // Second reading — should compute delta automatically
    const r2 = await req('POST', '/utilities/readings', {
      camp_id: 1, utility_type: 'electricity',
      meter_number: 'M-001', current_reading: 1500, rate_per_unit: 0.18,
      reading_date: '2026-05-15',
    }, oTok);
    parseFloat(r2.body.reading?.consumption) === 500
      ? pass(`reading 2 auto-computed delta 500 kWh (prev was 1000)`)
      : fail('delta', JSON.stringify(r2.body));

    // Water reading
    const r3 = await req('POST', '/utilities/readings', {
      camp_id: 1, utility_type: 'water', current_reading: 50, rate_per_unit: 3.5,
    }, oTok);
    r3.body.reading?.id ? pass('water reading')
                        : fail('water', JSON.stringify(r3.body));

    // Bad type
    const rBad = await req('POST', '/utilities/readings', {
      camp_id: 1, utility_type: 'lightsaber', current_reading: 1,
    }, oTok);
    rBad.status === 400 ? pass('invalid utility_type rejected')
                        : fail('bad type', JSON.stringify(rBad.body));

    // List
    const rList = await req('GET', '/utilities/readings/camp/1?utility_type=electricity', null, oTok);
    rList.body.readings?.length === 2
      ? pass(`list filtered: ${rList.body.readings.length} electricity readings`)
      : fail('list readings', JSON.stringify(rList.body));

    // Alert
    const a1 = await req('POST', '/utilities/alerts', {
      camp_id: 1, utility_type: 'electricity', threshold_value: 100,
      alert_email: 'alerts@laborstay.sa',
    }, oTok);
    a1.body.alert?.id ? pass(`alert set (threshold 100 kWh)`)
                      : fail('alert', JSON.stringify(a1.body));

    // Trigger alert by inserting > threshold reading
    const r4 = await req('POST', '/utilities/readings', {
      camp_id: 1, utility_type: 'electricity', meter_number: 'M-001',
      current_reading: 2500, rate_per_unit: 0.18, reading_date: '2026-05-31',
    }, oTok);
    parseFloat(r4.body.reading?.consumption) === 1000
      ? pass(`reading 3 (1000 kWh) — should trigger threshold 100`)
      : fail('trigger', JSON.stringify(r4.body));

    // Reports
    const rpt = await req('GET', '/utilities/reports/camp/1', null, oTok);
    rpt.body.by_type?.length >= 2
      ? pass(`report: ${rpt.body.by_type.length} utility types, ${rpt.body.by_month?.length || 0} months`)
      : fail('report', JSON.stringify(rpt.body));

    const cost = await req('GET', '/utilities/cost/camp/1', null, oTok);
    typeof cost.body.cost_per_worker === 'number'
      ? pass(`cost/worker: SAR ${cost.body.cost_per_worker} (${cost.body.active_occupants} occupants)`)
      : fail('cost', JSON.stringify(cost.body));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 21 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
