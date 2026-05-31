/**
 * Saudi VAT (15%) and platform commission (10%) calculations.
 * All amounts in SAR. We treat the listed price as VAT-EXCLUSIVE base.
 *
 *   base       — price entered by the owner
 *   vat        — 15% of base
 *   commission — 10% of base (platform fee, taken from owner share)
 *   total      — base + vat       (what the worker pays)
 *   netToOwner — base - commission (what the owner receives)
 */
const { VAT_RATE, COMMISSION_RATE } = require('../config/constants');

function round2(n) { return Math.round(n * 100) / 100; }

function computeBooking(base) {
  const b = Number(base) || 0;
  const vat = round2(b * VAT_RATE);
  const commission = round2(b * COMMISSION_RATE);
  const total = round2(b + vat);
  const netToOwner = round2(b - commission);
  return {
    base: round2(b),
    vat,
    commission,
    total,
    netToOwner,
    vatRate: VAT_RATE,
    commissionRate: COMMISSION_RATE,
  };
}

function formatSAR(n) {
  return new Intl.NumberFormat('en-SA', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
  }).format(n || 0);
}

module.exports = { computeBooking, round2, formatSAR };
