import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDate } from '../../utils/formatters';

const STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'all'];

export default function CampsVerification() {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending';
  const [camps, setCamps] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = () => {
    const qp = status === 'all' ? {} : { status };
    get('/admin/camps', qp).then((r) => setCamps(r.camps || [])).catch(() => setCamps([]));
  };
  useEffect(load, [status]);

  const setStatus = (s) => {
    const n = new URLSearchParams(params);
    if (s === 'pending') n.delete('status'); else n.set('status', s);
    setParams(n, { replace: true });
  };

  const verify = async (id, newStatus) => {
    try {
      await put(`/admin/camps/${id}/verify`, { status: newStatus });
      toast.success(`Camp ${newStatus}`);
      load();
    } catch (e) { toast.error(e.message); }
  };
  const toggleFeatured = async (id) => {
    try {
      const r = await put(`/admin/camps/${id}/featured`);
      toast.success(r.is_featured ? 'Featured ★' : 'Unfeatured');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('admin.campsVerification')} subtitle={`${camps?.length || 0} camps · status: ${status}`} />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize transition ${status === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
            {s === 'all' ? t('common.all') : s}
          </button>
        ))}
      </div>

      {camps === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {camps && camps.length === 0 && <div className="card p-8 text-center text-slate-500">No camps in this state.</div>}

      {camps && camps.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {camps.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <h4 className="font-semibold text-navy truncate">{c.name}</h4>
                  <div className="text-xs text-slate-500">{c.city} · {c.owner_name}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`badge capitalize ${c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'pending' ? 'bg-amber-100 text-amber-800' : c.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                  {c.is_featured ? <span className="badge bg-gold text-white">★</span> : null}
                </div>
              </div>
              <div className="text-xs text-slate-500 line-clamp-2 mb-2">{c.description}</div>
              <div className="text-[10px] text-slate-400 mb-3">
                Licence: {c.licence_number || '—'} · cap {c.capacity || 0} · {formatDate(c.created_at)}
              </div>
              <div className="flex flex-wrap gap-1">
                <Link to={`/camps/${c.id}`} target="_blank" className="btn-ghost btn-sm">👁 View</Link>
                {c.status !== 'approved' && (
                  <button onClick={() => verify(c.id, 'approved')} className="btn-primary btn-sm">✓ Approve</button>
                )}
                {c.status !== 'rejected' && (
                  <button onClick={() => { setRejectTarget(c); setRejectReason(''); }} className="btn-outline btn-sm text-rose-700 border-rose-300">✕ Reject</button>
                )}
                {c.status === 'approved' && (
                  <>
                    <button onClick={() => toggleFeatured(c.id)} className="btn-outline btn-sm">{c.is_featured ? 'Unfeature' : '★ Feature'}</button>
                    <button onClick={() => verify(c.id, 'suspended')} className="btn-ghost btn-sm text-amber-700">Suspend</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title={`Reject: ${rejectTarget?.name}`}
        footer={<>
          <button onClick={() => setRejectTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={() => { verify(rejectTarget.id, 'rejected'); setRejectTarget(null); }}
            className="btn bg-rose-600 text-white hover:bg-rose-700 px-5 py-2.5">Reject</button>
        </>}>
        <p className="text-sm text-slate-600 mb-2">The owner will be notified. (Reason is internal.)</p>
        <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input" placeholder="Reason (optional)" />
      </Modal>
    </div>
  );
}
