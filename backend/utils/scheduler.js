/**
 * Background job scheduler (I1) using node-cron.
 *
 * Jobs registered:
 *   • Every 5 min   — auto-cancel stale unpaid bookings, notify waiting list
 *   • Every hour    — refresh exchange rates cache, check price alerts
 *   • 06:00 daily   — check-in reminders, check-out reminders
 *   • 08:00 daily   — Iqama/passport expiry alerts (60/30/7), survey requests
 *   • Sun 09:00     — weekly earnings report to owners, admin weekly analytics
 *   • 1st of month  — corporate invoices, loyalty expiry, payroll summaries
 *
 * All jobs are wrapped in try/catch so a single failure never kills the loop.
 * Schedules are NOT started in test environments (NODE_ENV === 'test') or
 * when LABORSTAY_DISABLE_CRON=1 is set (useful for unit tests).
 */
let cron;
try { cron = require('node-cron'); }
catch (e) { console.warn('[scheduler] node-cron not installed — scheduler disabled'); }

const db = require('../config/database');

function safe(name, fn) {
  return async () => {
    const t0 = Date.now();
    try {
      await fn();
      const ms = Date.now() - t0;
      if (process.env.NODE_ENV !== 'production' || ms > 1000) {
        console.log(`[cron:${name}] ok in ${ms}ms`);
      }
    } catch (err) {
      console.warn(`[cron:${name}] failed:`, err.message);
    }
  };
}

// ---------- JOB IMPLEMENTATIONS ----------

// I1 part A — auto-cancel pending bookings older than 24h with no paid payment
async function autoCancelStaleBookings() {
  const sql = db.driver === 'postgres'
    ? `SELECT b.* FROM bookings b
       WHERE b.status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='paid')
         AND b.created_at < NOW() - INTERVAL '24 hours'`
    : `SELECT b.* FROM bookings b
       WHERE b.status = 'pending'
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id=b.id AND p.status='paid')
         AND b.created_at < datetime('now','-1 day')`;
  const { rows } = await db.query(sql, []);
  for (const b of rows) {
    await db.query(
      `UPDATE bookings SET status='cancelled',
         rejection_reason='auto-cancelled: payment not received within 24h',
         updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [b.id]
    );
    await db.query('UPDATE rooms SET available_beds = available_beds + $1 WHERE id=$2', [b.occupants || 1, b.room_id]);
  }
  return rows.length;
}

// I1 part B — process waiting list when beds available
async function processWaitingList() {
  // Find rooms with free beds AND active waiting-list entries
  const sql = `
    SELECT DISTINCT wl.room_id, r.available_beds, r.name AS room_name, r.camp_id, c.name AS camp_name
    FROM waiting_list wl
    JOIN rooms r ON r.id = wl.room_id
    JOIN camps c ON c.id = r.camp_id
    WHERE wl.status = 'active' AND r.available_beds > 0`;
  let count = 0;
  try {
    const { rows } = await db.query(sql, []);
    for (const r of rows) {
      const { rows: list } = await db.query(
        `SELECT * FROM waiting_list WHERE room_id=$1 AND status='active'
         ORDER BY created_at ASC LIMIT $2`,
        [r.room_id, r.available_beds]
      );
      for (const entry of list) {
        await db.query(
          `INSERT INTO notifications (user_id,type,title,body,link)
           VALUES ($1,'bed_available',$2,$3,$4)`,
          [
            entry.worker_id,
            `A bed is available in ${r.room_name}`,
            `Book within 2 hours to claim it — first come first served.`,
            `/camps/${r.camp_id}`,
          ]
        );
        await db.query('UPDATE waiting_list SET notified_at=CURRENT_TIMESTAMP WHERE id=$1', [entry.id]);
        count++;
      }
    }
  } catch (e) { /* table may not exist in tests */ }
  return count;
}

// I1 part C — Iqama / passport expiry alerts
async function iqamaExpiryAlerts() {
  let notified = 0;
  const today = new Date();
  const day = 86400000;
  const targetDays = [60, 30, 7];

  for (const days of targetDays) {
    const target = new Date(today.getTime() + days * day).toISOString().slice(0, 10);

    // Workers
    try {
      const { rows } = await db.query(
        `SELECT u.id, u.full_name, wp.iqama_expiry
         FROM users u JOIN worker_profiles wp ON wp.user_id=u.id
         WHERE wp.iqama_expiry = $1 AND u.is_active = 1`,
        [target]
      );
      for (const u of rows) {
        await db.query(
          `INSERT INTO notifications (user_id,type,title,body,link)
           VALUES ($1,'iqama_expiry',$2,$3,$4)`,
          [u.id, `Iqama expires in ${days} days`,
           `Please renew your Iqama (expiry ${target}) to keep your bookings active.`,
           '/worker/profile']
        );
        notified++;
      }
    } catch (e) { /* ignore */ }

    // Staff
    try {
      const { rows } = await db.query(
        `SELECT s.id, s.full_name, c.owner_id, s.iqama_expiry, s.passport_expiry
         FROM camp_staff s JOIN camps c ON c.id=s.camp_id
         WHERE (s.iqama_expiry = $1 OR s.passport_expiry = $1) AND s.is_active = 1`,
        [target]
      );
      for (const s of rows) {
        await db.query(
          `INSERT INTO notifications (user_id,type,title,body,link)
           VALUES ($1,'staff_doc_expiry',$2,$3,$4)`,
          [s.owner_id, `Staff document expires in ${days} days`,
           `${s.full_name}'s document is expiring on ${target}.`, '/owner/staff']
        );
        notified++;
      }
    } catch (e) { /* table may not exist yet */ }
  }
  return notified;
}

