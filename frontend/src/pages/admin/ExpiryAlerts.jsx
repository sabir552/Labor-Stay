import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatDate } from '../../utils/formatters';

const STATUS_COLOR = {
  expired:  'bg-rose-100 text-rose-700',
  urgent:   'bg-amber-100 text-amber-800',
  soon:     'bg-blue-100 text-blue-700',
  upcoming: 'bg-slate-100 text-slate-600',
};
const STATUS_ICON = { expired: '🚫', urgent: '🚨', soon: '⚠️', upcoming: 'ℹ️' };

export default function ExpiryAlerts() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [days, setDays] = useState(60);
  const [includeExpired, setIncludeExpired] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams({ days: String(days), include_expired: String(includeExpired) });
    get('/admin/expiry-alerts?' + qs.toString())
      .then(setData)
      .catch(() => setData({ alerts: [], summary: {} }));
  }, [days, includeExpired]);

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={t('expiry.title', 'Iqama & passport expiry alerts')}
        subtitle={t('expiry.subtitle', 'Workers and staff with documents expiring soon')} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('expiry.total', 'Total alerts')} value={data.summary?.total || 0} icon="⚠️" />
        <StatCard label={t('expiry.expired', 'Expired')}   value={data.summary?.expired || 0} icon="🚫" accent="rose" />
        <StatCard label={t('expiry.urgent', 'Urgent (≤7d)')} value={data.summary?.urgent || 0} icon="🚨" accent="gold" />
        <StatCard label={t('expiry.soon', 'Soon (≤30d)')}   value={data.summary?.soon || 0}   icon="⏰" accent="blue" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600 flex items-center gap-2">
          {t('expiry.window', 'Window')}:
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))} className="input !py-1 !text-sm max-w-[120px]">
            {[7, 14, 30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-600 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeExpired} onChange={(e) => setIncludeExpired(e.target.checked)} className="rounded text-navy" />
          {t('expiry.includeExpired', 'Include already-expired')}
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-start px-4 py-3">{t('expiry.subject', 'Person')}</th>
              <th className="text-start px-4 py-3">{t('expiry.kind', 'Kind')}</th>
              <th className="text-start px-4 py-3">{t('expiry.doc', 'Document')}</th>
              <th className="text-start px-4 py-3">{t('expiry.expiry', 'Expiry')}</th>
              <th className="text-start px-4 py-3">{t('expiry.status', 'Status')}</th>
              <th className="text-start px-4 py-3">{t('expiry.contact', 'Contact')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data.alerts || []).length === 0 && (
              <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">{t('expiry.noAlerts', '🎉 No expiry alerts in this window.')}</td></tr>
            )}
            {(data.alerts || []).map((a, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="font-medium text-navy">{a.subject}</div>
                  {a.camp_name && <div className="text-xs text-slate-500">{a.camp_name}</div>}
                </td>
                <td className="px-4 py-2">
                  <span className="badge bg-slate-100 text-slate-700">
                    {a.kind === 'worker_iqama' ? '👷 Worker' : '🛡️ Staff'}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-700">
                  {a.doc_type}
                  {a.doc_number && <span className="text-xs text-slate-400 font-mono ms-2">{a.doc_number}</span>}
                </td>
                <td className="px-4 py-2 text-slate-700">{formatDate(a.expiry)}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${STATUS_COLOR[a.status]}`}>
                    {STATUS_ICON[a.status]} {a.status}
                    {a.status === 'expired'
                      ? ` ${a.days_overdue}d overdue`
                      : ` in ${a.days_remaining}d`}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600 text-xs">{a.contact || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        ℹ️ {t('expiry.cronNote', 'Email + WhatsApp + in-app notifications are sent automatically at 60, 30, and 7 days before expiry by the platform cron job.')}
      </p>
    </div>
  );
}
