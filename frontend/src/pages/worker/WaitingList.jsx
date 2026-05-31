import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function WaitingList() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [entries, setEntries] = useState(null);

  const load = () => get('/waiting-list/my-list').then((r) => setEntries(r.entries || [])).catch(() => setEntries([]));
  useEffect(load, []);

  const leave = async (id) => {
    if (!confirm('Remove yourself from this waiting list?')) return;
    await del(`/waiting-list/${id}`);
    toast.success('Removed from waiting list');
    load();
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('nav.waitingList')} subtitle="Rooms you'll be notified about when a bed opens up" />

      {entries === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {entries && entries.length === 0 && (
        <EmptyState
          icon="⏳" title="Not on any waiting list"
          body="When a room is full, we'll offer to add you here automatically."
          action={<Link to="/search" className="btn-primary">{t('common.search')}</Link>}
        />
      )}

      {entries && entries.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {entries.map((e) => (
            <div key={e.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-navy">{e.camp_name}</div>
                  <div className="text-xs text-slate-500">{e.room_name} · {e.city}</div>
                </div>
                <span className="badge bg-amber-100 text-amber-800">{e.status}</span>
              </div>
              {e.requested_date && (
                <div className="text-xs text-slate-500 mt-2">Requested for: {formatDate(e.requested_date)}</div>
              )}
              {e.price_per_day != null && (
                <div className="text-xs text-slate-500">Price: {formatSAR(e.price_per_day, i18n.language)}{t('common.perDay')}</div>
              )}
              {e.notified_at && (
                <div className="text-xs text-emerald-700 mt-1">✓ Notified: a bed has opened</div>
              )}
              <div className="flex gap-2 mt-3">
                <Link to="/search" className="btn-outline btn-sm">View similar</Link>
                <button onClick={() => leave(e.id)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">Leave</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
