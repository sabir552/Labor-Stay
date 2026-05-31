import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatSAR, formatDateTime } from '../../utils/formatters';

export default function PayoutRequests() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const reload = async () => {
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
    const r = await get('/payouts' + qs);
    setData(r);
  };
  useEffect(() => { reload(); }, [statusFilter]);

  const approve = async (id) => {
    try { await put(`/payouts/${id}/approve`, {}); toast.success(t('payouts.approved', 'Approved & marked paid')); reload(); }
    catch (e) { toast.error(e.message); }
  };

  const reject = async () => {
    try { await put(`/payouts/${rejectTarget.id}/reject`, { reason: rejectReason });
      toast.success(t('payouts.rejected', 'Rejected')); setRejectTarget(null); reload(); }
    catch (e) { toast.error(e.message); }
  };

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  const totals = (data.requests || []).reduce((acc, r) => {
    const a = parseFloat(r.amount || 0);
    if (r.status === 'paid') acc.paid += a;
    else if (r.status === 'pending') acc.pending += a;
    else if (r.status === 'rejected') acc.rejected += a;
    return acc;
  }, { paid: 0, pending: 0, rejected: 0 });

  return (
    <div className="space-y-4">
      <SectionHeader title={t('payouts.adminTitle', 'Payout requests')}
        subtitle={t('payouts.adminSubtitle', 'Approve or reject owner payout requests')} />

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('payouts.pendingAmount', 'Pending')} value={formatSAR(totals.pending, i18n.language)} icon="⏳" accent="gold" />
        <StatCard label={t('payouts.paidAmount', 'Paid')} value={formatSAR(totals.paid, i18n.language)} icon="✓" accent="emerald" />
        <StatCard label={t('payouts.rejectedAmount', 'Rejected')} value={formatSAR(totals.rejected, i18n.language)} icon="✕" accent="rose" />
      </div>

      <div className="flex gap-2">
        {['all', 'pending', 'paid', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize ${
              statusFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
            }`}>{s}</button>
        ))}
      </div>

      <div className="card divide-y divide-slate-100">
        {(data.requests || []).length === 0 && (
          <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
        )}
        {(data.requests || []).map((r) => (
          <div key={r.id} className="p-4 flex items-start gap-3">
            <div className="text-2xl">💰</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-navy">{r.company_name || r.owner_name}</span>
                <span className={`badge ${
                  r.status === 'paid' ? 'bg-emerald-100 text-emerald-800'
                  : r.status === 'pending' ? 'bg-amber-100 text-amber-800'
                  : r.status === 'rejected' ? 'bg-rose-100 text-rose-700'
                  : 'bg-slate-100 text-slate-600'
                }`}>{r.status}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{r.owner_email}</div>
              {r.iban && <div className="text-xs text-slate-500 font-mono">IBAN: {r.iban}</div>}
              {r.bank_name && <div className="text-xs text-slate-500">{r.bank_name}{r.account_holder && ` · ${r.account_holder}`}</div>}
              {r.admin_notes && (
                <div className="text-xs bg-slate-50 border-s-2 border-slate-300 p-2 mt-2 text-slate-700">
                  {r.admin_notes}
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-1">
                Requested {formatDateTime(r.created_at)}
                {r.processed_at && ` · Processed ${formatDateTime(r.processed_at)}`}
              </div>
            </div>
            <div className="text-end shrink-0">
              <div className="font-bold text-navy text-lg">{formatSAR(r.amount, i18n.language)}</div>
              {r.status === 'pending' && (
                <div className="flex gap-1 mt-2 justify-end">
                  <button onClick={() => approve(r.id)} className="btn-primary btn-sm">✓ Approve</button>
                  <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕ Reject</button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* REJECT MODAL */}
      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} size="sm"
        title={rejectTarget ? `Reject payout — ${formatSAR(rejectTarget.amount, i18n.language)}` : ''}
        footer={<>
          <button onClick={() => setRejectTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={reject} className="btn bg-rose-600 text-white hover:bg-rose-700 px-5 py-2.5">Reject</button>
        </>}>
        <label className="label">Reason (visible to owner)</label>
        <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input"
          placeholder="e.g. IBAN mismatch — please contact support" />
      </Modal>
    </div>
  );
}
