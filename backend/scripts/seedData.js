#!/usr/bin/env node
/**
 * Seeds the LaborStay database with realistic demo data:
 *   • 1 admin
 *   • 5 camp owners (different KSA companies)
 *   • 20 workers (mixed nationalities)
 *   • 3 service providers
 *   • 10 camps across major KSA cities
 *   • 3-5 rooms per camp
 *   • 30 bookings in various statuses
 *   • 15 reviews
 *   • 5 equipment listings
 *   • 6 services
 *
 * Idempotent: skips users that already exist by email.
 * Run: npm run db:seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { computeBooking } = require('../utils/vatCalculator');

const json = (v) => JSON.stringify(v);
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const code = (prefix) => `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}-${uuidv4().slice(0, 6).toUpperCase()}`;

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];
const REGIONS = { Riyadh: 'Riyadh', Jeddah: 'Makkah', Mecca: 'Makkah', Medina: 'Madinah',
  Dammam: 'Eastern Province', Khobar: 'Eastern Province', Jubail: 'Eastern Province',
  Yanbu: 'Makkah', Tabuk: 'Tabuk', Abha: 'Asir' };
const COORDS = {
  Riyadh: [24.7136, 46.6753], Jeddah: [21.4858, 39.1925], Dammam: [26.4207, 50.0888],
  Mecca: [21.3891, 39.8579], Medina: [24.5247, 39.5692], Khobar: [26.2172, 50.1971],
  Jubail: [27.0046, 49.6582], Yanbu: [24.0890, 38.0618], Tabuk: [28.3838, 36.5550], Abha: [18.2164, 42.5053],
};
const NATIONALITIES = ['Pakistani', 'Indian', 'Bangladeshi', 'Egyptian', 'Filipino', 'Nepali', 'Sri Lankan', 'Yemeni', 'Sudanese'];
const AMENITIES_POOL = ['AC', 'WiFi', 'Laundry', 'Kitchen', 'Prayer Area', 'Parking', 'Gym', 'TV', '24/7 Security'];
const ROOM_AMENITIES = ['AC', 'Attached Bathroom', 'TV', 'WiFi', 'Wardrobe', 'Fridge'];
const POIS_POOL = [
  { name: 'King Fahad Hospital', type: 'hospital', distance_km: 2.4 },
  { name: 'Grand Mosque', type: 'mosque', distance_km: 0.8 },
  { name: 'Panda Supermarket', type: 'supermarket', distance_km: 1.2 },
  { name: 'SAPTCO Bus Station', type: 'bus_station', distance_km: 1.5 },
];

const PHOTO_BASE = 'https://images.unsplash.com/';
const CAMP_PHOTOS = [
  `${PHOTO_BASE}photo-1505693416388-ac5ce068fe85?w=1200`,
  `${PHOTO_BASE}photo-1568605114967-8130f3a36994?w=1200`,
  `${PHOTO_BASE}photo-1582719478250-c89cae4dc85b?w=1200`,
  `${PHOTO_BASE}photo-1582719508461-905c673771fd?w=1200`,
  `${PHOTO_BASE}photo-1564013799919-ab600027ffc6?w=1200`,
  `${PHOTO_BASE}photo-1600585154340-be6161a56a0c?w=1200`,
];
const ROOM_PHOTOS = [
  `${PHOTO_BASE}photo-1631049307264-da0ec9d70304?w=800`,
  `${PHOTO_BASE}photo-1595526114035-0d45ed16cfbf?w=800`,
  `${PHOTO_BASE}photo-1540518614846-7eded433c457?w=800`,
];
const EQUIPMENT_PHOTOS = [
  `${PHOTO_BASE}photo-1581094794329-c8112a89af12?w=800`,
  `${PHOTO_BASE}photo-1504307651254-35680f356dfd?w=800`,
  `${PHOTO_BASE}photo-1565008447742-97f6f38c985c?w=800`,
];

const OWNERS = [
  { email: 'owner@riyadhcamps.sa',     company: 'Riyadh Camps Co.',        cr: '1010234561' },
  { email: 'owner@jeddahstay.sa',      company: 'Jeddah Worker Stay LLC',  cr: '4030234561' },
  { email: 'owner@easternhousing.sa',  company: 'Eastern Housing Group',   cr: '2050234561' },
  { email: 'owner@meccacamps.sa',      company: 'Mecca Pilgrim Camps',     cr: '4030234562' },
  { email: 'owner@northcamps.sa',      company: 'Tabuk North Accom.',      cr: '3550234561' },
];

const WORKER_FIRST = ['Ahmed', 'Mohammed', 'Imran', 'Ali', 'Rajesh', 'Suresh', 'Pradeep', 'Tariq', 'Hassan', 'Khalid',
  'Asif', 'Bilal', 'Faisal', 'Saeed', 'Rakesh', 'Ravi', 'Sunil', 'Karim', 'Yousef', 'Omar'];
const WORKER_LAST = ['Khan', 'Ali', 'Hussain', 'Rahman', 'Kumar', 'Sharma', 'Patel', 'Singh',
  'Abdullah', 'Mahmoud', 'Hassan', 'Aziz', 'Iqbal', 'Mansour', 'Said', 'Habib', 'Nazir', 'Tahir', 'Wahid', 'Yasin'];

async function exists(email) {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  return rows[0]?.id || null;
}

async function makeUser({ role, name, email, password, phone, lang = 'en', verified = false }) {
  const ex = await exists(email);
  if (ex) return ex;
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (role, full_name, email, password_hash, phone, preferred_language, is_active, is_verified)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING id`,
    [role, name, email, hash, phone, lang, verified ? 1 : 0]
  );
  return rows[0].id;
}

async function main() {
  console.log('▶ Seeding LaborStay demo data...');
  console.log(`  driver: ${db.driver}`);

  // ============ ADMIN ============
  const adminId = await makeUser({
    role: 'admin', name: 'Platform Admin', email: 'admin@laborstay.sa',
    password: 'Admin@123', phone: '+966500000001', verified: true,
  });
  console.log(`  ✓ admin id=${adminId}`);

  // ============ OWNERS ============
  const ownerIds = [];
  for (let i = 0; i < OWNERS.length; i++) {
    const o = OWNERS[i];
    const uid = await makeUser({
      role: 'owner', name: o.company.replace(/(LLC|Co\.|Group|Camps)/g, '').trim() + ' Manager',
      email: o.email, password: 'Owner@123', phone: `+9665012345${10 + i}`, verified: true,
    });
    // upsert owner_profile
    const { rows: ex } = await db.query('SELECT id FROM owner_profiles WHERE user_id = $1', [uid]);
    if (!ex[0]) {
      await db.query(
        `INSERT INTO owner_profiles (user_id, company_name, cr_number, vat_number, address)
         VALUES ($1,$2,$3,$4,$5)`,
        [uid, o.company, o.cr, '3' + o.cr + '00003', `${rnd(CITIES)}, KSA`]
      );
    }
    ownerIds.push(uid);
  }
  console.log(`  ✓ ${ownerIds.length} camp owners`);

  // ============ SERVICE PROVIDERS ============
  const providerIds = [];
  const providers = [
    { email: 'catering@providersa.sa', company: 'Saudi Catering Co.' },
    { email: 'transport@providersa.sa', company: 'KSA Transport Services' },
    { email: 'cleaning@providersa.sa',  company: 'Clean Pro Arabia' },
  ];
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    const uid = await makeUser({
      role: 'provider', name: p.company,
      email: p.email, password: 'Provider@123', phone: `+9665099000${10 + i}`, verified: true,
    });
    const { rows: ex } = await db.query('SELECT id FROM owner_profiles WHERE user_id = $1', [uid]);
    if (!ex[0]) {
      await db.query(
        `INSERT INTO owner_profiles (user_id, company_name, cr_number, vat_number, address)
         VALUES ($1,$2,$3,$4,$5)`,
        [uid, p.company, '101' + (100000 + i), '3101' + (100000 + i) + '003', `${rnd(CITIES)}, KSA`]
      );
    }
    providerIds.push(uid);
  }
  console.log(`  ✓ ${providerIds.length} service providers`);

  // ============ WORKERS ============
  const workerIds = [];
  // First, the canonical demo worker
  let mainWorker = await makeUser({
    role: 'worker', name: 'Demo Worker', email: 'worker@email.com',
    password: 'Worker@123', phone: '+966500000099', verified: true,
  });
  const { rows: wpEx } = await db.query('SELECT id FROM worker_profiles WHERE user_id = $1', [mainWorker]);
  if (!wpEx[0]) {
    await db.query(
      `INSERT INTO worker_profiles (user_id, nationality, iqama_number, iqama_expiry, iqama_verified)
       VALUES ($1,$2,$3,$4,1)`,
      [mainWorker, 'Pakistani', '2345678901', '2027-12-31']
    );
  }
  workerIds.push(mainWorker);

  for (let i = 0; i < 19; i++) {
    const first = WORKER_FIRST[i % WORKER_FIRST.length];
    const last = WORKER_LAST[(i * 3) % WORKER_LAST.length];
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@email.com`;
    const uid = await makeUser({
      role: 'worker', name: `${first} ${last}`, email,
      password: 'Worker@123', phone: `+9665066${String(100000 + i).slice(-6)}`,
      verified: Math.random() > 0.3,
    });
    const { rows: ex } = await db.query('SELECT id FROM worker_profiles WHERE user_id = $1', [uid]);
    if (!ex[0]) {
      const expiry = new Date(); expiry.setMonth(expiry.getMonth() + rndInt(2, 36));
      await db.query(
        `INSERT INTO worker_profiles (user_id, nationality, iqama_number, iqama_expiry, iqama_verified)
         VALUES ($1,$2,$3,$4,$5)`,
        [uid, rnd(NATIONALITIES), String(2000000000 + rndInt(100000, 999999)),
          expiry.toISOString().slice(0, 10), Math.random() > 0.4 ? 1 : 0]
      );
    }
    workerIds.push(uid);
  }
  console.log(`  ✓ ${workerIds.length} workers`);

  // ============ CAMPS ============
  // Skip if camps already seeded (idempotency)
  const { rows: campCount } = await db.query('SELECT COUNT(*) as c FROM camps');
  const existingCamps = parseInt(campCount[0].c || campCount[0].C || 0, 10);
  let campIds = [];
  if (existingCamps >= 10) {
    const { rows } = await db.query('SELECT id FROM camps ORDER BY id LIMIT 10');
    campIds = rows.map((r) => r.id);
    console.log(`  ↳ camps already seeded (${existingCamps}), reusing`);
  } else {
    for (let i = 0; i < 10; i++) {
      const owner = ownerIds[i % ownerIds.length];
      const city = CITIES[i % CITIES.length];
      const [lat, lng] = COORDS[city];
      const campType = rnd(['standard', 'executive', 'istira']);
      const amenities = AMENITIES_POOL.slice(0, rndInt(4, 8));
      const pois = POIS_POOL;
      const natPref = NATIONALITIES.slice(0, rndInt(2, 4));
      const ins = await db.query(
        `INSERT INTO camps (owner_id, name, description, camp_type, address, city, region, latitude, longitude,
                            amenities, nearby_pois, nationality_preference, family_allowed, smoking_allowed, rules,
                            licence_number, capacity, emergency_contact, status, is_featured, rating, review_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'approved',$19,$20,$21) RETURNING id`,
        [
          owner,
          `${city} ${campType === 'executive' ? 'Executive' : campType === 'istira' ? 'Istira' : 'Workers'} Camp ${i + 1}`,
          `A well-maintained ${campType} accommodation facility in ${city} with modern amenities and easy access to industrial sites.`,
          campType,
          `Industrial Zone, Block ${rndInt(1, 9)}, ${city}`,
          city, REGIONS[city], lat + (Math.random() - 0.5) * 0.05, lng + (Math.random() - 0.5) * 0.05,
          json(amenities), json(pois), json(natPref),
          Math.random() > 0.7 ? 1 : 0,
          Math.random() > 0.7 ? 1 : 0,
          'No loud noise after 10 PM. Respect neighbours. No outside guests without registration.',
          `MOHR-${10000 + i}`, rndInt(50, 300), `+96650${rndInt(1000000, 9999999)}`,
          i < 4 ? 1 : 0,
          Math.round((3 + Math.random() * 2) * 10) / 10,
          rndInt(3, 25),
        ]
      );
      const campId = ins.rows[0].id;
      campIds.push(campId);

      // Photos
      const photoSet = [...CAMP_PHOTOS].sort(() => Math.random() - 0.5).slice(0, rndInt(3, 5));
      for (let p = 0; p < photoSet.length; p++) {
        await db.query(
          `INSERT INTO camp_photos (camp_id, url, is_cover) VALUES ($1,$2,$3)`,
          [campId, photoSet[p], p === 0 ? 1 : 0]
        );
      }
    }
    console.log(`  ✓ ${campIds.length} camps with photos`);
  }

  // ============ ROOMS ============
  const { rows: roomCount } = await db.query('SELECT COUNT(*) as c FROM rooms');
  const existingRooms = parseInt(roomCount[0].c || roomCount[0].C || 0, 10);
  let roomIds = [];
  if (existingRooms >= 30) {
    const { rows } = await db.query('SELECT id, camp_id, available_beds, price_per_day FROM rooms');
    roomIds = rows;
    console.log(`  ↳ rooms already seeded (${existingRooms}), reusing`);
  } else {
    for (const campId of campIds) {
      const numRooms = rndInt(3, 5);
      for (let r = 0; r < numRooms; r++) {
        const type = rnd(['standard', 'executive', 'bed_space']);
        const capacity = type === 'executive' ? rndInt(1, 2) : type === 'bed_space' ? 1 : rndInt(4, 8);
        const dailyBase = type === 'executive' ? rndInt(80, 150) : type === 'bed_space' ? rndInt(25, 50) : rndInt(40, 80);
        const monthly = dailyBase * 28; // ~28-day month rate
        const ins = await db.query(
          `INSERT INTO rooms (camp_id, name, description, room_type, capacity, available_beds,
                              price_per_day, price_per_month, amenities, photos, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1) RETURNING id`,
          [
            campId,
            `${type === 'executive' ? 'Executive Suite' : type === 'bed_space' ? 'Bed Space' : 'Standard Room'} ${r + 1}`,
            `Comfortable ${type.replace('_', ' ')} with ${capacity} bed${capacity > 1 ? 's' : ''}.`,
            type, capacity, capacity, dailyBase, monthly,
            json(ROOM_AMENITIES.slice(0, rndInt(3, 6))),
            json([rnd(ROOM_PHOTOS), rnd(ROOM_PHOTOS)]),
          ]
        );
        roomIds.push({ id: ins.rows[0].id, camp_id: campId, available_beds: capacity, price_per_day: dailyBase });

        // Add some dynamic pricing rules randomly
        if (Math.random() > 0.5) {
          await db.query(
            `INSERT INTO dynamic_pricing (room_id, pricing_type, multiplier, is_active) VALUES ($1,'weekend',1.20,1)`,
            [ins.rows[0].id]
          );
        }
      }
    }
    console.log(`  ✓ ${roomIds.length} rooms across all camps`);
  }

  // ============ BOOKINGS ============
  const { rows: bk } = await db.query('SELECT COUNT(*) as c FROM bookings');
  const existingBookings = parseInt(bk[0].c || bk[0].C || 0, 10);
  if (existingBookings < 30) {
    const statuses = ['pending', 'confirmed', 'confirmed', 'confirmed', 'checked_in', 'checked_out', 'cancelled'];
    for (let i = 0; i < 30; i++) {
      const room = rnd(roomIds);
      const worker = rnd(workerIds);
      const status = rnd(statuses);
      const startOffset = rndInt(-30, 30);
      const lengthDays = rnd([7, 14, 28, 30, 60]);
      const start = new Date(); start.setDate(start.getDate() + startOffset);
      const end = new Date(start); end.setDate(end.getDate() + lengthDays);
      const base = (room.price_per_day || 50) * lengthDays;
      const calc = computeBooking(base);
      const codeStr = code('BK');
      await db.query(
        `INSERT INTO bookings (booking_code, worker_id, room_id, camp_id, booking_type,
                               start_date, end_date, occupants,
                               base_amount, vat_amount, commission_amount, total_amount, net_to_owner,
                               status, qr_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11,$12,$13,$14)`,
        [
          codeStr, worker, room.id, room.camp_id,
          lengthDays <= 7 ? 'weekly' : lengthDays <= 30 ? 'monthly' : 'contract',
          start.toISOString().slice(0, 10), end.toISOString().slice(0, 10),
          calc.base, calc.vat, calc.commission, calc.total, calc.netToOwner,
          status, codeStr,
        ]
      );
    }
    console.log(`  ✓ 30 bookings seeded`);
  } else {
    console.log(`  ↳ bookings already seeded (${existingBookings})`);
  }

  // ============ REVIEWS ============
  const { rows: rv } = await db.query('SELECT COUNT(*) as c FROM reviews');
  if (parseInt(rv[0].c || rv[0].C || 0, 10) < 15) {
    const comments = [
      'Clean rooms and friendly staff. Highly recommend.',
      'Good value for money. WiFi was a bit slow.',
      'Excellent location, close to my work site.',
      'Beds were comfortable, AC worked well.',
      'Prayer area was well maintained. Kitchen could be cleaner.',
      'Best camp I have stayed in. Will book again.',
      'Average accommodation. Manager was responsive.',
      'Very secure and quiet. Great for resting after work.',
    ];
    for (let i = 0; i < 15; i++) {
      await db.query(
        `INSERT INTO reviews (camp_id, worker_id, rating, comment) VALUES ($1,$2,$3,$4)`,
        [rnd(campIds), rnd(workerIds), rndInt(3, 5), rnd(comments)]
      );
    }
    console.log(`  ✓ 15 reviews seeded`);
  }

  // ============ EQUIPMENT ============
  const { rows: eq } = await db.query('SELECT COUNT(*) as c FROM equipment');
  if (parseInt(eq[0].c || eq[0].C || 0, 10) < 5) {
    const items = [
      { cat: 'generator', name: '250 KVA Diesel Generator', model: 'CAT-DE250', mfr: 'Caterpillar', daily: 600 },
      { cat: 'dewatering', name: 'Wellpoint Dewatering System', model: 'WP-100', mfr: 'Selwood', daily: 1200 },
      { cat: 'compressor', name: 'Atlas Copco 185 CFM Compressor', model: 'XAS-185', mfr: 'Atlas Copco', daily: 450 },
      { cat: 'tower_light', name: 'LED Tower Light (4x320W)', model: 'TL-1280', mfr: 'Generac', daily: 180 },
      { cat: 'scaffolding', name: 'Cuplock Scaffolding Set', model: 'CL-500', mfr: 'Layher', daily: 250 },
    ];
    for (const it of items) {
      await db.query(
        `INSERT INTO equipment (owner_id, category, name, model, manufacturer, description, specifications,
                                photos, daily_rate, weekly_rate, monthly_rate, city, fuel_type, operator_included,
                                delivery_available, delivery_charge, status, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'available',1)`,
        [
          rnd(ownerIds), it.cat, it.name, it.model, it.mfr,
          `Professional-grade ${it.name.toLowerCase()}, fully serviced and ready for site delivery.`,
          json({ power: 'Industrial', condition: 'Excellent', year: 2022 }),
          json([rnd(EQUIPMENT_PHOTOS)]),
          it.daily, it.daily * 6, it.daily * 24,
          rnd(CITIES), it.cat === 'generator' || it.cat === 'compressor' ? 'Diesel' : 'N/A',
          Math.random() > 0.5 ? 1 : 0, 1, rndInt(200, 800),
        ]
      );
    }
    console.log(`  ✓ 5 equipment listings seeded`);
  }

  // ============ SERVICES ============
  const { rows: sv } = await db.query('SELECT COUNT(*) as c FROM services');
  if (parseInt(sv[0].c || sv[0].C || 0, 10) < 6) {
    const svcs = [
      { cat: 'catering', name: 'Daily Worker Meal Package (3 meals)', price: 35, pricing: 'per_person_per_day' },
      { cat: 'transportation', name: 'Site Shuttle Bus (50-seater)', price: 1500, pricing: 'per_day' },
      { cat: 'cleaning', name: 'Weekly Camp Deep Clean', price: 800, pricing: 'per_visit' },
      { cat: 'security', name: 'On-site Security Guard (12-hour shift)', price: 220, pricing: 'per_shift' },
      { cat: 'laundry', name: 'Industrial Laundry — Bulk', price: 8, pricing: 'per_kg' },
      { cat: 'labour_supply', name: 'General Labour Workers (skilled)', price: 180, pricing: 'per_worker_per_day' },
    ];
    for (let i = 0; i < svcs.length; i++) {
      const s = svcs[i];
      await db.query(
        `INSERT INTO services (provider_id, category, name, description, pricing_type, base_price, city, rating, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
        [
          providerIds[i % providerIds.length], s.cat, s.name,
          `${s.name} — reliable provider servicing all major KSA cities.`,
          s.pricing, s.price, rnd(CITIES), Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        ]
      );
    }
    console.log(`  ✓ 6 services seeded`);
  }

  // ============ NOTIFICATIONS (sample) ============
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     VALUES ($1,'welcome','Welcome to LaborStay','Your account is ready. Start exploring camps.','/')`,
    [mainWorker]
  );

  await db.close();
  console.log('\n✅ Seed complete!\n');
  console.log('Demo credentials:');
  console.log('  Admin   → admin@laborstay.sa / Admin@123');
  console.log('  Owner   → owner@riyadhcamps.sa / Owner@123');
  console.log('  Worker  → worker@email.com / Worker@123');
}

main().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
