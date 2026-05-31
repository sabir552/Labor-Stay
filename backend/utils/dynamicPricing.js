/**
 * Dynamic pricing engine.
 *
 * For each night between start and end, picks the highest applicable
 * multiplier among the room's dynamic_pricing rules:
 *   - "weekend"   — applied automatically to Thu/Fri
 *   - "ramadan"   — applied if date falls inside rule's date range
 *   - "hajj_umrah"— applied if date falls inside rule's date range
 *   - "standard"  — default 1.0x
 *
 * Returns { nights, base, breakdown: [{date, multiplier, type, price}] }
 */
const db = require('../config/database');

function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const days = Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  return days;
}

function isWeekend(date) {
  const d = new Date(date).getDay(); // 0=Sun..6=Sat
  // In KSA, weekend = Friday(5) & Saturday(6); we also include Thursday eve (4)
  return d === 4 || d === 5 || d === 6;
}

async function getRules(roomId) {
  const { rows } = await db.query(
    `SELECT pricing_type, multiplier, start_date, end_date
     FROM dynamic_pricing WHERE room_id = $1 AND is_active = 1`,
    [roomId]
  );
  return rows;
}

function pickMultiplier(date, rules) {
  let best = { multiplier: 1.0, type: 'standard' };
  for (const r of rules) {
    const mult = Number(r.multiplier) || 1;
    if (r.pricing_type === 'weekend') {
      if (isWeekend(date) && mult > best.multiplier) best = { multiplier: mult, type: 'weekend' };
    } else if (r.start_date && r.end_date) {
      if (date >= r.start_date && date <= r.end_date && mult > best.multiplier) {
        best = { multiplier: mult, type: r.pricing_type };
      }
    } else if (mult > best.multiplier) {
      best = { multiplier: mult, type: r.pricing_type };
    }
  }
  return best;
}

async function priceStay({ roomId, startDate, endDate, pricePerDay }) {
  const rules = await getRules(roomId);
  const nights = daysBetween(startDate, endDate);
  const breakdown = [];
  let total = 0;
  const start = new Date(startDate);
  for (let i = 0; i < nights; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    const { multiplier, type } = pickMultiplier(iso, rules);
    const price = Number(pricePerDay) * multiplier;
    breakdown.push({ date: iso, multiplier, type, price: Math.round(price * 100) / 100 });
    total += price;
  }
  return { nights, base: Math.round(total * 100) / 100, breakdown };
}

module.exports = { priceStay, daysBetween, isWeekend };
