import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatCard, SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import { SkeletonRow } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function OwnerHome() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [camps, setCamps] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [payments, setPayments] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => setCamps(r.camps || [])).catch(() => setCamps([]));
    get('/bookings/owner-bookings').then((r) => setBookings(r.bookings || [])).catch(() => setBookings([]));
    get('/payments/my-payments').then((r) => setPayments(r.payments || [])).catch(() => setPayments([]));
  }, []);

  const stats = {
    camps: camps?.length || 0,
    rooms: (camps || []).reduce((s, c) => s + (c.total_capacity || 0), 0),
    occupancy: (camps || []).length ? Math.round((camps || []).reduce((s, c) => s + (c.occupancy_pct || 0), 0) / camps.length) : 0,
    pending: (bookings || []).filter((b) => b.status === 'pending').length,
    earnings: (payments || []).filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0),
  };

  const pending = (bookings || []).filter((b) => b.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-navy to-navy-600 text-white rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold">{t('owner.dashboard')}</h1>
        <p className="text-navy-100 mt-1">Hi {user?.full_name?.split(' ')[0]} — here's how your camps are doing today.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label={t('owner.myCamps')} value={stats.camps} icon="🏕️" />
        <StatCard label="Total beds" value={stats.rooms} icon="🛏️" accent="blue" />
        <StatCard label={t('owner.occupancy')} value={`${stats.occupancy}%`} icon="📊" accent="emerald" />
        <StatCard label="Pending requests" value={stats.pending} icon="⏳" accent="gold" />
        <StatCard label="Gross earnings" value={formatSAR(stats.earnings, i18n.language)} icon="💰" accent="emerald" />
      </div>

      {/* Pending requests */}
      <section>
        <SectionHeader title={t('owner.bookingRequests')} subtitle="Pending approvals — please review"
          action={<Link to="/owner/bookings" className="btn-outline btn-sm">{t('common.viewDetails')}</Link>} />
        {bookings === null && <div className="card"><SkeletonRow /><SkeletonRow /></div>}
        {bookings && pending.length === 0 && (
          <EmptyState icon="✅" title="No pending requests" body="All caught up!" />
        )}
        {bookings && pending.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {pending.slice(0, 5).map((b) => (
              <Link key={b.id} to={`/owner/bookings/${b.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50">
                <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">⏳</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-navy truncate">{b.worker_name} → {b.camp_name}</div>
                  <div className="text-xs text-slate-500">{b.room_name} · {formatDate(b.start_date)} → {formatDate(b.end_date)}</div>
                </div>
                <div className="text-end">
                  <div className="font-semibold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                  <span className={`badge mt-1 ${statusBadgeClass(b.status)}`}>{b.status}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* My camps occupancy */}
      <section>
        <SectionHeader title={t('owner.myCamps')} action={<Link to="/owner/camps/new" className="btn-primary btn-sm">+ {t('owner.addCamp')}</Link>} />
        {camps === null && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>}
        {camps && camps.length === 0 && (
          <EmptyState icon="🏕️" title="No camps yet" body="Create your first camp listing."
            action={<Link to="/owner/camps/new" className="btn-primary">{t('owner.addCamp')}</Link>} />
        )}
        {camps && camps.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {camps.map((c) => (
              <Link key={c.id} to={`/owner/camps/${c.id}/rooms`} className="card p-4 hover:shadow-lift transition">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`badge ${c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                  {c.is_featured && <span className="badge bg-gold text-white">★</span>}
                </div>
                <h4 className="font-semibold text-navy truncate">{c.name}</h4>
                <div className="text-xs text-slate-500">{c.city}</div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>{t('owner.occupancy')}</span>
                    <span className="font-semibold text-navy">{c.occupancy_pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${c.occupancy_pct}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{c.total_available} / {c.total_capacity} beds available</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
