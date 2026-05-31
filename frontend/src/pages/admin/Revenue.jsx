import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatSAR } from '../../utils/formatters';

export default function Revenue() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    get('/admin/revenue').then(setData).catch(() => setData({ daily: [], by_city: [], top_owners: [] }));
  }, []);

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  const totalGross = data.daily.reduce((s, d) => s + d.gross, 0);
  const totalCommission = data.daily.reduce((s, d) => s + d.commission, 0);
  const totalCount = data.daily.reduce((s, d) => s + d.count, 0);
  const maxGross = Math.max(1, ...data.daily.map((d) => d.gross));

  return (
    <div className="space-y-5">
      <SectionHeader title={t('admin.revenue')} subtitle="Last 30 days" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Gross (30d)"        value={formatSAR(totalGross, i18n.language)} icon="💵" accent="navy" />
        <StatCard label="Our commission"     value={formatSAR(totalCommission, i18n.language)} icon="💰" accent="gold" />
        <StatCard label="Paid payments"      value={totalCount} icon="✓" accent="emerald" />
        <StatCard label="Avg booking"        value={totalCount ? formatSAR(totalGross / totalCount, i18n.language) : '—'} icon="📊" accent="blue" />
      </div>

      {/* Daily chart */}
      <div className="card p-5">
        <h3 className="font-semibold text-navy mb-3">Daily gross revenue (SAR)</h3>
        {data.daily.length === 0 && <div className="text-sm text-slate-500 text-center py-6">No paid payments in the last 30 days yet.</div>}
        {data.daily.length > 0 && (
          <div className="flex items-end gap-1 h-48 pt-2">
            {data.daily.map((d) => {
              const h = (d.gross / maxGross) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.day}: ${formatSAR(d.gross, i18n.language)}`}>
                  <div className="w-full bg-navy hover:bg-gold transition-colors rounded-t" style={{ height: `${h}%`, minHeight: '2px' }} />
                  <div className="text-[8px] text-slate-400 rotate-45 origin-bottom-left whitespace-nowrap">{d.day.slice(5)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two columns */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Revenue by city</h3>
          {data.by_city.length === 0 && <div className="text-sm text-slate-500">No data yet.</div>}
          {data.by_city.map((c) => {
            const max = Math.max(1, ...data.by_city.map((x) => x.gross));
            return (
              <div key={c.city} className="mb-3">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-slate-700">{c.city}</span>
                  <span className="font-semibold text-navy">{formatSAR(c.gross, i18n.language)} <span className="text-[10px] text-slate-400">({c.count})</span></span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gold" style={{ width: `${(c.gross / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Top earning partners</h3>
          {data.top_owners.length === 0 && <div className="text-sm text-slate-500">No data yet.</div>}
          {data.top_owners.map((o, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
              <div className="w-8 h-8 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-navy truncate">{o.company_name || o.owner_name}</div>
                <div className="text-xs text-slate-500">{o.bookings} bookings</div>
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy text-sm">{formatSAR(o.gross, i18n.language)}</div>
                <div className="text-[10px] text-emerald-700">+{formatSAR(o.our_commission, i18n.language)} commission</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
