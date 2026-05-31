/**
 * Booking calendar views (H9).
 *
 *   GET /worker/calendar?month=YYYY-MM     — worker's bookings in the month
 *   GET /owner/calendar?camp_id=&month=    — camp-wide occupancy per day
 *   GET /rooms/:id/availability?month=     — room availability for a month
 */
const express = require('express');
const db = require('../config/database');
const { authRequired, requireRole } = require('../middleware/auth');

const router = express.Router();

function monthRange(monthStr) {
  // monthStr: 'YYYY-MM' → returns { start, end, days }
  const [y, m] = monthStr.split('-').map((s) => parseInt(s, 10));
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, lastDay };
}

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── WORKER CALENDAR ───
router.get('/worker/calendar', authRequired, async (req, res, next) => {
  try {
    const month = req.query.month || thisMonth();
    const { start, end } = monthRange(month);
    const { rows } = await db.query(
      `SELECT b.id, b.booking_code, b.start_date, b.end_date, b.status, b.total_amount,
              c.name AS camp_name, c.city, r.name AS room_name
       FROM bookings b
       JOIN camps c ON c.id=b.camp_id
       JOIN rooms r ON r.id=b.room_id
       WHERE b.worker_id=$1
         AND b.start_date <= $2 AND b.end_date >= $3
       ORDER BY b.start_date ASC`,
      [req.user.id, end, start]
    );
    res.json({ month, range: { start, end }, bookings: rows });
  } catch (e) { next(e); }
});

// ─── OWNER CALENDAR (camp-wide occupancy per day) ───
router.get('/owner/calendar',
  authRequired, requireRole('owner', 'admin'),
  async (req, res, next) => {
    try {
      const campId = parseInt(req.query.camp_id, 10);
      if (!campId) return res.status(400).json({ error: 'camp_id required' });

      if (req.user.role !== 'admin') {
        const { rows: c } = await db.query('SELECT owner_id FROM camps WHERE id=$1', [campId]);
        if (!c[0]) return res.status(404).json({ error: 'Camp not found' });
        if (c[0].owner_id !== req.user.id) return res.status(403).json({ error: 'Not your camp' });
      }

      const month = req.query.month || thisMonth();
      const { start, end, lastDay } = monthRange(month);

      // Capacity (active beds at this camp)
      const { rows: cap } = await db.query(
        `SELECT COALESCE(SUM(capacity),0) AS cap FROM rooms WHERE camp_id=$1 AND is_active=1`,
        [campId]
      );
      const capacity = parseInt(cap[0].cap || 0, 10);

      // All bookings overlapping this month
      const { rows: bks } = await db.query(
        `SELECT b.id, b.start_date, b.end_date, b.status, b.occupants,
                b.booking_code, u.full_name AS worker_name, r.name AS room_name
         FROM bookings b
         JOIN users u ON u.id = b.worker_id
         JOIN rooms r ON r.id = b.room_id
         WHERE b.camp_id=$1
           AND b.status IN ('confirmed','checked_in','checked_out')
           AND b.start_date <= $2 AND b.end_date >= $3`,
        [campId, end, start]
      );

      // Per-day occupancy
      const days = [];
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        const occupied = bks
          .filter((b) => dateStr >= b.start_date && dateStr <= b.end_date)
          .reduce((s, b) => s + parseInt(b.occupants || 1, 10), 0);
        days.push({
          date: dateStr,
          occupied,
          available: Math.max(0, capacity - occupied),
          capacity,
          occupancy_pct: capacity > 0 ? Math.round((occupied / capacity) * 100) : 0,
        });
      }

      res.json({ month, range: { start, end }, capacity, days, bookings: bks });
    } catch (e) { next(e); }
  }
);

// ─── ROOM AVAILABILITY CALENDAR ───
router.get('/rooms/:id/availability', async (req, res, next) => {
  try {
    const roomId = parseInt(req.params.id, 10);
    const month = req.query.month || thisMonth();
    const { start, end, lastDay } = monthRange(month);

    const { rows: r } = await db.query('SELECT * FROM rooms WHERE id=$1', [roomId]);
    if (!r[0]) return res.status(404).json({ error: 'Room not found' });

    const capacity = parseInt(r[0].capacity || 1, 10);
    const { rows: bks } = await db.query(
      `SELECT start_date, end_date, occupants FROM bookings
       WHERE room_id=$1 AND status IN ('confirmed','checked_in','checked_out','pending')
         AND start_date <= $2 AND end_date >= $3`,
      [roomId, end, start]
    );

    const days = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${month}-${String(d).padStart(2, '0')}`;
      const occupied = bks
        .filter((b) => dateStr >= b.start_date && dateStr <= b.end_date)
        .reduce((s, b) => s + parseInt(b.occupants || 1, 10), 0);
      days.push({
        date: dateStr,
        booked: occupied,
        free: Math.max(0, capacity - occupied),
        is_full: occupied >= capacity,
      });
    }
    res.json({ month, room_id: roomId, capacity, days });
  } catch (e) { next(e); }
});

module.exports = router;