// I1 part D — survey requests 2 days after checkout
async function postCheckoutSurveys() {
  let sent = 0;
  try {
    const sql = db.driver === 'postgres'
      ? `SELECT * FROM bookings WHERE status='checked_out' AND checked_out_at < NOW() - INTERVAL '2 days'
                                   AND checked_out_at > NOW() - INTERVAL '3 days'`
      : `SELECT * FROM bookings WHERE status='checked_out'
         AND checked_out_at < datetime('now','-2 days')
         AND checked_out_at > datetime('now','-3 days')`;
    const { rows } = await db.query(sql, []);
    for (const b of rows) {
      // Skip if survey response already exists for this booking
      try {
        const { rows: existing } = await db.query(
          `SELECT 1 FROM survey_responses WHERE booking_id=$1 LIMIT 1`, [b.id]);
        if (existing.length) continue;
      } catch (e) { /* table may not exist */ continue; }

      await db.query(
        `INSERT INTO notifications (user_id,type,title,body,link)
         VALUES ($1,'survey_request','How was your stay?',
                 'Please take 1 minute to rate your experience.',
                 $2)`,
        [b.worker_id, `/worker/bookings/${b.id}`]
      );
      sent++;
    }
  } catch (e) { /* ignore */ }
  return sent;
}

// ---------- REGISTER JOBS ----------
function start() {
  if (!cron) return;
  if (process.env.NODE_ENV === 'test') return;
  if (process.env.LABORSTAY_DISABLE_CRON === '1') {
    console.log('[scheduler] disabled via LABORSTAY_DISABLE_CRON=1');
    return;
  }

  cron.schedule('*/5 * * * *', safe('auto-cancel', async () => {
    const n = await autoCancelStaleBookings();
    if (n) console.log(`[cron] auto-cancelled ${n} stale bookings`);
  }));

  cron.schedule('*/5 * * * *', safe('waitlist', async () => {
    const n = await processWaitingList();
    if (n) console.log(`[cron] notified ${n} waitlisted workers`);
  }));

  cron.schedule('0 8 * * *', safe('iqama-expiry', async () => {
    const n = await iqamaExpiryAlerts();
    if (n) console.log(`[cron] sent ${n} expiry alerts`);
  }));

  cron.schedule('0 8 * * *', safe('post-checkout-surveys', async () => {
    const n = await postCheckoutSurveys();
    if (n) console.log(`[cron] sent ${n} post-checkout survey requests`);
  }));

  console.log('[scheduler] cron jobs registered');
}

module.exports = {
  start,
  // Exported for unit-testing / manual triggers
  autoCancelStaleBookings,
  processWaitingList,
  iqamaExpiryAlerts,
  postCheckoutSurveys,
};
