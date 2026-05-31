// Money & date formatters used across the app.

export function formatSAR(amount, lang = 'en') {
  const locale = lang === 'ar' ? 'ar-SA' : lang === 'ur' ? 'ur-PK' : 'en-SA';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(Number(amount) || 0);
  } catch {
    return `SAR ${Number(amount || 0).toFixed(2)}`;
  }
}

// DD/MM/YYYY display per spec
export function formatDate(dateStr, lang = 'en') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

export function formatDateTime(dateStr, lang = 'en') {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${formatDate(dateStr, lang)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function daysBetween(start, end) {
  if (!start || !end) return 0;
  const s = new Date(start); const e = new Date(end);
  return Math.max(1, Math.ceil((e - s) / 86400000));
}

export function statusBadgeClass(status) {
  const m = {
    pending:      'bg-amber-100 text-amber-800',
    confirmed:    'bg-emerald-100 text-emerald-800',
    checked_in:   'bg-blue-100 text-blue-800',
    checked_out:  'bg-slate-100 text-slate-700',
    cancelled:    'bg-rose-100 text-rose-700',
    rejected:     'bg-rose-100 text-rose-700',
    approved:     'bg-emerald-100 text-emerald-800',
    available:    'bg-emerald-100 text-emerald-800',
    rented:       'bg-blue-100 text-blue-800',
    paid:         'bg-emerald-100 text-emerald-800',
    refunded:     'bg-slate-100 text-slate-700',
    quoted:       'bg-blue-100 text-blue-800',
    accepted:     'bg-emerald-100 text-emerald-800',
    declined:     'bg-rose-100 text-rose-700',
    completed:    'bg-slate-100 text-slate-700',
  };
  return m[status] || 'bg-slate-100 text-slate-700';
}

export function initials(name = '?') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
}
