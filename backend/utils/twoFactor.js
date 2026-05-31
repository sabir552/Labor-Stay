/**
 * 2FA helper (F1) — wraps speakeasy with graceful fallbacks if the
 * package is missing.
 *
 *   generateSecret(label)  -> { base32, otpauth_url }
 *   verifyToken(secret, token) -> bool
 *   generateBackupCodes(n=8) -> [string]
 *   hashBackupCodes(arr)    -> [bcryptHash]
 *   verifyBackupCode(arr, plain) -> { matchedHash, remaining } | null
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

let speakeasy = null;
try { speakeasy = require('speakeasy'); } catch (e) { /* graceful */ }

const APP_NAME = process.env.TWO_FA_APP_NAME || 'LaborStay';
const ISSUER   = process.env.TWO_FA_ISSUER   || 'LaborStay.SA';

function generateSecret(accountLabel = 'user') {
  if (speakeasy) {
    const s = speakeasy.generateSecret({
      name: `${APP_NAME}:${accountLabel}`,
      issuer: ISSUER,
      length: 20,
    });
    return { base32: s.base32, otpauth_url: s.otpauth_url };
  }
  // Fallback: random 20-byte base32-ish secret (no TOTP verify possible)
  const secret = crypto.randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi, '').slice(0, 32).toUpperCase();
  const url = `otpauth://totp/${encodeURIComponent(APP_NAME)}:${encodeURIComponent(accountLabel)}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}`;
  return { base32: secret, otpauth_url: url };
}

function verifyToken(secret, token) {
  if (!secret || !token) return false;
  if (!speakeasy) {
    // Fallback: accept "000000" only in development so the dev flow works.
    return process.env.NODE_ENV !== 'production' && String(token) === '000000';
  }
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: String(token), window: 1 });
}

function generateBackupCodes(n = 8) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    // 4-4 alphanumeric groups, e.g. "A1B2-C3D4"
    const b = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${b.slice(0, 4)}-${b.slice(4, 8)}`);
  }
  return codes;
}

async function hashBackupCodes(codes) {
  const out = [];
  for (const c of codes) out.push(await bcrypt.hash(c, 8));
  return out;
}

async function verifyBackupCode(hashedCodes, plain) {
  if (!Array.isArray(hashedCodes)) return null;
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(plain, hashedCodes[i])) {
      const remaining = hashedCodes.filter((_, idx) => idx !== i);
      return { matchedIndex: i, remaining };
    }
  }
  return null;
}

module.exports = {
  generateSecret, verifyToken,
  generateBackupCodes, hashBackupCodes, verifyBackupCode,
  available: !!speakeasy,
};
