import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatSAR, statusBadgeClass } from '../../utils/formatters';

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function BookingCalendar() {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(thisMonth());
  const [data, setData] = useState(null);

  useEffect(() => {
    get(`/worker/calendar?month=${month}`).then(setData).catch(() => setData({ bookings: [] }));
  }, [month]);

  // Build calendar grid
  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay(); // 0=Sun
  const lastDay = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);

  function bookingsOnDate(date) {
    if (!data?.bookings) return [];
    return data.bookings.filter((b) => date >= b.start_date && date <= b.end_date);
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('calendar.title', 'Booking calendar')}
        subtitle={t('calendar.subtitle', 'Your bookings at a glance')} />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonth(shiftMonth(month, -1))} className="btn-ghost btn-sm">← prev</button>
          <div className="font-bold text-navy text-lg">
            {new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} className="btn-ghost btn-sm">next →</button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs uppercase text-slate-500 font-semibold py-1">{d}</div>
          ))}
          {cells.map((date, i) => (
            <div key={i} className={`min-h-[80px] rounded p-1 border ${date ? 'bg-white border-slate-200' : 'bg-slate-50 border-transparent'}`}>
              {date && (
                <>
                  <div className="text-xs text-slate-400 text-end">{parseInt(date.split('-')[2], 10)}</div>
                  <div className="space-y-0.5">
                    {bookingsOnDate(date).slice(0, 2).map((b) => (
                      <Link key={b.id} to={`/worker/bookings/${b.id}`}
                        className={`block text-[10px] px-1 py-0.5 rounded truncate ${
                          b.status === 'checked_in' ? 'bg-emerald-100 text-emerald-800'
                          : b.status === 'confirmed' ? 'bg-blue-100 text-blue-800'
                          : b.status === 'pending' ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                        }`}
                        title={`${b.camp_name} (${b.status})`}>
                        {b.camp_name.slice(0, 12)}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-navy">{t('calendar.thisMonth', 'Bookings this month')}</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(data?.bookings || []).length === 0 && <div className="p-6 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
          {(data?.bookings || []).map((b) => (
            <Link key={b.id} to={`/worker/bookings/${b.id}`} className="block p-3 hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-navy-50 text-navy flex items-center justify-center">🏠</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-navy">{b.camp_name}</div>
                  <div className="text-xs text-slate-500">{b.room_name} · {b.start_date} → {b.end_date}</div>
                </div>
                <div className="text-end">
                  <div className="font-semibold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                  <span className={`badge ${statusBadgeClass(b.status)}`}>{b.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
