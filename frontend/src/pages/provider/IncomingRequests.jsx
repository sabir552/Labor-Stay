import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function IncomingRequests() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [quoteTarget, setQuoteTarget] = useState(null);
  const [price, setPrice] = useState('');

  const load = () => get('/services/requests/my').then((r) => setItems(r.requests || [])).catch(() => setItems([]));
  useEffect(load, []);

  const sendQuote = async () => {
    try {
      await put(`/services/requests/${quoteTarget.id}/quote`, { quoted_price: parseFloat(price) });
      toast.success('Quote sent');
      setQuoteTarget(null); setPrice('');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Incoming RFQs" subtitle={items ? `${items.length} requests` : ''} />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && <EmptyState icon="📥" title="No requests yet" body="When clients request quotes for your services, they appear here." />}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-navy">{r.service_name}</div>
                    <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    From {r.client_name} · qty {r.quantity}{r.required_date && ` · for ${formatDate(r.required_date)}`}
                  </div>
                  <p className="text-sm text-slate-700 mt-2 whitespace-pre-line">{r.description}</p>
                  <div className="text-[10px] text-slate-400 font-mono mt-2">{r.request_code} · {formatDate(r.created_at)}</div>
                </div>
                <div className="text-end shrink-0">
                  {r.quoted_price && (
                    <div className="mb-2">
                      <div className="text-xs text-slate-500">Your quote</div>
                      <div className="font-bold text-navy">{formatSAR(r.quoted_price, i18n.language)}</div>
                    </div>
                  )}
                  {r.status === 'pending' && (
                    <button onClick={() => { setQuoteTarget(r); setPrice(''); }} className="btn-primary btn-sm">Send quote</button>
                  )}
                  {r.client_email && r.status !== 'pending' && (
                    <a href={`mailto:${r.client_email}`} className="btn-outline btn-sm">📧 Email</a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!quoteTarget} onClose={() => setQuoteTarget(null)} title={`Quote: ${quoteTarget?.service_name}`}
        footer={<>
          <button onClick={() => setQuoteTarget(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={sendQuote} disabled={!price} className="btn-primary">Send quote</button>
        </>}>
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Quote for {quoteTarget?.quantity} unit(s):</p>
          <label className="label">Total price (SAR) *</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input" placeholder="e.g. 12500" />
        </div>
      </Modal>
    </div>
  );
}
