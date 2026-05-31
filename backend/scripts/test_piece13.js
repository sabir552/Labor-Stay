#!/usr/bin/env node
/**
 * Piece 13 self-contained test runner. Spawns the API server, exercises
 * every new endpoint, then shuts down. Designed to be re-runnable.
 *
 * Run:  node scripts/test_piece13.js   (from backend/)
 */
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const BASE = 'http://localhost:5000/api';
const speakeasy = require('speakeasy');

function pass(name) { console.log(`  ✅ ${name}`); }
function fail(name, why) { console.log(`  ❌ ${name}: ${why}`); FAIL++; }
let FAIL = 0;

async function req(method, path_, body, token) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path_);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(buf); } catch { parsed = buf; }
        resolve({ status: res.statusCode, body: parsed, raw: buf, headers: res.headers });
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
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

async function resetSecurityState() {
  const db = require('../config/database');
  await db.query('DELETE FROM ip_blocks', []);
  await db.query('DELETE FROM user_2fa', []);
  await db.query('DELETE FROM sessions', []);
  await db.query('DELETE FROM deletion_requests', []);
}

(async () => {
  console.log('▶ Resetting security state...');
  await resetSecurityState();

  console.log('▶ Starting server...');
  const srv = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LABORSTAY_DISABLE_CRON: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  srv.stdout.on('data', (b) => process.env.VERBOSE && process.stdout.write('[srv] ' + b));
  srv.stderr.on('data', (b) => process.stderr.write('[srv-err] ' + b));
  const ready = await waitForServer();
  if (!ready) { console.error('Server did not start'); srv.kill(); process.exit(1); }

  try {
    // ─── I2: HEALTH ────────────────────────────────────────────────
    console.log('\n== I2 HEALTH ==');
    const h = await req('GET', '/health');
    h.body.version === '2.0.0' ? pass('GET /health → version 2.0.0') : fail('health version', JSON.stringify(h.body));

    // ─── Login as admin & worker ───────────────────────────────────
    const aLogin = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const adminTok = aLogin.body?.token;
    adminTok ? pass('admin login') : fail('admin login', JSON.stringify(aLogin.body));

    const wLogin = await req('POST', '/auth/login', { email: 'worker@email.com', password: 'Worker@123' });
    const workerTok = wLogin.body?.token;
    workerTok ? pass('worker login') : fail('worker login', JSON.stringify(wLogin.body));

    // ─── I2 detailed health (admin-only) ──────────────────────────
    const hd = await req('GET', '/health/detailed', null, adminTok);
    hd.body.database === 'connected' ? pass('GET /health/detailed (admin)') : fail('health detailed', JSON.stringify(hd.body));

    // Non-admin should be blocked
    const hd2 = await req('GET', '/health/detailed', null, workerTok);
    hd2.status === 403 ? pass('GET /health/detailed (worker) → 403') : fail('health detailed access', `status ${hd2.status}`);

    // ─── F1: 2FA ───────────────────────────────────────────────────
    console.log('\n== F1 2FA ==');
    const status0 = await req('GET', '/auth/2fa/status', null, workerTok);
    status0.body.enabled === false ? pass('/2fa/status initially disabled') : fail('2fa status', JSON.stringify(status0.body));

    const setup = await req('POST', '/auth/2fa/setup', {}, workerTok);
    const secret = setup.body?.secret;
    secret && setup.body.otpauth_url ? pass('/2fa/setup returns secret + otpauth') : fail('2fa setup', JSON.stringify(setup.body));

    const totp = speakeasy.totp({ secret, encoding: 'base32' });
    const enable = await req('POST', '/auth/2fa/enable', { token: totp }, workerTok);
    const backupCodes = enable.body?.backup_codes;
    enable.body.ok && backupCodes?.length === 8
      ? pass('/2fa/enable → ok + 8 backup codes')
      : fail('2fa enable', JSON.stringify(enable.body));

    // Login WITHOUT 2FA → requires_2fa
    const loginNo2fa = await req('POST', '/auth/login', { email: 'worker@email.com', password: 'Worker@123' });
    loginNo2fa.body.requires_2fa === true && !loginNo2fa.body.token
      ? pass('login w/o 2FA → requires_2fa')
      : fail('login w/o 2FA', JSON.stringify(loginNo2fa.body));

    // Login WITH valid TOTP
    const totp2 = speakeasy.totp({ secret, encoding: 'base32' });
    const loginTotp = await req('POST', '/auth/login', {
      email: 'worker@email.com', password: 'Worker@123', twofa_token: totp2,
    });
    loginTotp.body.token
      ? pass('login w/ TOTP → token issued')
      : fail('login w/ TOTP', JSON.stringify(loginTotp.body));

    // Login with WRONG 2FA token (not 000000)
    const loginBad = await req('POST', '/auth/login', {
      email: 'worker@email.com', password: 'Worker@123', twofa_token: '111111',
    });
    loginBad.body.error === 'Invalid 2FA code'
      ? pass('login w/ bad 2FA → Invalid 2FA code')
      : fail('login bad 2FA', JSON.stringify(loginBad.body));

    // Backup code login
    const loginBackup = await req('POST', '/auth/login', {
      email: 'worker@email.com', password: 'Worker@123', twofa_token: backupCodes[0],
    });
    loginBackup.body.token
      ? pass('login w/ backup code → token issued')
      : fail('login w/ backup', JSON.stringify(loginBackup.body));

    // Reuse same backup code (should fail because consumed)
    const reuse = await req('POST', '/auth/login', {
      email: 'worker@email.com', password: 'Worker@123', twofa_token: backupCodes[0],
    });
    reuse.body.error === 'Invalid 2FA code'
      ? pass('backup code reuse → rejected (one-time)')
      : fail('backup reuse', JSON.stringify(reuse.body));

    // ─── F2: SESSIONS ──────────────────────────────────────────────
    console.log('\n== F2 SESSIONS ==');
    // Get a fresh token via TOTP for this test
    const sTotp = speakeasy.totp({ secret, encoding: 'base32' });
    const sLogin = await req('POST', '/auth/login', {
      email: 'worker@email.com', password: 'Worker@123', twofa_token: sTotp,
    });
    const sTok = sLogin.body.token;
    const ses = await req('GET', '/auth/sessions', null, sTok);
    ses.body.sessions?.length >= 1
      ? pass(`/auth/sessions → ${ses.body.sessions.length} active`)
      : fail('list sessions', JSON.stringify(ses.body));

    // ─── F3: IP BLOCKING ──────────────────────────────────────────
    console.log('\n== F3 IP BLOCKING ==');
    // Reset both ip_blocks and the in-process counter by restarting.
    // (Skip restart — just exhaust 5 attempts within the existing limiter budget.)
    // First reset DB-side
    const db = require('../config/database');
    await db.query('DELETE FROM ip_blocks', []);
    let lastBlocked = null;
    for (let i = 1; i <= 6; i++) {
      const r = await req('POST', '/auth/login', { email: 'nobody@x.com', password: 'wrong' });
      if (r.body.blocked_until) lastBlocked = r;
    }
    lastBlocked && /Too many failed attempts/.test(lastBlocked.body.error || '')
      ? pass(`brute-force protection: blocked after 5 attempts`)
      : fail('brute-force', JSON.stringify(lastBlocked?.body || 'no-block'));

    // Admin should see the block
    const blockedList = await req('GET', '/admin/security/blocked-ips', null, adminTok);
    blockedList.body.blocked?.length >= 1
      ? pass(`/admin/security/blocked-ips → ${blockedList.body.blocked.length} entry`)
      : fail('blocked-ips list', JSON.stringify(blockedList.body));

    // Unblock
    const ipToUnblock = blockedList.body.blocked[0].ip_address;
    const unblock = await req('DELETE', `/admin/security/blocked-ips/${encodeURIComponent(ipToUnblock)}`, null, adminTok);
    unblock.body.ok ? pass(`unblock ${ipToUnblock}`) : fail('unblock', JSON.stringify(unblock.body));

    // ─── F7: PDPL ──────────────────────────────────────────────────
    console.log('\n== F7 PDPL ==');
    const exp = await req('GET', '/users/me/export-data', null, sTok);
    exp.status === 200 && exp.body.pdpl_notice && exp.body.user?.length === 1
      ? pass('GET /users/me/export-data')
      : fail('PDPL export', JSON.stringify(exp.body).slice(0, 200));

    const del = await req('POST', '/users/me/delete-account', { password: 'Worker@123', reason: 'test' }, sTok);
    del.body.request?.id
      ? pass('POST /users/me/delete-account')
      : fail('PDPL deletion request', JSON.stringify(del.body));

    const adminList = await req('GET', '/admin/deletion-requests', null, adminTok);
    adminList.body.requests?.length >= 1
      ? pass(`/admin/deletion-requests → ${adminList.body.requests.length}`)
      : fail('admin deletion list', JSON.stringify(adminList.body));

    // Reject the deletion (so worker stays functional for other tests)
    const reject = await req('PUT',
      `/admin/deletion-requests/${adminList.body.requests[0].id}/process`,
      { action: 'reject' }, adminTok);
    reject.body.ok ? pass('admin rejects deletion request') : fail('reject', JSON.stringify(reject.body));

    // ─── I4: CSV EXPORTS ──────────────────────────────────────────
    console.log('\n== I4 CSV EXPORTS ==');
    for (const what of ['bookings', 'users', 'revenue', 'payments', 'camps', 'service-requests']) {
      const r = await req('GET', `/admin/export/${what}?format=csv`, null, adminTok);
      const ct = r.headers?.['content-type'] || '';
      const lines = (r.raw || '').split('\n').filter(Boolean).length;
      ct.includes('text/csv') && lines >= 1
        ? pass(`/admin/export/${what}?format=csv → ${lines} rows`)
        : fail(`export ${what}`, `ct=${ct} lines=${lines}`);
    }

    // ─── Admin security 2FA-status ────────────────────────────────
    console.log('\n== ADMIN SECURITY ==');
    const tfaStat = await req('GET', '/admin/security/2fa-status', null, adminTok);
    Array.isArray(tfaStat.body.by_role) && tfaStat.body.by_role.length >= 3
      ? pass('/admin/security/2fa-status returns by-role breakdown')
      : fail('2fa-status', JSON.stringify(tfaStat.body));

    // ─── CRON JOBS (manual invoke) ────────────────────────────────
    console.log('\n== CRON JOBS ==');
    const sched = require('../utils/scheduler');
    const c1 = await sched.autoCancelStaleBookings();
    const c2 = await sched.processWaitingList();
    const c3 = await sched.iqamaExpiryAlerts();
    const c4 = await sched.postCheckoutSurveys();
    pass(`autoCancelStaleBookings → ${c1}`);
    pass(`processWaitingList → ${c2}`);
    pass(`iqamaExpiryAlerts → ${c3}`);
    pass(`postCheckoutSurveys → ${c4}`);

    // ─── /api/health version bump ──────────────────────────────────
    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 13 TESTS PASSED');
    else            console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
