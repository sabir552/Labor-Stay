import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatCard, SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import { SkeletonRow } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function WorkerHome() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [bookings, setBookings] = useState(null);
  const [notif, setNotif] = useState(null);

  useEffect(() => {
    get('/bookings/my-bookings').then((r) => setBookings(r.bookings || [])).catch(() => setBookings([]));
    get('/notifications').then((r) => setNotif(r)).catch(() => setNotif({ notifications: [], unread_count: 0 }));
  }, []);

  const upcoming = (bookings || []).filter((b) => ['confirmed', 'pending', 'checked_in'].includes(b.status));
  const stats = {
    total: bookings?.length || 0,
    upcoming: upcoming.length,
    completed: (bookings || []).filter((b) => b.status === 'checked_out').length,
    unread: notif?.unread_count || 0,
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-navy to-navy-600 text-white rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold">Ahlan, {user?.full_name?.split(' ')[0]} 👋</h1>
        <p className="text-navy-100 mt-1">{t('booking.myBookings')} & quick search at a glance</p>
        <Link to="/search" className="inline-flex mt-4 btn-gold">🔍 {t('common.search')} {t('nav.camps').toLowerCase()}</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('booking.myBookings')} value={stats.total} icon="📋" />
        <StatCard label="Upcoming" value={stats.upcoming} icon="📅" accent="gold" />
        <StatCard label="Completed" value={stats.completed} icon="✓" accent="emerald" />
        <StatCard label="Unread" value={stats.unread} icon="🔔" accent="blue" />
      </div>

      {/* Upcoming bookings */}
      <section>
        <SectionHeader
          title="Upcoming stays"
          subtitle="Bookings that need your attention"
          action={<Link to="/worker/bookings" className="btn-outline btn-sm">{t('common.viewDetails')}</Link>}
        />
        {bookings === null && <div className="card divide-y divide-slate-100"><SkeletonRow /><SkeletonRow /></div>}
        {bookings && upcoming.length === 0 && (
          <EmptyState
            icon="🏕️" title="No upcoming bookings"
            body="Find your next camp and book in minutes."
            action={<Link to="/search" className="btn-primary">{t('common.search')}</Link>}
          />
        )}
        {bookings && upcoming.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {upcoming.slice(0, 5).map((b) => (
              <Link key={b.id} to={`/worker/bookings/${b.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                <div className="w-10 h-10 rounded-lg bg-navy-50 text-navy flex items-center justify-center">🏠</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-navy truncate">{b.camp_name}</div>
                  <div className="text-xs text-slate-500">{b.room_name} · {formatDate(b.start_date)} → {formatDate(b.end_date)}</div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-semibold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                  <span className={`badge mt-1 ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent notifications */}
      <section>
        <SectionHeader title={t('nav.notifications')} action={<Link to="/worker/notifications" className="btn-outline btn-sm">{t('common.viewDetails')}</Link>} />
        {notif === null && <div className="card divide-y divide-slate-100"><SkeletonRow /><SkeletonRow /></div>}
        {notif && notif.notifications.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-500">{t('common.noData')}</div>
        )}
        {notif && notif.notifications.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {notif.notifications.slice(0, 4).map((n) => (
              <Link key={n.id} to={n.link || '#'} className={`flex items-start gap-3 p-3 hover:bg-slate-50 ${n.is_read ? '' : 'bg-navy-50/30'}`}>
                <span className={`mt-1.5 w-2 h-2 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-gold'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{n.title}</div>
                  {n.body && <div className="text-xs text-slate-500 line-clamp-1">{n.body}</div>}
                </div>
                <div className="text-[10px] text-slate-400">{formatDate(n.created_at)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
