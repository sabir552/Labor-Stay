/**
 * IP brute-force protection (F3).
 *
 * Tracks failed auth attempts per IP. Block durations escalate:
 *   • after 5  failures: 15 min
 *   • after 10 failures: 1 hour
 *   • after 20 failures: 24 hours
 *
 * Persists to `ip_blocks` table (best-effort) and also caches in memory for speed.
 *
 * Usage:
 *   const ipb = require('./middleware/ipBlocking');
 *   router.post('/login', ipb.guard, ipb.captureResult, async (req,res) => {...});
 *
 * Inside the handler call:
 *   req.ipFailed()   on bad credentials
 *   req.ipSucceeded() on successful login (clears the counter)
 */
const db = require('../config/database');

const mem = new Map(); // ip -> { attempts, blockedUntil }

function getIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').toString().split(',')[0].trim();
}

function blockMsForAttempts(n) {
  if (n >= 20) return 24 * 60 * 60 * 1000;
  if (n >= 10) return 60 * 60 * 1000;
  if (n >= 5)  return 15 * 60 * 1000;
  return 0;
}

async function loadFromDb(ip) {
  try {
    const { rows } = await db.query('SELECT * FROM ip_blocks WHERE ip_address = $1', [ip]);
    return rows[0] || null;
  } catch (e) { return null; }
}

async function saveToDb(ip, attempts, blockedUntilIso, reason) {
  try {
    const existing = await loadFromDb(ip);
    if (existing) {
      await db.query(
        `UPDATE ip_blocks SET attempts=$1, blocked_until=$2, reason=$3, updated_at=CURRENT_TIMESTAMP WHERE ip_address=$4`,
        [attempts, blockedUntilIso, reason, ip]
      );
    } else {
      await db.query(
        `INSERT INTO ip_blocks (ip_address, attempts, blocked_until, reason) VALUES ($1,$2,$3,$4)`,
        [ip, attempts, blockedUntilIso, reason]
      );
    }
  } catch (e) { /* table may not exist yet */ }
}

async function guard(req, res, next) {
  const ip = getIp(req);
  req._clientIp = ip;

  let entry = mem.get(ip);
  if (!entry) {
    const dbRow = await loadFromDb(ip);
    if (dbRow) {
      entry = {
        attempts: dbRow.attempts || 0,
        blockedUntil: dbRow.blocked_until ? new Date(dbRow.blocked_until).getTime() : 0,
      };
      mem.set(ip, entry);
    } else {
      entry = { attempts: 0, blockedUntil: 0 };
      mem.set(ip, entry);
    }
  }

  if (entry.blockedUntil && entry.blockedUntil > Date.now()) {
    const minutes = Math.ceil((entry.blockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: `Too many failed attempts. Try again in ${minutes} minute(s).`,
      blocked_until: new Date(entry.blockedUntil).toISOString(),
    });
  }

  // Attach helpers to req
  req.ipFailed = async () => {
    entry.attempts++;
    const blockMs = blockMsForAttempts(entry.attempts);
    if (blockMs > 0) {
      entry.blockedUntil = Date.now() + blockMs;
    }
    mem.set(ip, entry);
    await saveToDb(
      ip, entry.attempts,
      entry.blockedUntil ? new Date(entry.blockedUntil).toISOString() : null,
      `${entry.attempts} failed login attempts`
    );
  };

  req.ipSucceeded = async () => {
    mem.delete(ip);
    try { await db.query('DELETE FROM ip_blocks WHERE ip_address=$1', [ip]); } catch (e) {}
  };

  next();
}

// Admin helpers
async function listBlocked() {
  try {
    const { rows } = await db.query(
      `SELECT * FROM ip_blocks ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 200`, []
    );
    return rows;
  } catch (e) {
    // Postgres-only NULLS LAST might fail on SQLite; retry simpler
    try {
      const { rows } = await db.query(`SELECT * FROM ip_blocks ORDER BY created_at DESC LIMIT 200`, []);
      return rows;
    } catch (err) { return []; }
  }
}

async function unblock(ip) {
  mem.delete(ip);
  try { await db.query('DELETE FROM ip_blocks WHERE ip_address=$1', [ip]); } catch (e) {}
  return true;
}

module.exports = { guard, listBlocked, unblock, getIp };
