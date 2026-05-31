import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { SkeletonRow } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

const STATUSES = ['all', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'rejected'];

export default function MyBookings() {
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    get('/bookings/my-bookings').then((r) => setBookings(r.bookings || [])).catch(() => setBookings([]));
  }, []);

  const filtered = useMemo(() => {
    if (!bookings) return null;
    if (filter === 'all') return bookings;
    return bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('booking.myBookings')} subtitle={`${bookings?.length || 0} total`} />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const count = s === 'all' ? bookings?.length || 0 : (bookings || []).filter((b) => b.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'
              }`}
            >
              {s === 'all' ? t('common.all') : t(`booking.${s.replace(/_/g, '')}`, s)}
              <span className="ms-1.5 opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered === null && (
        <div className="card divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {filtered && filtered.length === 0 && (
        <EmptyState
          icon="📭" title="No bookings here"
          body={filter === 'all' ? 'Find a camp and make your first booking.' : `No ${filter} bookings.`}
          action={<Link to="/search" className="btn-primary">{t('common.search')}</Link>}
        />
      )}

      {filtered && filtered.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {filtered.map((b) => (
            <Link key={b.id} to={`/worker/bookings/${b.id}`} className="block p-4 hover:bg-slate-50">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-navy to-navy-600 text-white flex items-center justify-center text-xl shrink-0">🏠</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-navy">{b.camp_name}</div>
                    <span className={`badge ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{b.room_name} · {b.city}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {formatDate(b.start_date)} → {formatDate(b.end_date)} · {b.occupants} {t('common.occupants').toLowerCase()}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">{b.booking_code}</div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-bold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                  <div className="text-[10px] text-slate-400">{t('common.total')}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
