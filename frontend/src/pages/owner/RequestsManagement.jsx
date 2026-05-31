import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDateTime, statusBadgeClass } from '../../utils/formatters';

const PRIORITY_COLOR = {
  emergency: 'bg-rose-100 text-rose-700',
  high:      'bg-amber-100 text-amber-800',
  medium:    'bg-blue-100 text-blue-700',
  low:       'bg-slate-100 text-slate-600',
};

export default function RequestsManagement() {
  const { t } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState([]);
  const [campId, setCampId] = useState(null);
  const [requests, setRequests] = useState([]);
  const [types, setTypes] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [target, setTarget] = useState(null);    // request currently being resolved
  const [notes, setNotes] = useState('');
  const [renewal, setRenewal] = useState(null);   // renewal we're approving/rejecting

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
    get('/worker-requests/types').then((r) => setTypes(r.types || []));
  }, []);

  const reload = async () => {
    if (!campId) return;
    const r = await get(`/worker-requests/camp/${campId}`);
    setRequests(r.requests || []);
  };
  useEffect(() => { reload(); }, [campId]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const updateStatus = async (status) => {
    if (!target) return;
    try {
      // Special-case contract_extension → use renewal endpoint
      if (target.request_type === 'contract_extension' && target.booking_id) {
        if (status === 'resolved') {
          await put(`/bookings/${target.booking_id}/renewal-request/approve`, {});
          toast.success(t('owner.renewalApproved', 'Renewal approved — new booking created'));
        } else if (status === 'rejected') {
          await put(`/bookings/${target.booking_id}/renewal-request/reject`, { reason: notes });
          toast.success(t('owner.renewalRejected', 'Renewal rejected'));
        }
      } else {
        await put(`/worker-requests/${target.id}/status`, { status, response_notes: notes });
        toast.success(t('owner.requestUpdated', 'Request updated'));
      }
      setTarget(null); setNotes('');
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    emergency: requests.filter((r) => r.priority === 'emergency' && r.status !== 'resolved').length,
  }), [requests]);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('owner.requestsTitle', 'Service requests')}
        subtitle={t('owner.requestsSubtitle', 'Manage worker requests sorted by priority')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('owner.totalReq', 'Total')}        value={stats.total}        icon="📋" />
        <StatCard label={t('owner.pendingReq', 'Pending')}    value={stats.pending}      icon="⏳" accent="gold" />
        <StatCard label={t('owner.inProgressReq', 'In progress')} value={stats.in_progress} icon="🔧" accent="blue" />
        <StatCard label={t('owner.emergencyReq', 'Emergency open')} value={stats.emergency} icon="🚨" accent="rose" />
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'pending', 'in_progress', 'resolved', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              statusFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
            }`}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
        ) : filtered.map((r) => {
          const meta = types.find((tt) => tt.type === r.request_type);
          const isRenewal = r.request_type === 'contract_extension';
          return (
            <div key={r.id} className="p-3 flex items-start gap-3">
              <div className="text-2xl">{meta?.icon || '📋'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-navy">{r.title}</span>
                  <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status?.replace('_', ' ')}</span>
                  <span className={`badge ${PRIORITY_COLOR[r.priority]}`}>{r.priority}</span>
                  {isRenewal && <span className="badge bg-gold/20 text-gold-600">renewal</span>}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {meta?.label} · {r.worker_name}{r.worker_phone && ` · ${r.worker_phone}`}
                </div>
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-line">{r.description}</p>
                {r.response_notes && (
                  <div className="text-xs bg-emerald-50 border-s-2 border-emerald-500 p-2 mt-2 text-emerald-800">
                    {r.response_notes}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-1">{formatDateTime(r.created_at)}</div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {r.status !== 'resolved' && r.status !== 'rejected' && (
                  <button onClick={() => { setTarget(r); setNotes(''); }} className="btn-primary btn-sm">
                    {isRenewal ? t('owner.review', 'Review') : t('owner.resolve', 'Resolve')}
                  </button>
                )}
                {r.worker_email && (
                  <a href={`mailto:${r.worker_email}`} className="btn-ghost btn-sm">📧</a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Resolve modal */}
      <Modal open={!!target} onClose={() => setTarget(null)} size="md"
        title={target ? `${target.title}` : ''}
        footer={target && target.request_type === 'contract_extension' ? (
          <>
            <button onClick={() => setTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
            <button onClick={() => updateStatus('rejected')} className="btn-outline text-rose-600 border-rose-300">
              {t('owner.reject', 'Reject')}
            </button>
            <button onClick={() => updateStatus('resolved')} className="btn-primary">
              {t('owner.approveRenewal', 'Approve renewal')}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
            <button onClick={() => updateStatus('rejected')} className="btn-outline text-rose-600 border-rose-300">
              {t('owner.reject', 'Reject')}
            </button>
            <button onClick={() => updateStatus('in_progress')} className="btn-outline">
              {t('owner.markInProgress', 'In progress')}
            </button>
            <button onClick={() => updateStatus('resolved')} className="btn-primary">
              ✓ {t('owner.markResolved', 'Resolve')}
            </button>
          </>
        )}>
        {target && (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded p-3 text-sm">
              <div className="font-semibold text-navy mb-1">{target.title}</div>
              <div className="text-xs text-slate-500 mb-2">
                {target.worker_name} · priority {target.priority}
              </div>
              <p className="text-sm whitespace-pre-line text-slate-700">{target.description}</p>
            </div>
            <div>
              <label className="label">{t('owner.responseNotes', 'Response notes (visible to worker)')}</label>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="input"
                placeholder={t('owner.notesPlaceholder', 'e.g. Plumber scheduled for tomorrow morning')} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
