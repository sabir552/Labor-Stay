/**
 * JWT auth middleware.
 *   - authRequired       — must be logged in
 *   - requireRole(...)   — must have one of the roles
 *   - optionalAuth       — attach req.user if a valid token is present, else continue
 */
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'laborstay_secret_key_change_me_in_prod';

function extractToken(req) {
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

async function loadUser(decoded) {
  const { rows } = await db.query(
    'SELECT id, role, full_name, email, phone, preferred_language, is_active, is_verified FROM users WHERE id = $1',
    [decoded.id]
  );
  return rows[0] || null;
}

async function authRequired(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(decoded);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ error: 'Account disabled' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden — requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

async function optionalAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) return next();
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(decoded);
    if (user && user.is_active) req.user = user;
  } catch { /* ignore */ }
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

module.exports = { authRequired, requireRole, optionalAuth, signToken };
