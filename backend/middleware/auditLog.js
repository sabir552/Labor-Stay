/**
 * Lightweight audit logger. Use auditLog(req, action, entity, entityId, meta)
 * or apply auditMiddleware globally to log every mutating request.
 */
const db = require('../config/database');

async function auditLog(req, action, entity = null, entityId = null, meta = null) {
  try {
    const userId = req.user ? req.user.id : null;
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    const metaStr = meta ? JSON.stringify(meta) : null;
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, ip)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, action, entity, entityId, metaStr, ip]
    );
  } catch (err) {
    // never break a request because of audit logging
    console.warn('[audit] failed:', err.message);
  }
}

function auditMiddleware(req, _res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    // fire and forget
    auditLog(req, `${req.method} ${req.originalUrl}`);
  }
  next();
}

module.exports = { auditLog, auditMiddleware };
