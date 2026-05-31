import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDateTime } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function Disputes() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [target, setTarget] = useState(null);
  const [resolution, setResolution] = useState('');

  const load = () => get('/admin/disputes').then((r) => setItems(r.disputes || [])).catch(() => setItems([]));
  useEffect(load, []);

  const resolve = async () => {
    try {
      await put(`/admin/disputes/${target.id}`, { status: 'resolved', resolution });
      toast.success('Dispute resolved');
      setTarget(null); setResolution('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('admin.disputes')} subtitle={items ? `${items.length} disputes` : ''} />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && (
        <EmptyState icon="✅" title="No disputes" body="All clear — no open issues right now." />
      )}

      {items && items.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {items.map((d) => (
            <div key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-navy">{d.subject || `Dispute #${d.id}`}</h4>
                    <span className={`badge ${d.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{d.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">By {d.raised_by_name || 'Unknown'} {d.booking_code && `· booking ${d.booking_code}`}</div>
                  {d.description && <p className="text-sm text-slate-700 mt-2">{d.description}</p>}
                  {d.resolution && (
                    <div className="mt-2 bg-emerald-50 border-s-2 border-emerald-500 p-2 text-xs text-emerald-800">
                      <b>Resolution:</b> {d.resolution}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-400 mt-2">{formatDateTime(d.created_at)}</div>
                </div>
                {d.status === 'open' && (
                  <button onClick={() => { setTarget(d); setResolution(''); }} className="btn-primary btn-sm">Resolve</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={`Resolve: ${target?.subject || `Dispute #${target?.id}`}`}
        footer={<>
          <button onClick={() => setTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={resolve} className="btn-primary">Resolve</button>
        </>}>
        <label className="label">Resolution notes</label>
        <textarea rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} className="input" placeholder="What was decided? Will be visible to both parties." />
      </Modal>
    </div>
  );
}
