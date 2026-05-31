/**
 * Session management (F2).
 *
 * On login we insert a row into `sessions` with a hash of the JWT plus
 * device/IP info. Users can list and revoke sessions from their profile.
 *
 *   create(userId, token, req)       — record a new session
 *   list(userId)                     — active sessions for user
 *   revoke(sessionId, userId)        — revoke one session
 *   revokeAll(userId, exceptToken?)  — logout all devices
 *   isRevoked(token)                 — check during authRequired
 */
const crypto = require('crypto');
const db = require('../config/database');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseUserAgent(ua = '') {
  // Tiny UA parser — extracts os + browser hints for display only.
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iOS/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /curl/i.test(ua) ? 'curl' : 'Browser';
  return `${browser} on ${os}`;
}

async function create(userId, token, req) {
  const tokenHash = hashToken(token);
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
  const ua = req.headers['user-agent'] || '';
  const device = parseUserAgent(ua);
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  try {
    await db.query(
      `INSERT INTO sessions (user_id, token_hash, device_info, ip_address, user_agent, is_active, last_used_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,1,CURRENT_TIMESTAMP,$6)`,
      [userId, tokenHash, device, ip, ua, expires]
    );
  } catch (e) { /* table may not exist yet */ }
}

async function list(userId) {
  try {
    const { rows } = await db.query(
      `SELECT id, device_info, ip_address, last_used_at, created_at, expires_at
       FROM sessions WHERE user_id=$1 AND is_active=1
       ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
      [userId]
    );
    return rows;
  } catch (e) {
    try {
      const { rows } = await db.query(
        `SELECT id, device_info, ip_address, last_used_at, created_at, expires_at
         FROM sessions WHERE user_id=$1 AND is_active=1 ORDER BY created_at DESC`,
        [userId]
      );
      return rows;
    } catch (err) { return []; }
  }
}

async function revoke(sessionId, userId) {
  try {
    await db.query('UPDATE sessions SET is_active=0 WHERE id=$1 AND user_id=$2', [sessionId, userId]);
    return true;
  } catch (e) { return false; }
}

async function revokeAll(userId, exceptToken) {
  try {
    if (exceptToken) {
      await db.query('UPDATE sessions SET is_active=0 WHERE user_id=$1 AND token_hash <> $2',
        [userId, hashToken(exceptToken)]);
    } else {
      await db.query('UPDATE sessions SET is_active=0 WHERE user_id=$1', [userId]);
    }
    return true;
  } catch (e) { return false; }
}

async function isRevoked(token) {
  try {
    const tokenHash = hashToken(token);
    const { rows } = await db.query(
      `SELECT is_active FROM sessions WHERE token_hash=$1 LIMIT 1`, [tokenHash]
    );
    if (!rows.length) return false;  // not tracked = treat as valid
    return !rows[0].is_active;
  } catch (e) { return false; }
}

async function touch(token) {
  try {
    const tokenHash = hashToken(token);
    await db.query('UPDATE sessions SET last_used_at=CURRENT_TIMESTAMP WHERE token_hash=$1', [tokenHash]);
  } catch (e) { /* ignore */ }
}

module.exports = { create, list, revoke, revokeAll, isRevoked, touch, hashToken };
