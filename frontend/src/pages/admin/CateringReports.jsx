import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatSAR } from '../../utils/formatters';

export default function CateringReports() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    get('/catering/reports/admin').then(setData).catch(() => setData({ camps: [], totals: { meals_served: 0, revenue: 0, camps: 0 } }));
  }, []);

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  const maxRevenue = Math.max(1, ...data.camps.map((c) => parseFloat(c.revenue || 0)));

  return (
    <div className="space-y-5">
      <SectionHeader title={t('catering.reportsTitle', 'Catering reports')}
        subtitle={t('catering.reportsSubtitle', 'Platform-wide food consumption and revenue')} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('catering.activeCamps', 'Camps offering catering')} value={data.totals?.camps || 0} icon="🏕️" />
        <StatCard label={t('catering.totalMeals', 'Meals served')}               value={data.totals?.meals_served || 0} icon="🍽️" accent="emerald" />
        <StatCard label={t('catering.totalRevenue', 'Total catering revenue')}  value={formatSAR(data.totals?.revenue || 0, i18n.language)} icon="💰" accent="gold" />
        <StatCard label={t('catering.platformCommission', 'Platform commission (10%)')}
          value={formatSAR((data.totals?.revenue || 0) * 0.10, i18n.language)} icon="📈" accent="navy" />
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-navy">{t('catering.byCamp', 'By camp')}</h3>
          <a href="/api/admin/export/bookings?format=csv" className="link text-xs">↓ {t('common.export', 'Export')}</a>
        </div>
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-start px-4 py-2">Camp</th>
              <th className="text-start px-4 py-2">City</th>
              <th className="text-end px-4 py-2">Menus</th>
              <th className="text-end px-4 py-2">Packages</th>
              <th className="text-end px-4 py-2">Meals served</th>
              <th className="text-end px-4 py-2">Revenue</th>
              <th className="text-start px-4 py-2">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.camps.map((c) => {
              const rev = parseFloat(c.revenue || 0);
              const pct = Math.round((rev / maxRevenue) * 100);
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-navy">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.city}</td>
                  <td className="px-4 py-2 text-end">{c.menus}</td>
                  <td className="px-4 py-2 text-end">{c.packages}</td>
                  <td className="px-4 py-2 text-end">{c.meals_served}</td>
                  <td className="px-4 py-2 text-end font-semibold">{formatSAR(rev, i18n.language)}</td>
                  <td className="px-4 py-2">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden w-32">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.camps.length === 0 && (
              <tr><td colSpan="7" className="px-4 py-8 text-center text-slate-500">No catering data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
