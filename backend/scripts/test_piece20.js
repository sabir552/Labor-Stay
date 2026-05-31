#!/usr/bin/env node
/**
 * Piece 20 tests: H1 referrals, H2 loyalty, H3 compare, H4 price alerts,
 * H5 badges, H7 maintenance, H8 disputes, H9 calendars.
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
  for (const t of ['referrals', 'loyalty_points', 'price_alerts', 'badges',
                   'maintenance_requests', 'disputes']) {
    await db.query(`DELETE FROM ${t}`, []).catch(() => {});
  }
  // Reset referral codes
  await db.query("UPDATE users SET referral_code=NULL, referred_by_code=NULL", []);

  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  if (!(await waitForServer())) { srv.kill(); process.exit(1); }

  try {
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com',   password: 'Worker@123' });
    const w2Log = await req('POST', '/auth/login', { email: 'ahmed.khan0@email.com', password: 'Worker@123' });
    const aTok = aLog.body.token, wTok = wLog.body.token, w2Tok = w2Log.body.token;

    // Find owner of camp 1
    const { rows: ownerOf1 } = await db.query(
      `SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=1`, []
    );
    const ownerEmail = ownerOf1[0]?.email || 'owner@riyadhcamps.sa';
    const oLog = await req('POST', '/auth/login', { email: ownerEmail, password: 'Owner@123' });
    const oTok = oLog.body.token;
    if (!aTok || !wTok || !w2Tok || !oTok) throw new Error('login failed');
    pass(`logins ok (owner=${ownerEmail})`);

    // Find a confirmed booking for the worker
    const { rows: bks } = await db.query(
      `SELECT id, camp_id FROM bookings WHERE worker_id=$1 AND status IN ('confirmed','checked_in','checked_out') LIMIT 1`,
      [wLog.body.user.id]
    );
    let workerBookingId = bks[0]?.id;
    let workerCampId = bks[0]?.camp_id;
    if (!workerBookingId) {
      const r = await db.query(
        `INSERT INTO bookings (booking_code,worker_id,room_id,camp_id,booking_type,start_date,end_date,occupants,base_amount,vat_amount,commission_amount,total_amount,net_to_owner,status,qr_code) VALUES ('TEST-' || $1,$1,1,1,'monthly','2026-06-01','2026-07-01',1,1000,150,100,1150,900,'confirmed','x') RETURNING id, camp_id`,
        [wLog.body.user.id]
      );
      workerBookingId = r.rows[0].id; workerCampId = r.rows[0].camp_id;
    }

    // ═══════════════════════════════════════════════════
    // H1: REFERRALS
    // ═══════════════════════════════════════════════════
    console.log('\n== H1 REFERRALS ==');
    const myCode = await req('GET', '/referrals/my-code', null, wTok);
    if (myCode.body.code?.length === 8 && myCode.body.reward_amount === 50) {
      pass(`generated code: ${myCode.body.code} (reward SAR ${myCode.body.reward_amount})`);
    } else fail('my-code', JSON.stringify(myCode.body));

    // Apply that code as second worker
    const apply = await req('POST', '/referrals/apply', { code: myCode.body.code }, w2Tok);
    apply.body.referral?.id ? pass(`w2 applied code → referral id=${apply.body.referral.id}`)
                            : fail('apply', JSON.stringify(apply.body));

    // Self-referral rejected
    const selfRef = await req('POST', '/referrals/apply', { code: myCode.body.code }, wTok);
    selfRef.status === 400 ? pass('self-referral rejected')
                            : fail('self-referral', `status ${selfRef.status}`);

    // Duplicate application rejected
    const dup = await req('POST', '/referrals/apply', { code: myCode.body.code }, w2Tok);
    dup.status === 409 ? pass('duplicate apply rejected (409)')
                        : fail('dup', JSON.stringify(dup.body));

    // Invalid code
    const bad = await req('POST', '/referrals/apply', { code: 'NOPE9999' }, w2Tok);
    bad.status === 404 ? pass('invalid code → 404')
                       : fail('bad code', JSON.stringify(bad.body));

    // Stats
    const stats = await req('GET', '/referrals/stats', null, wTok);
    stats.body.referrals?.length >= 1 && stats.body.summary?.pending >= 1
      ? pass(`stats: ${stats.body.referrals.length} referrals, pending ${stats.body.summary.pending}`)
      : fail('stats', JSON.stringify(stats.body));

    // Test internal credit function (after first booking)
    const referralsModule = require('../routes/referrals');
    const credited = await referralsModule.maybeCreditReferral(w2Log.body.user.id);
    // Re-fetch the row to confirm DB was updated (function returns pre-update row)
    const { rows: refRow } = await db.query('SELECT * FROM referrals WHERE referred_id=$1', [w2Log.body.user.id]);
    refRow[0]?.reward_credited && refRow[0]?.status === 'rewarded'
      ? pass(`maybeCreditReferral → DB rewarded SAR ${refRow[0].reward_amount}`)
      : fail('credit referral', JSON.stringify(refRow[0]));

    // Verify the loyalty bonus was added to referrer
    const refLoyalty = await req('GET', '/loyalty/balance', null, wTok);
    refLoyalty.body.points >= 500 ? pass(`referrer earned ${refLoyalty.body.points} loyalty pts (SAR 50 × 10)`)
                                   : fail('loyalty after referral', JSON.stringify(refLoyalty.body));

    // Leaderboard
    const lb = await req('GET', '/referrals/leaderboard', null, aTok);
    Array.isArray(lb.body.leaderboard)
      ? pass(`leaderboard returned ${lb.body.leaderboard.length} entries`)
      : fail('leaderboard', JSON.stringify(lb.body));

    // ═══════════════════════════════════════════════════
    // H2: LOYALTY
    // ═══════════════════════════════════════════════════
    console.log('\n== H2 LOYALTY ==');
    // Get balance (already has 500 from referral)
    const bal = await req('GET', '/loyalty/balance', null, wTok);
    if (bal.body.points === 500 && bal.body.tier === 'silver') {
      pass(`silver tier (500 pts = SAR ${bal.body.sar_value}, ${bal.body.discount_pct}% off)`);
    } else fail('balance', JSON.stringify(bal.body));

    // Tiers
    const tiers = await req('GET', '/loyalty/tiers');
    tiers.body.tiers?.length === 3 ? pass('3 tiers exposed')
                                    : fail('tiers', JSON.stringify(tiers.body));

    // Admin credit
    const cred = await req('POST', '/loyalty/credit', {
      user_id: wLog.body.user.id, points: 1500, reason: 'Promo',
    }, aTok);
    cred.body.entry?.id ? pass('admin credited 1500 pts')
                        : fail('credit', JSON.stringify(cred.body));

    // Now gold tier
    const bal2 = await req('GET', '/loyalty/balance', null, wTok);
    bal2.body.tier === 'gold' && bal2.body.discount_pct === 10
      ? pass(`upgraded to gold (${bal2.body.points} pts, 10% off)`)
      : fail('tier upgrade', JSON.stringify(bal2.body));

    // Redeem
    const redeem = await req('POST', '/loyalty/redeem', { points: 300 }, wTok);
    redeem.body.discount_sar === 30 && redeem.body.new_balance === 1700
      ? pass(`redeemed 300 pts for SAR 30 discount, balance ${redeem.body.new_balance}`)
      : fail('redeem', JSON.stringify(redeem.body));

    // Too few points
    const lowRedeem = await req('POST', '/loyalty/redeem', { points: 50 }, w2Tok);
    lowRedeem.status === 400 ? pass('redeem rejected (under 100 pts)')
                              : fail('low redeem', JSON.stringify(lowRedeem.body));

    // History
    const hist = await req('GET', '/loyalty/history', null, wTok);
    hist.body.transactions?.length >= 3
      ? pass(`history: ${hist.body.transactions.length} entries`)
      : fail('history', JSON.stringify(hist.body));

    // ═══════════════════════════════════════════════════
    // H3: COMPARE
    // ═══════════════════════════════════════════════════
    console.log('\n== H3 COMPARE ==');
    const cmp = await req('GET', '/camps/compare?ids=1,2,3');
    cmp.body.camps?.length === 3 && cmp.body.comparing === 3
      ? pass(`compared 3 camps: ${cmp.body.camps.map((c) => c.name.slice(0, 20)).join(' vs ')}`)
      : fail('compare', JSON.stringify(cmp.body));

    // Has all the fields we need to render comparison
    const c1 = cmp.body.camps?.[0];
    c1?.amenities && c1.min_price_day !== undefined && c1.total_capacity !== undefined
      ? pass('comparison includes amenities, min_price_day, total_capacity')
      : fail('compare fields', JSON.stringify(c1).slice(0, 200));

    // Too many
    const cmpBad = await req('GET', '/camps/compare?ids=1,2,3,4');
    cmpBad.status === 400 ? pass('max 3 enforced')
                          : fail('compare max', `status ${cmpBad.status}`);

    // ═══════════════════════════════════════════════════
    // H5: BADGES
    // ═══════════════════════════════════════════════════
    console.log('\n== H5 BADGES ==');
    const cBadge = await req('GET', '/badges/camp/1');
    Array.isArray(cBadge.body.badges)
      ? pass(`camp 1 badges: ${cBadge.body.badges.map((b) => b.key).join(', ') || 'none'}`)
      : fail('camp badges', JSON.stringify(cBadge.body));

    const wBadge = await req('GET', `/badges/worker/${wLog.body.user.id}`);
    Array.isArray(wBadge.body.badges)
      ? pass(`worker badges: ${wBadge.body.badges.map((b) => b.key).join(', ') || 'none'}`)
      : fail('worker badges', JSON.stringify(wBadge.body));

    // ═══════════════════════════════════════════════════
    // H4: PRICE ALERTS
    // ═══════════════════════════════════════════════════
    console.log('\n== H4 PRICE ALERTS ==');
    const pa = await req('POST', '/price-alerts', {
      city: 'Riyadh', camp_type: 'standard', max_price: 100,
    }, wTok);
    pa.body.alert?.id ? pass(`POST alert id=${pa.body.alert.id}`)
                      : fail('create alert', JSON.stringify(pa.body));

    const paMine = await req('GET', '/price-alerts/mine', null, wTok);
    paMine.body.alerts?.length === 1 ? pass(`/mine → 1 alert`)
                                      : fail('mine alerts', JSON.stringify(paMine.body));

    // Trigger check
    const paCheck = await req('POST', '/price-alerts/check', {}, aTok);
    typeof paCheck.body.notified === 'number'
      ? pass(`alert check ran → notified ${paCheck.body.notified} workers`)
      : fail('alert check', JSON.stringify(paCheck.body));

    // Update
    const paUpd = await req('PUT', `/price-alerts/${pa.body.alert.id}`,
      { max_price: 200 }, wTok);
    paUpd.body.alert?.max_price == 200 ? pass('PUT alert')
                                       : fail('update alert', JSON.stringify(paUpd.body));

    // Delete
    const paDel = await req('DELETE', `/price-alerts/${pa.body.alert.id}`, null, wTok);
    paDel.body.ok ? pass('DELETE alert')
                  : fail('delete alert', JSON.stringify(paDel.body));

    // ═══════════════════════════════════════════════════
    // H7: MAINTENANCE
    // ═══════════════════════════════════════════════════
    console.log('\n== H7 MAINTENANCE ==');
    const m1 = await req('POST', '/maintenance', {
      camp_id: workerCampId, title: 'AC not cooling',
      description: 'Unit blows warm air since yesterday',
      priority: 'high', photo_urls: ['https://example.com/a.jpg'],
    }, wTok);
    m1.body.request?.id ? pass(`create maintenance (id=${m1.body.request.id}, priority=high)`)
                        : fail('create m', JSON.stringify(m1.body));

    // Owner list (using the actual owner of the camp the worker booked)
    const { rows: campOwner } = await db.query(
      `SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=$1`, [workerCampId]
    );
    let realOTok = oTok;
    if (campOwner[0]?.email && campOwner[0].email !== ownerEmail) {
      const ol = await req('POST', '/auth/login', { email: campOwner[0].email, password: 'Owner@123' });
      realOTok = ol.body.token || oTok;
    }
    const mList = await req('GET', `/maintenance/camp/${workerCampId}`, null, realOTok);
    mList.body.requests?.length >= 1 ? pass(`owner sees ${mList.body.requests.length} requests`)
                                      : fail('m list', JSON.stringify(mList.body));

    // Assign
    const mAssign = await req('PUT', `/maintenance/${m1.body.request.id}/assign`,
      { assigned_to: 1 }, realOTok);
    mAssign.body.ok ? pass('assign to user #1')
                    : fail('assign', JSON.stringify(mAssign.body));

    // Add cost
    const mCost = await req('POST', `/maintenance/${m1.body.request.id}/cost`,
      { parts_cost: 150, labor_cost: 80 }, realOTok);
    mCost.body.total === 230 ? pass(`cost added: total SAR ${mCost.body.total}`)
                             : fail('cost', JSON.stringify(mCost.body));

    // Status → resolved
    const mRes = await req('PUT', `/maintenance/${m1.body.request.id}/status`,
      { status: 'resolved' }, realOTok);
    mRes.body.ok ? pass('resolved')
                 : fail('resolve', JSON.stringify(mRes.body));

    // Worker closes (verifies fix)
    const mClose = await req('POST', `/maintenance/${m1.body.request.id}/close`, {}, wTok);
    mClose.body.ok ? pass('worker verifies → closed')
                   : fail('close', JSON.stringify(mClose.body));

    // Reports
    const mRpt = await req('GET', '/maintenance/reports/all', null, aTok);
    Array.isArray(mRpt.body.by_priority)
      ? pass(`reports: ${mRpt.body.by_priority.length} priority groups`)
      : fail('reports', JSON.stringify(mRpt.body));

    // ═══════════════════════════════════════════════════
    // H8: DISPUTES
    // ═══════════════════════════════════════════════════
    console.log('\n== H8 DISPUTES ==');
    const d1 = await req('POST', '/disputes', {
      booking_id: workerBookingId,
      subject: 'Camp not as advertised',
      description: 'The room shown in photos was much larger than what we got.',
      category: 'false_listing',
    }, wTok);
    d1.body.dispute?.id ? pass(`raised dispute (id=${d1.body.dispute.id})`)
                        : fail('raise', JSON.stringify(d1.body));

    // Worker sees their own
    const dMine = await req('GET', '/disputes/mine', null, wTok);
    dMine.body.disputes?.length >= 1
      ? pass(`/mine → ${dMine.body.disputes.length}`)
      : fail('mine', JSON.stringify(dMine.body));

    // Owner sees their camp's
    const dOwner = await req('GET', '/disputes/owner', null, realOTok);
    dOwner.body.disputes?.length >= 1
      ? pass(`/owner → ${dOwner.body.disputes.length}`)
      : fail('owner', JSON.stringify(dOwner.body));

    // Owner responds
    const dResp = await req('PUT', `/disputes/${d1.body.dispute.id}/respond`,
      { response: 'The photos accurately represent the room. We can offer a discount.' }, realOTok);
    dResp.body.ok ? pass('owner responds')
                  : fail('respond', JSON.stringify(dResp.body));

    // Admin resolves with refund
    const dRes = await req('PUT', `/disputes/${d1.body.dispute.id}/resolve`, {
      decision: 'Refund SAR 200 in worker favor.', refund_amount: 200,
    }, aTok);
    dRes.body.ok ? pass('admin resolves with refund')
                 : fail('resolve', JSON.stringify(dRes.body));

    // Escalate
    const d2 = await req('POST', '/disputes', {
      booking_id: workerBookingId, subject: 'Still unhappy', description: 'Resolution insufficient',
    }, wTok);
    if (d2.body.dispute?.id) {
      const esc = await req('PUT', `/disputes/${d2.body.dispute.id}/escalate`,
        { reason: 'No response' }, wTok);
      esc.body.ok ? pass('escalate ok')
                  : fail('escalate', JSON.stringify(esc.body));
    }

    // ═══════════════════════════════════════════════════
    // H9: CALENDARS
    // ═══════════════════════════════════════════════════
    console.log('\n== H9 CALENDARS ==');
    const wCal = await req('GET', '/worker/calendar?month=2026-06', null, wTok);
    Array.isArray(wCal.body.bookings)
      ? pass(`worker calendar: ${wCal.body.bookings.length} bookings in June 2026`)
      : fail('worker calendar', JSON.stringify(wCal.body));

    const oCal = await req('GET', `/owner/calendar?camp_id=${workerCampId}&month=2026-06`, null, realOTok);
    if (Array.isArray(oCal.body.days) && oCal.body.days.length === 30 && oCal.body.capacity > 0) {
      pass(`owner calendar: 30 days, capacity ${oCal.body.capacity}, ${oCal.body.bookings?.length || 0} bookings`);
    } else fail('owner calendar', JSON.stringify(oCal.body).slice(0, 200));

    // Room availability
    const rAv = await req('GET', '/rooms/1/availability?month=2026-06');
    Array.isArray(rAv.body.days) && rAv.body.capacity > 0
      ? pass(`room 1 availability: 30 days, capacity ${rAv.body.capacity}`)
      : fail('room availability', JSON.stringify(rAv.body));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 20 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
