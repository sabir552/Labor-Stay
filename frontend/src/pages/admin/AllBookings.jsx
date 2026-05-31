import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import { debounce } from '../../utils/helpers';

const STATUSES = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'rejected'];

export default function AllBookings() {
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState(null);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const load = () => {
    const qp = {};
    if (status !== 'all') qp.status = status;
    if (q) qp.q = q;
    get('/admin/bookings', qp).then((r) => setBookings(r.bookings || [])).catch(() => setBookings([]));
  };
  useEffect(load, [status, q]);

  const debouncedQ = useMemo(() => debounce((v) => setQ(v), 300), []);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('admin.allBookings')} subtitle={bookings ? `${bookings.length} bookings` : ''} />

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${status === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
            {s === 'all' ? t('common.all') : t(`booking.${s.replace(/_/g, '')}`, s)}
          </button>
        ))}
        <input
          type="search" defaultValue={q}
          onChange={(e) => debouncedQ(e.target.value)}
          placeholder="🔍 Search code or camp…"
          className="input !py-2 max-w-xs ms-auto"
        />
      </div>

      {bookings === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {bookings && bookings.length === 0 && <div className="card p-8 text-center text-slate-500">No bookings match.</div>}

      {bookings && bookings.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-start px-4 py-3">Code</th>
                <th className="text-start px-4 py-3">Camp / Room</th>
                <th className="text-start px-4 py-3">Worker</th>
                <th className="text-start px-4 py-3">Dates</th>
                <th className="text-end px-4 py-3">Total</th>
                <th className="text-start px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bookings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{b.booking_code}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-navy">{b.camp_name}</div>
                    <div className="text-xs text-slate-500">{b.room_name} · {b.city}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{b.worker_name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{formatDate(b.start_date)} → {formatDate(b.end_date)}</td>
                  <td className="px-4 py-3 text-end font-semibold text-navy">{formatSAR(b.total_amount, i18n.language)}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
