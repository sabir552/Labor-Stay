import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDateTime } from '../../utils/formatters';

export default function AuditLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    get('/admin/audit-logs', { limit: 200 }).then((r) => setLogs(r.logs || [])).catch(() => setLogs([]));
  }, []);

  const filtered = (logs || []).filter((l) =>
    !filter || (l.action || '').toLowerCase().includes(filter.toLowerCase())
    || (l.full_name || '').toLowerCase().includes(filter.toLowerCase())
    || (l.entity || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <SectionHeader title={t('admin.auditLogs')} subtitle={logs ? `${logs.length} entries` : ''} />

      <input
        type="search" value={filter} onChange={(e) => setFilter(e.target.value)}
        placeholder="🔍 Filter by action, user or entity…"
        className="input max-w-md"
      />

      {logs === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {logs && filtered.length === 0 && <div className="card p-8 text-center text-slate-500">No log entries.</div>}

      {logs && filtered.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-start px-4 py-3">When</th>
                <th className="text-start px-4 py-3">User</th>
                <th className="text-start px-4 py-3">Action</th>
                <th className="text-start px-4 py-3">Entity</th>
                <th className="text-start px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.slice(0, 200).map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">{formatDateTime(l.created_at)}</td>
                  <td className="px-4 py-2">
                    <div className="font-medium text-navy">{l.full_name || 'System'}</div>
                    <div className="text-xs text-slate-500">{l.email || '—'}</div>
                  </td>
                  <td className="px-4 py-2"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{l.action}</code></td>
                  <td className="px-4 py-2 text-xs text-slate-600">{l.entity ? `${l.entity} #${l.entity_id || '?'}` : '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-400 font-mono">{l.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
