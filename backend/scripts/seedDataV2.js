#!/usr/bin/env node
/**
 * v2 demo seed — runs AFTER scripts/seedData.js. Adds:
 *   - Loyalty points + referral codes for workers
 *   - Sample housekeeping schedules + tasks
 *   - Sample visitor logs
 *   - Sample camp staff with expiring docs (showcases D4 alerts)
 *   - Sample utility readings
 *   - Sample worker service requests
 *   - Sample CCTV cameras + access cards
 *   - A corporate account with bulk booking + invoice
 *   - A maintenance request
 *
 * Idempotent: skips inserts when target rows already exist.
 */
require('dotenv').config();
const db = require('../config/database');

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const isoDate = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10);

async function tableExists(name) {
  try {
    await db.query(`SELECT 1 FROM ${name} LIMIT 0`, []);
    return true;
  } catch { return false; }
}

async function count(table, where = '1=1', params = []) {
  try {
    const { rows } = await db.query(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, params);
    return parseInt(rows[0].c || rows[0].C || 0, 10);
  } catch { return 0; }
}

async function main() {
  console.log('▶ Seeding v2 demo data...');
  console.log(`  driver: ${db.driver}`);

  // ============ REFERRAL CODES + LOYALTY POINTS ============
  if (await tableExists('loyalty_points')) {
    const { rows: workers } = await db.query(
      "SELECT id, email FROM users WHERE role='worker' AND (referral_code IS NULL OR referral_code = '') ORDER BY id LIMIT 20", []
    );
    const crypto = require('crypto');
    let codesAssigned = 0;
    for (const w of workers) {
      const seed = (w.email || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4) || 'USER';
      const code = (seed + crypto.randomBytes(2).toString('hex').toUpperCase()).slice(0, 8);
      try {
        await db.query('UPDATE users SET referral_code=$1 WHERE id=$2', [code, w.id]);
        codesAssigned++;
      } catch {}
    }
    console.log(`  ✓ ${codesAssigned} referral codes assigned`);

    // Sprinkle loyalty points: main worker gets gold tier (2500 pts), 5 others get silver, rest bronze
    const { rows: mainWorker } = await db.query(`SELECT id FROM users WHERE email='worker@email.com'`, []);
    if (mainWorker[0] && (await count('loyalty_points', 'user_id=$1', [mainWorker[0].id])) === 0) {
      const pts = [
        [200, 'earned', 'Earned from camp booking'],
        [50,  'bonus',  'First booking bonus'],
        [25,  'bonus',  'Review reward'],
        [800, 'earned', 'Earned from extended stay'],
        [500, 'bonus',  'Referral reward × 1'],
        [925, 'earned', 'Earned from multiple bookings'],
      ];
      for (const [p, t, d] of pts) {
        await db.query(
          `INSERT INTO loyalty_points (user_id, points, transaction_type, description) VALUES ($1,$2,$3,$4)`,
          [mainWorker[0].id, p, t, d]
        );
      }
    }

    // 5 silver workers
    const { rows: silverWorkers } = await db.query(
      `SELECT id FROM users WHERE role='worker' AND id != $1 ORDER BY id LIMIT 5`, [mainWorker[0]?.id || 0]
    );
    for (const sw of silverWorkers) {
      if ((await count('loyalty_points', 'user_id=$1', [sw.id])) === 0) {
        await db.query(
          `INSERT INTO loyalty_points (user_id, points, transaction_type, description)
           VALUES ($1, $2, 'earned', 'Earned from bookings')`,
          [sw.id, 500 + rndInt(0, 800)]
        );
      }
    }
    console.log(`  ✓ loyalty points seeded`);
  }

  // ============ MAIN WORKER → REFERRED 2 PEOPLE ============
  if (await tableExists('referrals')) {
    const { rows: mw } = await db.query(`SELECT id, referral_code FROM users WHERE email='worker@email.com'`, []);
    if (mw[0]?.referral_code && (await count('referrals', 'referrer_id=$1', [mw[0].id])) === 0) {
      const { rows: refs } = await db.query(
        `SELECT id FROM users WHERE role='worker' AND id != $1 AND referred_by_code IS NULL ORDER BY id LIMIT 2`,
        [mw[0].id]
      );
      let n = 0;
      for (const r of refs) {
        await db.query(
          `INSERT INTO referrals (referrer_id, referred_id, referral_code, status, reward_amount, reward_credited)
           VALUES ($1, $2, $3, $4, 50, $5)`,
          [mw[0].id, r.id, mw[0].referral_code, n === 0 ? 'rewarded' : 'pending', n === 0 ? 1 : 0]
        );
        await db.query(`UPDATE users SET referred_by_code=$1 WHERE id=$2`, [mw[0].referral_code, r.id]);
        n++;
      }
      console.log(`  ✓ ${n} referral records`);
    }
  }

  // ============ HOUSEKEEPING ============
  if (await tableExists('housekeeping_tasks') && (await count('housekeeping_tasks')) === 0) {
    const { rows: camps } = await db.query("SELECT id FROM camps WHERE status='approved' ORDER BY id LIMIT 5", []);
    let tasks = 0;
    for (const c of camps) {
      // 1 weekly cleaning schedule + 3 sample tasks
      await db.query(
        `INSERT INTO housekeeping_schedules (camp_id, frequency, days_of_week, time_of_day, task_type, is_active)
         VALUES ($1, 'weekly', $2, '09:00', 'cleaning', 1)`,
        [c.id, JSON.stringify(['mon', 'wed', 'fri'])]
      );
      for (let i = -2; i <= 0; i++) {
        await db.query(
          `INSERT INTO housekeeping_tasks (camp_id, task_type, scheduled_date, scheduled_time, status, notes)
           VALUES ($1, $2, $3, '10:00', $4, 'Demo task')`,
          [c.id, rnd(['cleaning', 'laundry', 'inspection']), isoDate(i),
           i < 0 ? 'done' : 'pending']
        );
        tasks++;
      }
    }
    console.log(`  ✓ ${tasks} housekeeping tasks + ${camps.length} schedules`);
  }

  // ============ VISITOR LOGS ============
  if (await tableExists('visitor_logs') && (await count('visitor_logs')) === 0) {
    const { rows: camps } = await db.query("SELECT id FROM camps WHERE status='approved' ORDER BY id LIMIT 3", []);
    const visitors = [
      ['Ahmed Family Member', '1098765432', '+966512345678', 'Family visit', 'A12'],
      ['Khalid Contractor', '2087654321', '+966523456789', 'Maintenance check', null],
      ['Sara Driver', '3076543210', '+966534567890', 'Delivery', null],
    ];
    let n = 0;
    for (const c of camps) {
      for (const v of visitors) {
        await db.query(
          `INSERT INTO visitor_logs (camp_id, visitor_name, visitor_id_number, visitor_phone,
                                      host_room, purpose, entry_time, exit_time, approved_by)
           VALUES ($1,$2,$3,$4,$5,$6, datetime('now','-' || $7 || ' hours'), $8, 1)`,
          [c.id, v[0], v[1], v[2], v[4], v[3], rndInt(1, 24),
           Math.random() > 0.4 ? new Date(Date.now() - rndInt(1, 12) * 3600000).toISOString() : null]
        ).catch(async () => {
          // Postgres alt syntax fallback
          await db.query(
            `INSERT INTO visitor_logs (camp_id, visitor_name, visitor_id_number, visitor_phone,
                                        host_room, purpose, entry_time, approved_by)
             VALUES ($1,$2,$3,$4,$5,$6, CURRENT_TIMESTAMP, 1)`,
            [c.id, v[0], v[1], v[2], v[4], v[3]]
          );
        });
        n++;
      }
    }
    console.log(`  ✓ ${n} visitor logs`);
  }

  // ============ CAMP STAFF (with expiring docs to showcase D4) ============
  if (await tableExists('camp_staff') && (await count('camp_staff')) === 0) {
    const { rows: camps } = await db.query("SELECT id FROM camps WHERE status='approved' ORDER BY id LIMIT 4", []);
    const staff = [
      { name: 'Bilal Hassan',  role: 'cleaner',     nat: 'Pakistani', expiry: isoDate(5) },     // urgent!
      { name: 'Imran Ahmad',   role: 'security',    nat: 'Pakistani', expiry: isoDate(25) },    // soon
      { name: 'Rajesh Kumar',  role: 'maintenance', nat: 'Indian',    expiry: isoDate(45) },    // upcoming
      { name: 'Mohammed Cook', role: 'cook',        nat: 'Egyptian',  expiry: isoDate(150) },   // safe
      { name: 'Driver Khan',   role: 'driver',      nat: 'Pakistani', expiry: isoDate(-10) },   // expired
    ];
    let n = 0;
    for (const c of camps) {
      for (const s of staff.slice(0, rndInt(2, 4))) {
        await db.query(
          `INSERT INTO camp_staff (camp_id, full_name, role, phone, nationality,
                                    iqama_number, iqama_expiry, salary, hire_date, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)`,
          [c.id, s.name, s.role, '+9665' + rndInt(10000000, 99999999),
           s.nat, String(2000000000 + rndInt(100000, 999999)), s.expiry,
           rndInt(1500, 4500), isoDate(-rndInt(30, 365))]
        );
        n++;
      }
    }
    console.log(`  ✓ ${n} camp staff (includes expired + expiring docs for D4 demo)`);
  }

  // ============ UTILITY READINGS ============
  if (await tableExists('utility_readings') && (await count('utility_readings')) === 0) {
    const { rows: camps } = await db.query("SELECT id FROM camps WHERE status='approved' ORDER BY id LIMIT 3", []);
    let n = 0;
    for (const c of camps) {
      let prev = 0;
      for (let m = 3; m >= 0; m--) {
        const cur = prev + rndInt(800, 1500);
        const consumption = cur - prev;
        const rate = 0.18;
        await db.query(
          `INSERT INTO utility_readings
             (camp_id, utility_type, meter_number, previous_reading, current_reading,
              consumption, unit, rate_per_unit, total_cost, reading_date, recorded_by)
           VALUES ($1,'electricity','MAIN',$2,$3,$4,'kWh',$5,$6,$7,1)`,
          [c.id, prev, cur, consumption, rate,
           Math.round(consumption * rate * 100) / 100, isoDate(-m * 30)]
        );
        prev = cur;
        n++;
      }
      // One water reading
      await db.query(
        `INSERT INTO utility_readings
           (camp_id, utility_type, previous_reading, current_reading, consumption,
            unit, rate_per_unit, total_cost, reading_date, recorded_by)
         VALUES ($1,'water',0,250,250,'m³',3.5,875,$2,1)`,
        [c.id, isoDate(0)]
      );
      n++;
    }
    console.log(`  ✓ ${n} utility readings`);
  }

  // ============ WORKER SERVICE REQUESTS ============
  if (await tableExists('worker_service_requests') && (await count('worker_service_requests')) === 0) {
    const { rows: workers } = await db.query(
      `SELECT u.id, b.camp_id, b.id AS booking_id
       FROM users u JOIN bookings b ON b.worker_id=u.id
       WHERE u.role='worker' AND b.status IN ('confirmed','checked_in','checked_out')
       ORDER BY u.id LIMIT 5`, []
    );
    const samples = [
      ['maintenance', 'AC not cooling', 'AC unit blows warm air since this morning', 'high'],
      ['cleaning', 'Need extra cleaning', 'Room needs deep cleaning after weekend', 'low'],
      ['laundry', 'Laundry pickup request', 'Have a bag of laundry ready', 'low'],
      ['catering', 'Vegetarian option needed', 'I follow a vegetarian diet, please accommodate', 'medium'],
      ['transportation', 'Site pickup tomorrow 7am', 'Need transport from camp to industrial zone', 'medium'],
    ];
    let n = 0;
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const s = samples[i % samples.length];
      await db.query(
        `INSERT INTO worker_service_requests
           (worker_id, camp_id, booking_id, request_type, title, description, priority, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [w.id, w.camp_id, w.booking_id, s[0], s[1], s[2], s[3],
         i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'in_progress' : 'resolved']
      );
      n++;
    }
    console.log(`  ✓ ${n} worker service requests`);
  }

  // ============ CORPORATE ACCOUNT + BULK BOOKING + INVOICE ============
  if (await tableExists('corporate_accounts') && (await count('corporate_accounts')) === 0) {
    const { rows: corp } = await db.query(
      `INSERT INTO corporate_accounts
         (company_name, cr_number, vat_number, contact_name, contact_email, contact_phone,
          credit_limit, current_balance, payment_terms, finance_email, is_active)
       VALUES ('Saudi Aramco Contractors','1010012345','300012345600003','Ahmad Manager',
               'finance@aramco-contractors.com','+966500000001',150000,135000,'net30',
               'finance@aramco-contractors.com',1) RETURNING id`, []
    );
    const corpId = corp[0].id;
    const { rows: camp1 } = await db.query("SELECT id FROM camps WHERE status='approved' LIMIT 1", []);
    if (camp1[0]) {
      await db.query(
        `INSERT INTO corporate_bookings (corporate_id, camp_id, num_beds, start_date, end_date, total_amount, status)
         VALUES ($1, $2, 25, $3, $4, 15000, 'confirmed')`,
        [corpId, camp1[0].id, isoDate(7), isoDate(37)]
      );
      const invoiceNumber = `CINV-${new Date().getFullYear()}-DEMO0001`;
      await db.query(
        `INSERT INTO corporate_invoices
           (corporate_id, invoice_number, month, year, total_amount, vat_amount, status, due_date)
         VALUES ($1, $2, $3, $4, 15000, 1956.52, 'sent', $5)`,
        [corpId, invoiceNumber,
         new Date().getMonth() + 1, new Date().getFullYear(), isoDate(30)]
      );
    }
    console.log(`  ✓ Saudi Aramco corporate account + 25-bed bulk booking + invoice`);
  }

  // ============ CCTV + ACCESS CARDS ============
  if (await tableExists('cctv_cameras') && (await count('cctv_cameras')) === 0) {
    const { rows: camps } = await db.query("SELECT id FROM camps WHERE status='approved' LIMIT 2", []);
    let n = 0;
    for (const c of camps) {
      for (const [name, loc] of [['Main Gate', 'Entrance'], ['Parking Area', 'East side'], ['Reception', 'Lobby']]) {
        await db.query(
          `INSERT INTO cctv_cameras (camp_id, camera_name, location_description, camera_type,
                                      manufacturer, model, ip_address, is_active)
           VALUES ($1,$2,$3,'ip','Hikvision','DS-2CD2T46G2',$4,1)`,
          [c.id, name, loc, '192.168.1.' + (10 + n)]
        );
        n++;
      }
    }
    console.log(`  ✓ ${n} CCTV cameras`);
  }

  // ============ MAINTENANCE REQUESTS (with photos) ============
  if (await tableExists('maintenance_requests') && (await count('maintenance_requests')) === 0) {
    const { rows: bk } = await db.query(
      `SELECT b.id, b.worker_id, b.camp_id, b.room_id FROM bookings b
       WHERE b.status IN ('confirmed','checked_in') ORDER BY b.id LIMIT 5`, []
    );
    let n = 0;
    const samples = [
      ['Leaking tap', 'The hot water tap in the bathroom drips constantly', 'medium'],
      ['Door lock broken', 'Lock is jammed, key does not turn', 'high'],
      ['No hot water', 'Water heater seems to be malfunctioning', 'high'],
      ['Light bulb out', 'Main ceiling light not working', 'low'],
      ['AC noisy', 'AC unit makes loud rattling noise at night', 'medium'],
    ];
    for (let i = 0; i < bk.length; i++) {
      const b = bk[i];
      const s = samples[i % samples.length];
      await db.query(
        `INSERT INTO maintenance_requests
           (camp_id, room_id, worker_id, title, description, priority, status, photo_urls)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [b.camp_id, b.room_id, b.worker_id, s[0], s[1], s[2],
         i === 0 ? 'open' : i === 1 ? 'assigned' : i === 2 ? 'in_progress' : 'resolved',
         JSON.stringify([])]
      );
      n++;
    }
    console.log(`  ✓ ${n} maintenance requests`);
  }

  // ============ ANNOUNCEMENTS ============
  if (await tableExists('announcements') && (await count('announcements')) === 0) {
    await db.query(
      `INSERT INTO announcements (title, body, audience, created_by) VALUES
       ('🎉 Welcome to LaborStay 2.0', 'New features: WhatsApp bot, loyalty points, multi-currency, and more!', 'all', 1),
       ('Ramadan special pricing', 'Special Ramadan rates available — check our featured camps for offers.', 'worker', 1)`,
      []
    );
    console.log(`  ✓ 2 announcements`);
  }

  await db.close();
  console.log('\n✅ v2 seed complete!\n');
}

main().catch((e) => { console.error('v2 seed failed:', e); process.exit(1); });
