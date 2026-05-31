#!/usr/bin/env node
/**
 * Piece 18 tests: D1 housekeeping, D2 visitors, D3 staff, D4 expiry alerts, D6 payroll.
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
  // Clean any pre-existing v2 rows
  for (const t of ['housekeeping_tasks', 'housekeeping_schedules', 'visitor_logs',
                   'staff_attendance', 'staff_shifts', 'payroll_records', 'camp_staff']) {
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
    // Find a camp the test-owner actually owns (use the first one)
    const { rows: ownerOf1 } = await db.query(
      `SELECT u.email FROM camps c JOIN users u ON u.id=c.owner_id WHERE c.id=1 LIMIT 1`, []
    );
    const ownerEmail = ownerOf1[0]?.email || 'owner@riyadhcamps.sa';
    const CAMP_ID = 1;
    const ROOM_ID = 1;

    const oLog = await req('POST', '/auth/login', { email: ownerEmail, password: 'Owner@123' });
    const wLog = await req('POST', '/auth/login', { email: 'worker@email.com', password: 'Worker@123' });
    const aLog = await req('POST', '/auth/login', { email: 'admin@laborstay.sa', password: 'Admin@123' });
    const oTok = oLog.body.token, wTok = wLog.body.token, aTok = aLog.body.token;
    if (!oTok || !wTok || !aTok) throw new Error('login failed');
    pass(`logins ok (owner=${ownerEmail})`);

    // ═══════════════════════════════════════════════════
    // D1: HOUSEKEEPING
    // ═══════════════════════════════════════════════════
    console.log('\n== D1 HOUSEKEEPING ==');
    const today = new Date().toISOString().slice(0, 10);
    const tom   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Create task
    const t1 = await req('POST', '/housekeeping/tasks', {
      camp_id: CAMP_ID, room_id: ROOM_ID, task_type: 'cleaning',
      scheduled_date: today, scheduled_time: '10:00', notes: 'Daily cleaning',
    }, oTok);
    t1.body.task?.id ? pass(`POST cleaning task (id=${t1.body.task.id})`)
                     : fail('create task', JSON.stringify(t1.body));

    // Other-camp owner cannot create
    const tHack = await req('POST', '/housekeeping/tasks', {
      camp_id: 999, task_type: 'cleaning', scheduled_date: today,
    }, oTok);
    [403, 404].includes(tHack.status) ? pass('camp ownership enforced')
                                       : fail('camp guard', `status ${tHack.status}`);

    // List + summary
    const t2 = await req('POST', '/housekeeping/tasks', {
      camp_id: CAMP_ID, task_type: 'laundry', scheduled_date: tom,
    }, oTok);
    const list = await req('GET', `/housekeeping/tasks/camp/${CAMP_ID}`, null, oTok);
    list.body.tasks?.length === 2 && list.body.summary?.total === 2
      ? pass(`list tasks → ${list.body.tasks.length}, summary completion: ${list.body.summary.completion_pct}%`)
      : fail('list tasks', JSON.stringify(list.body.summary));

    // Update status to done
    const upd = await req('PUT', `/housekeeping/tasks/${t1.body.task.id}`,
      { status: 'done', notes: 'Cleaned successfully' }, oTok);
    upd.body.task?.status === 'done' && upd.body.task.completed_at
      ? pass('mark task done sets completed_at')
      : fail('update task', JSON.stringify(upd.body));

    // Schedule + auto-generate
    const sch = await req('POST', '/housekeeping/schedules', {
      camp_id: CAMP_ID, room_id: ROOM_ID, task_type: 'cleaning', frequency: 'daily',
      time_of_day: '09:00',
    }, oTok);
    sch.body.schedule?.id ? pass(`POST schedule (id=${sch.body.schedule.id}, daily)`)
                          : fail('create schedule', JSON.stringify(sch.body));

    const gen = await req('POST', `/housekeeping/schedules/${sch.body.schedule.id}/generate`,
      { horizon_days: 7 }, oTok);
    gen.body.ok && gen.body.created >= 6  // today already exists from t1, so 7 days = 6 new at most
      ? pass(`generate created ${gen.body.created} new tasks over 7 days`)
      : fail('generate tasks', JSON.stringify(gen.body));

    // Weekly schedule with days_of_week + invalid day filtered
    const schW = await req('POST', '/housekeeping/schedules', {
      camp_id: CAMP_ID, task_type: 'inspection', frequency: 'weekly',
      days_of_week: ['mon', 'thu', 'INVALID'],
    }, oTok);
    schW.body.schedule?.days_of_week?.length === 2
      ? pass(`weekly schedule normalizes days (2 valid out of 3)`)
      : fail('days normalization', JSON.stringify(schW.body.schedule?.days_of_week));

    // Report
    const rpt = await req('GET', `/housekeeping/reports/camp/${CAMP_ID}`, null, oTok);
    Array.isArray(rpt.body.by_type) && rpt.body.by_type.length >= 1
      ? pass(`report by type: ${rpt.body.by_type.length} types`)
      : fail('report', JSON.stringify(rpt.body));

    // Delete
    const del = await req('DELETE', `/housekeeping/tasks/${t2.body.task.id}`, null, oTok);
    del.body.ok ? pass('DELETE task') : fail('delete task', JSON.stringify(del.body));

    // ═══════════════════════════════════════════════════
    // D2: VISITORS
    // ═══════════════════════════════════════════════════
    console.log('\n== D2 VISITORS ==');
    const v1 = await req('POST', '/visitors/log', {
      camp_id: CAMP_ID, visitor_name: 'Mohammed Visitor',
      visitor_id_number: '1234567890', visitor_phone: '+966500000001',
      host_worker_id: 10, host_room: 'Room A12', purpose: 'Family visit',
      vehicle_plate: 'ABC-9999',
    }, oTok);
    v1.body.log?.id && v1.body.log.entry_time
      ? pass(`visitor entry logged (id=${v1.body.log.id})`)
      : fail('visitor entry', JSON.stringify(v1.body));

    // Active list
    const v2 = await req('POST', '/visitors/log', {
      camp_id: CAMP_ID, visitor_name: 'Friend Two', purpose: 'Meeting',
    }, oTok);
    const active = await req('GET', `/visitors/active/camp/${CAMP_ID}`, null, oTok);
    active.body.count === 2 ? pass(`active = ${active.body.count}`)
                            : fail('active list', JSON.stringify(active.body));

    // Mark exit
    const ex1 = await req('PUT', `/visitors/log/${v1.body.log.id}/exit`, {}, oTok);
    ex1.body.ok ? pass('mark exit')
                : fail('exit', JSON.stringify(ex1.body));
    const active2 = await req('GET', `/visitors/active/camp/${CAMP_ID}`, null, oTok);
    active2.body.count === 1 ? pass(`active after exit = 1`)
                              : fail('active reduced', JSON.stringify(active2.body));

    // Search by name
    const search = await req('GET', `/visitors/log/camp/${CAMP_ID}?q=mohammed`, null, oTok);
    search.body.logs?.some((l) => l.visitor_name.toLowerCase().includes('mohammed'))
      ? pass(`search by name works`)
      : fail('search', JSON.stringify(search.body));

    // Reports
    const vRpt = await req('GET', `/visitors/reports/camp/${CAMP_ID}`, null, oTok);
    vRpt.body.total_visits >= 2 ? pass(`visitor report total: ${vRpt.body.total_visits}`)
                                : fail('visitor report', JSON.stringify(vRpt.body));

    // ═══════════════════════════════════════════════════
    // D3: STAFF
    // ═══════════════════════════════════════════════════
    console.log('\n== D3 STAFF ==');
    // Create staff
    const expiringSoon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const s1 = await req('POST', '/staff', {
      camp_id: CAMP_ID, full_name: 'Aamir Cleaner', role: 'cleaner',
      phone: '+966500000010', iqama_number: '9999999999', iqama_expiry: expiringSoon,
      nationality: 'Pakistani', salary: 2500,
    }, oTok);
    s1.body.staff?.id ? pass(`POST staff (id=${s1.body.staff.id})`)
                      : fail('create staff', JSON.stringify(s1.body));

    // Validation: bad role
    const sBad = await req('POST', '/staff', {
      camp_id: CAMP_ID, full_name: 'X', role: 'ninja',
    }, oTok);
    sBad.status === 400 ? pass('invalid role rejected')
                        : fail('role validation', `status ${sBad.status}`);

    // List with expiry alerts
    const sList = await req('GET', `/staff/camp/${CAMP_ID}`, null, oTok);
    const our = sList.body.staff?.find((s) => s.id === s1.body.staff.id);
    our?.expiry_alerts?.length >= 1
      ? pass(`staff list shows expiry alerts (${our.expiry_alerts[0].status} in ${our.expiry_alerts[0].days_remaining}d)`)
      : fail('expiry alerts', JSON.stringify(our?.expiry_alerts));

    // Update
    const sUpd = await req('PUT', `/staff/${s1.body.staff.id}`, { salary: 2800 }, oTok);
    parseFloat(sUpd.body.staff?.salary) === 2800
      ? pass(`PUT staff salary → ${sUpd.body.staff.salary}`)
      : fail('update staff', JSON.stringify(sUpd.body));

    // Attendance
    const att = await req('POST', '/staff/attendance', {
      staff_id: s1.body.staff.id, date: today,
      check_in_time: '08:00', check_out_time: '17:00', hours_worked: 9, status: 'present',
    }, oTok);
    att.body.attendance?.id ? pass('record attendance')
                            : fail('attendance', JSON.stringify(att.body));

    // Upsert (same date → updates)
    const attUp = await req('POST', '/staff/attendance', {
      staff_id: s1.body.staff.id, date: today, status: 'late',
    }, oTok);
    attUp.body.updated ? pass('attendance upsert (status changed to late)')
                       : fail('attendance upsert', JSON.stringify(attUp.body));

    // Staff attendance summary
    const attRpt = await req('GET', `/staff/${s1.body.staff.id}/attendance`, null, oTok);
    attRpt.body.summary?.total >= 1 ? pass(`attendance summary: ${attRpt.body.summary.total} entries, ${attRpt.body.summary.total_hours}h`)
                                    : fail('attendance summary', JSON.stringify(attRpt.body.summary));

    // Shifts
    const sh1 = await req('POST', '/staff/shifts', {
      camp_id: CAMP_ID, staff_id: s1.body.staff.id, shift_name: 'Morning',
      start_time: '06:00', end_time: '14:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    }, oTok);
    sh1.body.shift?.days?.length === 5
      ? pass(`shift created, 5 days`)
      : fail('shift', JSON.stringify(sh1.body));

    const shList = await req('GET', `/staff/shifts/camp/${CAMP_ID}`, null, oTok);
    shList.body.shifts?.length >= 1 ? pass(`shifts list → ${shList.body.shifts.length}`)
                                    : fail('shifts list', JSON.stringify(shList.body));

    // Soft delete (has attendance)
    const sDel = await req('DELETE', `/staff/${s1.body.staff.id}`, null, oTok);
    sDel.body.soft === true ? pass('staff with attendance soft-deleted')
                            : fail('soft delete', JSON.stringify(sDel.body));

    // ═══════════════════════════════════════════════════
    // D4: EXPIRY ALERTS
    // ═══════════════════════════════════════════════════
    console.log('\n== D4 EXPIRY ALERTS ==');
    // Create a new staff with expiring documents (since previous one is now inactive)
    const s2 = await req('POST', '/staff', {
      camp_id: CAMP_ID, full_name: 'About-to-Expire Person', role: 'security',
      iqama_number: '8888888888', iqama_expiry: expiringSoon,
      passport_number: 'P12345', passport_expiry: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    }, oTok);
    s2.body.staff?.id ? pass(`created s2 with expiring docs (id=${s2.body.staff.id})`)
                      : fail('s2 setup', JSON.stringify(s2.body));

    // Admin gets all alerts
    const aAlerts = await req('GET', '/admin/expiry-alerts?days=60', null, aTok);
    aAlerts.body.summary && aAlerts.body.alerts
      ? pass(`admin alerts: total=${aAlerts.body.summary.total} (urgent=${aAlerts.body.summary.urgent}, soon=${aAlerts.body.summary.soon})`)
      : fail('admin alerts', JSON.stringify(aAlerts.body));

    // Owner gets their camp's alerts
    const oAlerts = await req('GET', `/owner/expiry-alerts/camp/${CAMP_ID}?days=60`, null, oTok);
    oAlerts.body.alerts?.length >= 1
      ? pass(`owner camp alerts: ${oAlerts.body.alerts.length} alerts`)
      : fail('owner alerts', JSON.stringify(oAlerts.body));

    // Worker blocked from admin endpoint
    const wAlerts = await req('GET', '/admin/expiry-alerts', null, wTok);
    wAlerts.status === 403 ? pass('worker blocked from /admin/expiry-alerts')
                           : fail('alerts auth', `status ${wAlerts.status}`);

    // ═══════════════════════════════════════════════════
    // D6: PAYROLL
    // ═══════════════════════════════════════════════════
    console.log('\n== D6 PAYROLL ==');
    // Add payroll for s2
    const pay1 = await req('POST', '/payroll/records', {
      staff_id: s2.body.staff.id, month: 5, year: 2026,
      basic_salary: 3000, allowances: 500, deductions: 100, accommodation_deduction: 200,
    }, oTok);
    pay1.body.record?.id && pay1.body.record.net_salary === 3200
      ? pass(`POST payroll (basic 3000 + 500 - 100 - 200 = ${pay1.body.record.net_salary})`)
      : fail('create payroll', JSON.stringify(pay1.body));

    // Duplicate month → 409
    const payDup = await req('POST', '/payroll/records', {
      staff_id: s2.body.staff.id, month: 5, year: 2026, basic_salary: 1000,
    }, oTok);
    payDup.status === 409 ? pass('duplicate month rejected (409)')
                          : fail('payroll dup', JSON.stringify(payDup.body));

    // List by camp
    const payList = await req('GET', `/payroll/records/camp/${CAMP_ID}`, null, oTok);
    payList.body.records?.length >= 1 && payList.body.totals?.net >= 3200
      ? pass(`payroll list: ${payList.body.records.length} records, total net SAR ${payList.body.totals.net}`)
      : fail('payroll list', JSON.stringify(payList.body));

    // Add deduction
    const ded = await req('POST', '/payroll/deductions', {
      record_id: pay1.body.record.id, amount: 50, reason: 'Late fine',
    }, oTok);
    ded.body.new_net === 3150
      ? pass(`add deduction: new net SAR ${ded.body.new_net}`)
      : fail('add deduction', JSON.stringify(ded.body));

    // Update record
    const payUpd = await req('PUT', `/payroll/records/${pay1.body.record.id}`,
      { allowances: 800 }, oTok);
    payUpd.body.record?.net_salary === 3450  // 3000 + 800 - 150 (100+50) - 200 = 3450
      ? pass(`update allowances → new net SAR ${payUpd.body.record.net_salary}`)
      : fail('update payroll', JSON.stringify(payUpd.body));

    // Mark paid
    const paid = await req('PUT', `/payroll/records/${pay1.body.record.id}/pay`, {}, oTok);
    paid.body.ok ? pass(`mark paid (${paid.body.payment_date})`)
                 : fail('mark paid', JSON.stringify(paid.body));

    // Cannot edit paid record (owner)
    const editPaid = await req('PUT', `/payroll/records/${pay1.body.record.id}`,
      { allowances: 1000 }, oTok);
    editPaid.status === 400 ? pass('cannot edit paid record (owner)')
                             : fail('edit paid guard', JSON.stringify(editPaid.body));

    // Report
    const payRpt = await req('GET', `/payroll/reports/camp/${CAMP_ID}`, null, oTok);
    payRpt.body.months?.length >= 1 ? pass(`monthly report: ${payRpt.body.months.length} months`)
                                    : fail('payroll report', JSON.stringify(payRpt.body));

    console.log('\n');
    if (FAIL === 0) console.log('🎉 ALL PIECE 18 TESTS PASSED');
    else console.log(`❌ ${FAIL} test(s) failed`);
  } catch (e) {
    console.error('Test runner crashed:', e);
    FAIL++;
  } finally {
    srv.kill();
    setTimeout(() => process.exit(FAIL ? 1 : 0), 500);
  }
})();
