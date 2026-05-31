#!/usr/bin/env node
/**
 * Creates all tables. Run: npm run db:setup
 * Pass --reset to drop everything first.
 *
 * v2 (Piece 13+): also runs buildSchemaV2() and additiveAlters() so
 * follow-up tables and columns are migrated automatically. Re-running
 * is always safe (CREATE TABLE IF NOT EXISTS + ALTER swallowed if
 * column already exists).
 */
require('dotenv').config();
const db = require('../config/database');
const schema = require('../config/schema');

const v2Tables = [
  // v2 (Piece 13+) — also dropped on --reset
  'notification_preferences', 'badges', 'price_alerts', 'loyalty_points', 'referrals',
  'utility_alerts', 'utility_readings', 'branches', 'companies',
  'erp_sync_logs', 'deletion_requests', 'biometric_logs', 'biometric_records',
  'access_logs', 'access_cards', 'cctv_cameras',
  'ip_blocks', 'sessions', 'user_2fa',
  'payout_requests', 'corporate_invoices', 'corporate_bookings', 'corporate_accounts',
  'payroll_records', 'staff_shifts', 'staff_attendance', 'camp_staff',
  'visitor_logs', 'housekeeping_schedules', 'housekeeping_tasks',
  'survey_responses', 'surveys', 'worker_service_requests',
  'vehicle_locations', 'transport_bookings', 'transport_routes', 'vehicles',
  'catering_orders', 'catering_packages', 'meal_attendance', 'catering_menus',
];

async function run() {
  const reset = process.argv.includes('--reset');
  console.log(`▶ Setting up database (driver: ${db.driver})`);

  if (reset) {
    console.log('⚠  Resetting: dropping all tables...');
    const tables = [
      ...v2Tables,
      'audit_logs','announcements','disputes','maintenance_requests','documents',
      'service_requests','services','equipment_bookings','equipment',
      'waiting_list','notifications','messages','reviews','payments','bookings',
      'dynamic_pricing','rooms','camp_photos','camps',
      'owner_profiles','worker_profiles','users',
    ];
    for (const t of tables) {
      try { await db.query(`DROP TABLE IF EXISTS ${t} CASCADE`); }
      catch { try { await db.query(`DROP TABLE IF EXISTS ${t}`); } catch {} }
    }
  }

  // v1 schema
  const v1 = schema.buildSchema(db.driver);
  for (const sql of v1) {
    try { await db.query(sql); }
    catch (err) {
      console.error('✖ v1 failed:', sql.split('\n')[0]);
      console.error(err.message);
      process.exit(1);
    }
  }
  console.log(`✓ v1: ${v1.length} schema objects`);

  // v2 schema (additive)
  if (schema.buildSchemaV2) {
    const v2 = schema.buildSchemaV2(db.driver);
    for (const sql of v2) {
      try { await db.query(sql); }
      catch (err) {
        console.error('✖ v2 failed:', sql.split('\n')[0]);
        console.error(err.message);
        process.exit(1);
      }
    }
    console.log(`✓ v2: ${v2.length} schema objects`);
  }

  // Additive ALTER TABLE — silently swallow "duplicate column" errors
  if (schema.additiveAlters) {
    const alters = schema.additiveAlters();
    let applied = 0;
    let skipped = 0;
    for (const sql of alters) {
      try {
        await db.query(sql);
        applied++;
      } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('duplicate column') || msg.includes('already exists')) {
          skipped++;
        } else {
          console.warn('⚠ ALTER skipped:', sql.split('\n')[0], '—', err.message);
          skipped++;
        }
      }
    }
    console.log(`✓ alters: ${applied} applied, ${skipped} skipped (already present)`);
  }

  await db.close();
  console.log('✓ Database setup complete');
}

run().catch((e) => { console.error(e); process.exit(1); });
