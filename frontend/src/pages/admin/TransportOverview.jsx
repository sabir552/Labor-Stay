import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatSAR } from '../../utils/formatters';

export default function TransportOverview() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    get('/transport/admin/overview').then(setData).catch(() => setData({ stats: {}, by_owner: [] }));
  }, []);

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;
  const s = data.stats || {};
  const maxRev = Math.max(1, ...data.by_owner.map((o) => parseFloat(o.revenue || 0)));

  return (
    <div className="space-y-5">
      <SectionHeader title={t('transport.overviewTitle', 'Transportation overview')}
        subtitle={t('transport.overviewSubtitle', 'Platform-wide fleet and route metrics')} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('transport.totalVehicles', 'Total vehicles')} value={`${s.vehicles_active || 0}/${s.vehicles_total || 0}`} icon="🚌" />
        <StatCard label={t('transport.totalRoutes', 'Active routes')}    value={`${s.routes_active || 0}/${s.routes_total || 0}`}     icon="🛣️" accent="gold" />
        <StatCard label={t('transport.totalBookings', 'Total bookings')} value={s.bookings_total || 0}                                  icon="🎫" accent="blue" />
        <StatCard label={t('transport.totalRevenue', 'Total revenue')}   value={formatSAR(s.total_revenue || 0, i18n.language)}        icon="💰" accent="emerald" />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-navy">{t('transport.byOwner', 'Top owners')}</h3>
        </div>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-start px-4 py-2">Owner</th>
              <th className="text-end px-4 py-2">Vehicles</th>
              <th className="text-end px-4 py-2">Routes</th>
              <th className="text-end px-4 py-2">Bookings</th>
              <th className="text-end px-4 py-2">Revenue</th>
              <th className="text-start px-4 py-2">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.by_owner.map((o, i) => {
              const rev = parseFloat(o.revenue || 0);
              const pct = Math.round((rev / maxRev) * 100);
              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-navy">{o.company_name || o.owner_name}</div>
                  </td>
                  <td className="px-4 py-2 text-end">{o.vehicles}</td>
                  <td className="px-4 py-2 text-end">{o.routes}</td>
                  <td className="px-4 py-2 text-end">{o.bookings}</td>
                  <td className="px-4 py-2 text-end font-semibold">{formatSAR(rev, i18n.language)}</td>
                  <td className="px-4 py-2">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-32">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.by_owner.length === 0 && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">No transportation data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
