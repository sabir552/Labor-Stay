import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { StatCard, SectionHeader } from '../../components/layout/DashboardLayout';
import { formatSAR, formatDateTime } from '../../utils/formatters';
import { SkeletonRow } from '../../components/common/Skeleton';

export default function AdminHome() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    get('/admin/dashboard').then(setData).catch(() => setData({ stats: {}, alerts: [], recent_activity: [] }));
  }, []);

  if (!data) {
    return <div className="space-y-4"><SkeletonRow /><SkeletonRow /></div>;
  }

  const s = data.stats || {};

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-navy via-navy-600 to-navy-700 text-white rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold">{t('admin.dashboard')}</h1>
        <p className="text-navy-100 mt-1">Real-time pulse of the LaborStay platform</p>
      </div>

      {/* Alerts */}
      {data.alerts?.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.alerts.map((a, i) => (
            <Link
              key={i}
              to={a.type === 'pending_camps' ? '/admin/camps?status=pending'
                 : a.type === 'pending_iqama' ? '/admin/users?role=worker'
                 : '/admin/disputes'}
              className="card p-4 border-s-4 border-amber-500 bg-amber-50 hover:shadow-lift"
            >
              <div className="text-amber-800 font-medium text-sm">⚠️ {a.message}</div>
              <div className="text-xs text-amber-600 mt-1">{a.count} item(s) need attention →</div>
            </Link>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total users" value={s.users || 0} icon="👥" />
        <StatCard label="Workers"     value={s.workers || 0} icon="🧰" accent="blue" />
        <StatCard label="Owners"      value={s.owners || 0} icon="🏢" accent="navy" />
        <StatCard label="Providers"   value={s.providers || 0} icon="🚛" accent="gold" />

        <StatCard label="Camps"            value={s.camps || 0} icon="🏕️" />
        <StatCard label="Approved camps"   value={s.approved_camps || 0} icon="✓"  accent="emerald" />
        <StatCard label="Pending camps"    value={s.pending_camps || 0} icon="⏳" accent="gold" />
        <StatCard label="Featured"         value={s.featured_camps || 0} icon="★" accent="gold" />

        <StatCard label="Rooms"            value={s.rooms || 0} icon="🛏️" />
        <StatCard label="Total bookings"   value={s.bookings || 0} icon="📋" />
        <StatCard label="Confirmed bookings" value={s.confirmed_bookings || 0} icon="✅" accent="emerald" />
        <StatCard label="Reviews"          value={s.reviews || 0} icon="⭐" accent="gold" />

        <StatCard label="Gross revenue"      value={formatSAR(s.revenue_gross || 0, i18n.language)} icon="💵" accent="emerald" />
        <StatCard label="Platform commission" value={formatSAR(s.revenue_commission || 0, i18n.language)} icon="💰" accent="gold" />
        <StatCard label="Equipment"         value={s.equipment || 0} icon="🚜" accent="blue" />
        <StatCard label="Services"          value={s.services || 0} icon="🛠️" accent="navy" />
      </div>

      {/* Recent activity */}
      <section>
        <SectionHeader title="Recent activity" subtitle="Last 10 mutating actions across the platform"
          action={<Link to="/admin/audit-logs" className="btn-outline btn-sm">{t('common.viewDetails')}</Link>} />
        <div className="card divide-y divide-slate-100">
          {(data.recent_activity || []).length === 0 && (
            <div className="p-6 text-center text-sm text-slate-500">No recent activity.</div>
          )}
          {(data.recent_activity || []).map((a) => (
            <div key={a.id} className="p-3 flex items-start gap-3 text-sm">
              <span className="text-base mt-0.5">📝</span>
              <div className="flex-1 min-w-0">
                <div className="text-slate-800">
                  <b>{a.full_name || 'System'}</b> — <span className="text-navy">{a.action}</span>
                  {a.entity && <span className="text-slate-500"> on {a.entity} #{a.entity_id}</span>}
                </div>
                <div className="text-[10px] text-slate-400">{formatDateTime(a.created_at)} · {a.ip || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
