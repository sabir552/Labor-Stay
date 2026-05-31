import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatSAR } from '../../utils/formatters';
import StarRating from '../../components/common/StarRating';

export default function ServiceDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [form, setForm] = useState({ description: '', required_date: '', quantity: 1 });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    get(`/services/${id}`).then(setData);
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { toast.info('Please sign in to submit a quote request'); nav(`/login?next=/services/${id}`); return; }
    setSending(true);
    try {
      const r = await post('/services/requests', { service_id: parseInt(id, 10), ...form });
      toast.success(`Request ${r.request.request_code} sent to provider`);
      nav('/worker/service-requests');
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  if (!data?.service) return <div className="max-w-3xl mx-auto py-24 text-center text-slate-500">{t('common.loading')}</div>;
  const s = data.service;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="text-xs text-slate-500 mb-3">
        <Link to="/" className="hover:text-navy">{t('nav.home')}</Link> ›{' '}
        <Link to="/services" className="hover:text-navy">{t('nav.services')}</Link> ›{' '}
        <span className="text-navy">{s.name}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <div className="h-44 bg-gradient-to-br from-gold to-gold-500 flex items-center justify-center text-7xl">
              🛠️
            </div>
            <div className="p-5">
              <span className="badge bg-navy-50 text-navy capitalize">{s.category?.replace('_', ' ')}</span>
              <h1 className="text-2xl font-bold text-navy mt-2">{s.name}</h1>
              <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                <StarRating value={s.rating} size={14} />
                {s.city && <span>📍 {s.city}</span>}
              </div>
              <p className="text-slate-600 mt-3 whitespace-pre-line">{s.description}</p>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">Pricing</h3>
            <div className="text-3xl font-bold text-navy">{formatSAR(s.base_price, i18n.language)}</div>
            <div className="text-sm text-slate-500 capitalize">{(s.pricing_type || 'fixed').replace(/_/g, ' ')}</div>
            <p className="text-xs text-slate-400 mt-2">Final price will be quoted by the provider based on your requirements.</p>
          </div>

          {data.provider && (
            <div className="card p-5">
              <h3 className="font-semibold text-navy mb-2">Provider</h3>
              <div className="text-sm font-medium text-navy">{data.provider.company_name || data.provider.full_name}</div>
              {data.provider.phone && <div className="text-xs text-slate-500">📞 {data.provider.phone}</div>}
            </div>
          )}
        </div>

        {/* RFQ form */}
        <div className="lg:col-span-1">
          <form onSubmit={submit} className="card p-5 sticky top-20 space-y-3">
            <h3 className="font-semibold text-navy">Request for quotation</h3>
            <div>
              <label className="label !mb-1 text-xs">Quantity</label>
              <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value || '1', 10) })} className="input !py-2 text-sm" />
            </div>
            <div>
              <label className="label !mb-1 text-xs">Required date (optional)</label>
              <input type="date" value={form.required_date} onChange={(e) => setForm({ ...form, required_date: e.target.value })} className="input !py-2 text-sm" />
            </div>
            <div>
              <label className="label !mb-1 text-xs">Tell the provider what you need *</label>
              <textarea rows={5} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input text-sm"
                placeholder="e.g. Catering for 80 workers, 3 meals per day, for 30 days starting 1 August at our Riyadh camp." />
            </div>
            <button type="submit" disabled={sending} className="btn-gold w-full">
              {sending ? t('common.loading') : 'Send RFQ'}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Provider will respond with a custom quote.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
