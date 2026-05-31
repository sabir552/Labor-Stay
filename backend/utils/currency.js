/**
 * Multi-currency support (E1).
 *
 * All prices are STORED in SAR. Display conversion happens here.
 *
 * Strategy:
 *   - Try exchangerate.host (free, no API key needed) once per hour
 *   - On any failure: fall back to hardcoded mid-market rates (updated periodically)
 *   - Cache in memory (or Redis when REDIS_URL is set, via cache module)
 *
 * NOTE: rates here are SAR → other currency (1 SAR = X currency)
 */
const cache = require('./cache');

const SUPPORTED = ['SAR', 'USD', 'EUR', 'GBP', 'PKR', 'INR', 'BDT', 'EGP', 'PHP'];

const SYMBOLS = {
  SAR: 'ر.س', USD: '$', EUR: '€', GBP: '£',
  PKR: '₨', INR: '₹', BDT: '৳', EGP: 'E£', PHP: '₱',
};

// Hardcoded fallback (mid-market 2026). 1 SAR = X target_currency.
const FALLBACK_RATES = {
  SAR: 1.0,
  USD: 0.267,
  EUR: 0.246,
  GBP: 0.211,
  PKR: 74.5,
  INR: 22.4,
  BDT: 29.3,
  EGP: 13.2,
  PHP: 14.9,
};

const CACHE_KEY = 'fx:sar:rates';
const CACHE_TTL = 3600;       // 1 hour

let lastFetchAttempt = 0;
const MIN_RETRY_GAP = 5 * 60 * 1000; // back off 5 min on failure

async function fetchLiveRates() {
  // Throttle failed-fetch retries
  if (Date.now() - lastFetchAttempt < MIN_RETRY_GAP) return null;
  lastFetchAttempt = Date.now();

  try {
    const symbols = SUPPORTED.filter((s) => s !== 'SAR').join(',');
    const url = `https://api.exchangerate.host/latest?base=SAR&symbols=${symbols}`;
    // Node 18+ has global fetch
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.rates) throw new Error('No rates in response');

    const rates = { SAR: 1.0 };
    for (const ccy of SUPPORTED) {
      if (ccy === 'SAR') continue;
      const r = parseFloat(data.rates[ccy]);
      rates[ccy] = Number.isFinite(r) && r > 0 ? r : FALLBACK_RATES[ccy];
    }
    return rates;
  } catch (e) {
    console.warn('[currency] fetch failed:', e.message);
    return null;
  }
}

async function getRates() {
  const cached = await cache.get(CACHE_KEY);
  if (cached) return cached;

  const live = await fetchLiveRates();
  const rates = live || { ...FALLBACK_RATES };
  await cache.set(CACHE_KEY, rates, CACHE_TTL);
  return rates;
}

function isSupported(ccy) {
  return SUPPORTED.includes(String(ccy || '').toUpperCase());
}

async function convert(amountSar, target) {
  const ccy = String(target || 'SAR').toUpperCase();
  if (!isSupported(ccy) || ccy === 'SAR') return Number(amountSar) || 0;
  const rates = await getRates();
  return Math.round((Number(amountSar) * rates[ccy]) * 100) / 100;
}

async function meta() {
  const rates = await getRates();
  return {
    base: 'SAR',
    supported: SUPPORTED,
    symbols: SYMBOLS,
    rates,
    fetched_at: new Date().toISOString(),
    using_fallback: !(await cache.get(CACHE_KEY)) || JSON.stringify(rates) === JSON.stringify(FALLBACK_RATES),
  };
}

module.exports = { getRates, convert, meta, isSupported, SUPPORTED, SYMBOLS, FALLBACK_RATES };
