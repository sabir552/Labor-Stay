/**
 * Cache abstraction (I3).
 *
 * If REDIS_URL is set AND the `redis` package is installed, uses Redis.
 * Otherwise falls back to an in-memory Map with TTL — never crashes.
 *
 * API:
 *   get(key)              -> any | null
 *   set(key, val, ttl)    -> Promise<void>   (ttl in seconds)
 *   del(key | prefix*)    -> Promise<void>   (prefix delete supported)
 *   wrap(key, ttl, fn)    -> cached fn() result (auto-fetch on miss)
 *   stats()               -> { driver, size, hits, misses }
 */

let driver = 'memory';
let redis = null;

const mem = new Map(); // key -> { val, exp }
let hits = 0;
let misses = 0;

const REDIS_URL = process.env.REDIS_URL || '';

if (REDIS_URL) {
  try {
    // Lazy-require so a missing 'redis' package doesn't crash the app.
    const { createClient } = require('redis');
    redis = createClient({ url: REDIS_URL });
    redis.on('error', (e) => console.warn('[cache:redis] error:', e.message));
    redis.connect().then(() => { driver = 'redis'; console.log('[cache] using Redis at', REDIS_URL); })
      .catch((e) => { console.warn('[cache] Redis connect failed, falling back to memory:', e.message); redis = null; });
  } catch (e) {
    console.warn('[cache] redis package not installed, using in-memory cache.');
    redis = null;
  }
}

function nowMs() { return Date.now(); }

async function get(key) {
  if (redis && driver === 'redis') {
    const v = await redis.get(key);
    if (v == null) { misses++; return null; }
    hits++;
    try { return JSON.parse(v); } catch { return v; }
  }
  const e = mem.get(key);
  if (!e) { misses++; return null; }
  if (e.exp && e.exp < nowMs()) { mem.delete(key); misses++; return null; }
  hits++;
  return e.val;
}

async function set(key, val, ttlSeconds = 300) {
  if (redis && driver === 'redis') {
    await redis.set(key, JSON.stringify(val), { EX: ttlSeconds });
    return;
  }
  const exp = ttlSeconds > 0 ? nowMs() + ttlSeconds * 1000 : 0;
  mem.set(key, { val, exp });
}

async function del(keyOrPrefix) {
  if (redis && driver === 'redis') {
    if (keyOrPrefix.endsWith('*')) {
      const prefix = keyOrPrefix.slice(0, -1);
      for await (const k of redis.scanIterator({ MATCH: prefix + '*' })) {
        await redis.del(k);
      }
    } else {
      await redis.del(keyOrPrefix);
    }
    return;
  }
  if (keyOrPrefix.endsWith('*')) {
    const prefix = keyOrPrefix.slice(0, -1);
    for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k);
  } else {
    mem.delete(keyOrPrefix);
  }
}

async function wrap(key, ttlSeconds, fn) {
  const cached = await get(key);
  if (cached !== null && cached !== undefined) return cached;
  const fresh = await fn();
  if (fresh !== undefined) await set(key, fresh, ttlSeconds);
  return fresh;
}

function stats() {
  return { driver, size: driver === 'memory' ? mem.size : null, hits, misses };
}

module.exports = { get, set, del, wrap, stats, get driver() { return driver; } };
