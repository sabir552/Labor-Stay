import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatSAR, formatDate } from '../../utils/formatters';

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];

export default function PriceAlerts() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  const reload = () => get('/price-alerts/mine').then((r) => setAlerts(r.alerts || []));
  useEffect(() => { reload(); }, []);

  const openNew = () => { setForm({ city: '', camp_type: '', room_type: '', max_price: 100, is_active: true }); setOpen(true); };
  const openEdit = (a) => { setForm({ ...a, is_active: !!a.is_active }); setOpen(true); };

  const save = async () => {
    try {
      if (form.id) await put(`/price-alerts/${form.id}`, form);
      else         await post('/price-alerts', form);
      toast.success(t('alerts.saved', 'Alert saved'));
      setOpen(false);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const remove = async (id) => {
    if (!confirm(t('alerts.confirmDelete', 'Delete this alert?'))) return;
    await del(`/price-alerts/${id}`);
    toast.success(t('alerts.deleted', 'Alert deleted'));
    reload();
  };

  const toggle = async (a) => {
    await put(`/price-alerts/${a.id}`, { is_active: !a.is_active });
    reload();
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('alerts.title', 'Price alerts')}
        subtitle={t('alerts.subtitle', "We'll notify you when rooms matching your criteria become available")}
        action={<button onClick={openNew} className="btn-primary btn-sm">+ {t('alerts.new', 'New alert')}</button>} />

      {alerts.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          <div className="text-5xl mb-3">🔔</div>
          {t('alerts.empty', 'No price alerts yet. Create one to get notified when matching rooms appear.')}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {alerts.map((a) => (
            <div key={a.id} className={`card p-4 ${a.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-navy">{a.city || t('alerts.anyCity', 'Any city')}</div>
                  <div className="text-xs text-slate-500 capitalize">
                    {a.camp_type || 'any type'} · {a.room_type?.replace('_', ' ') || 'any room'}
                  </div>
                </div>
                <span className={`badge ${a.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {a.is_active ? t('common.available', 'active') : 'paused'}
                </span>
              </div>
              <div className="mt-2 text-sm">
                {a.max_price && (
                  <span>{t('alerts.maxPrice', 'Max')}: <b className="text-navy">{formatSAR(a.max_price, i18n.language)}{t('common.perDay')}</b></span>
                )}
              </div>
              {a.nationality_pref && (
                <div className="text-xs text-slate-500 mt-1">Nationality: {a.nationality_pref}</div>
              )}
              {a.last_notified && (
                <div className="text-[10px] text-slate-400 mt-1">Last notified: {formatDate(a.last_notified)}</div>
              )}
              <div className="flex gap-1 mt-3">
                <button onClick={() => openEdit(a)} className="btn-outline btn-sm">✎</button>
                <button onClick={() => toggle(a)} className="btn-ghost btn-sm">{a.is_active ? '⏸' : '▶'}</button>
                <button onClick={() => remove(a.id)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} size="md"
        title={form?.id ? t('alerts.edit', 'Edit alert') : t('alerts.new', 'New alert')}
        footer={<>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={save} className="btn-primary">{t('common.save')}</button>
        </>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('common.city')}</label>
                <select value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input">
                  <option value="">{t('alerts.anyCity', 'Any city')}</option>
                  {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className="label">{t('search.campType')}</label>
                <select value={form.camp_type || ''} onChange={(e) => setForm({ ...form, camp_type: e.target.value })} className="input">
                  <option value="">Any</option>
                  <option value="standard">Standard</option>
                  <option value="executive">Executive</option>
                  <option value="istira">Istira</option>
                </select></div>
              <div><label className="label">{t('search.roomType')}</label>
                <select value={form.room_type || ''} onChange={(e) => setForm({ ...form, room_type: e.target.value })} className="input">
                  <option value="">Any</option>
                  <option value="standard">Standard</option>
                  <option value="executive">Executive</option>
                  <option value="bed_space">Bed space</option>
                </select></div>
              <div><label className="label">{t('alerts.maxPriceLabel', 'Max price (SAR/day)')}</label>
                <input type="number" min="1" value={form.max_price || ''} onChange={(e) => setForm({ ...form, max_price: parseFloat(e.target.value || 0) })} className="input" /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded text-navy" />
              {t('alerts.active', 'Active')}
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
