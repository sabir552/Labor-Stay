import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatDateTime } from '../../utils/formatters';

export default function ERPSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState({ logs: [], totals: {} });
  const [syncing, setSyncing] = useState(false);

  const reload = async () => {
    const [s, l] = await Promise.all([
      get('/erp/status'),
      get('/erp/sync/logs'),
    ]);
    setStatus(s); setLogs(l);
  };
  useEffect(() => { reload(); }, []);

  const sync = async (kind) => {
    setSyncing(true);
    try {
      const r = await post(`/erp/sync/${kind}`, { limit: 20 });
      toast.success(`${kind}: ${r.pushed} pushed`);
      reload();
    } catch (e) { toast.error(e.message); }
    finally { setSyncing(false); }
  };

  const manualFull = async () => {
    setSyncing(true);
    try {
      const r = await post('/erp/sync/manual', {});
      toast.success(`Full sync: ${JSON.stringify(r.counts)}`);
      reload();
    } catch (e) { toast.error(e.message); }
    finally { setSyncing(false); }
  };

  if (!status) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={t('erp.title', 'ERP integration')}
        subtitle={t('erp.subtitle', 'Sync bookings, payments, and invoices to your ERP system')} />

      <div className="card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">{t('erp.type', 'ERP type')}</div>
          <div className="text-2xl font-bold text-navy capitalize">{status.erp_type}</div>
          {status.api_url && <div className="text-xs text-slate-500 mt-1 font-mono">{status.api_url}</div>}
        </div>
        <div className="text-end">
          {status.configured
            ? <span className="badge bg-emerald-100 text-emerald-800">✓ Configured</span>
            : <span className="badge bg-amber-100 text-amber-800">Not configured</span>}
          {status.sync_interval_min && (
            <div className="text-xs text-slate-500 mt-1">{t('erp.syncEvery', 'Sync every')} {status.sync_interval_min} min</div>
          )}
        </div>
      </div>

      {!status.configured && (
        <div className="card p-4 bg-amber-50 border-amber-200 text-sm text-amber-800">
          <b>⚠️ ERP not configured.</b> Set <code className="text-xs bg-amber-100 px-1 rounded">ERP_TYPE</code>,{' '}
          <code className="text-xs bg-amber-100 px-1 rounded">ERP_API_URL</code>,{' '}
          <code className="text-xs bg-amber-100 px-1 rounded">ERP_API_KEY</code> in <code>backend/.env</code>.
          Until then, sync calls are logged but not transmitted. Supported types: SAP, Odoo, Zoho.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={() => sync('bookings')} disabled={syncing} className="card p-4 hover:shadow-lift transition text-start">
          <div className="text-2xl">📋</div>
          <div className="font-semibold text-navy mt-1">{t('erp.syncBookings', 'Sync bookings')}</div>
          <div className="text-xs text-slate-500">Push last 20 bookings</div>
        </button>
        <button onClick={() => sync('payments')} disabled={syncing} className="card p-4 hover:shadow-lift transition text-start">
          <div className="text-2xl">💳</div>
          <div className="font-semibold text-navy mt-1">{t('erp.syncPayments', 'Sync payments')}</div>
          <div className="text-xs text-slate-500">Push paid payments</div>
        </button>
        <button onClick={() => sync('invoices')} disabled={syncing} className="card p-4 hover:shadow-lift transition text-start">
          <div className="text-2xl">📄</div>
          <div className="font-semibold text-navy mt-1">{t('erp.syncInvoices', 'Sync invoices')}</div>
          <div className="text-xs text-slate-500">Push corporate invoices</div>
        </button>
        <button onClick={() => sync('customers')} disabled={syncing} className="card p-4 hover:shadow-lift transition text-start">
          <div className="text-2xl">👥</div>
          <div className="font-semibold text-navy mt-1">{t('erp.syncCustomers', 'Sync customers')}</div>
          <div className="text-xs text-slate-500">Push active users</div>
        </button>
      </div>

      <div className="flex justify-center">
        <button onClick={manualFull} disabled={syncing} className="btn-gold">
          🔄 {syncing ? t('common.loading') : t('erp.manualFull', 'Manual full sync')}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('erp.success', 'Success')} value={logs.totals.success || 0} icon="✓" accent="emerald" />
        <StatCard label={t('erp.pending', 'Pending')} value={logs.totals.pending || 0} icon="⏳" accent="gold" />
        <StatCard label={t('erp.failed', 'Failed')} value={logs.totals.failed || 0} icon="✕" accent="rose" />
        <StatCard label={t('erp.totalLogs', 'Total events')} value={logs.logs.length} icon="📜" accent="navy" />
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-navy">{t('erp.recentLogs', 'Recent sync events')}</h3>
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-slate-100">
          {logs.logs.length === 0 && <div className="p-6 text-center text-sm text-slate-500">{t('common.noData')}</div>}
          {logs.logs.slice(0, 100).map((l) => (
            <div key={l.id} className="p-2 px-4 flex items-center gap-3 text-sm">
              <span className={`badge ${
                l.status === 'success' ? 'bg-emerald-100 text-emerald-800'
                : l.status === 'failed' ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-800'
              }`}>{l.status}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-navy">{l.sync_type} → {l.entity_type} #{l.entity_id || '—'}</div>
                {l.error_message && <div className="text-xs text-rose-600">{l.error_message}</div>}
              </div>
              <div className="text-[10px] text-slate-400">{formatDateTime(l.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
