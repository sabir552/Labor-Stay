import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function MyServiceRequests() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);

  const load = () => get('/services/requests/my').then((r) => setItems(r.requests || [])).catch(() => setItems([]));
  useEffect(load, []);

  const respond = async (id, status) => {
    try { await put(`/services/requests/${id}/status`, { status }); toast.success(`Request ${status}`); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Service requests"
        subtitle={items ? `${items.length} requests` : ''}
        action={<Link to="/services" className="btn-outline btn-sm">Browse services</Link>} />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && <EmptyState icon="📋" title="No service requests yet" action={<Link to="/services" className="btn-primary">Browse services</Link>} />}

      {items && items.length > 0 && (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-navy">{r.service_name}</div>
                    <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status}</span>
                  </div>
                  <div className="text-xs text-slate-500 capitalize">{r.category?.replace('_', ' ')}{r.city && ` · ${r.city}`}</div>
                  <p className="text-sm text-slate-700 mt-2">{r.description}</p>
                  <div className="text-[10px] text-slate-400 font-mono mt-2">
                    {r.request_code} · qty {r.quantity}{r.required_date && ` · for ${formatDate(r.required_date)}`}
                  </div>
                </div>
                <div className="text-end shrink-0">
                  {r.quoted_price ? (
                    <>
                      <div className="text-xs text-slate-500">Quote</div>
                      <div className="font-bold text-navy">{formatSAR(r.quoted_price, i18n.language)}</div>
                    </>
                  ) : (
                    <div className="text-xs text-slate-400">Awaiting quote</div>
                  )}
                </div>
              </div>
              {r.status === 'quoted' && (
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button onClick={() => respond(r.id, 'accepted')} className="btn-primary btn-sm">✓ Accept quote</button>
                  <button onClick={() => respond(r.id, 'declined')} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕ Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
