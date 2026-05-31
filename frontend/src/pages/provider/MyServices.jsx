import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatSAR } from '../../utils/formatters';

const CATEGORIES = [
  { v: 'labour_supply',       l: 'Labour supply' },
  { v: 'catering',            l: 'Catering' },
  { v: 'transportation',      l: 'Transportation' },
  { v: 'facility_management', l: 'Facility management' },
  { v: 'cleaning',            l: 'Cleaning' },
  { v: 'security',            l: 'Security' },
  { v: 'laundry',             l: 'Laundry' },
  { v: 'portable_office',     l: 'Portable office' },
  { v: 'container_rental',    l: 'Container rental' },
];
const CITIES = ['', 'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];

const empty = { category: 'catering', name: '', description: '', pricing_type: 'per_unit', base_price: 100, city: '', is_active: true };

export default function MyServices() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  const load = () => get('/services', { limit: 100 }).then((r) => setItems((r.services || []).filter((s) => s.provider_id === user.id)));
  useEffect(load, [user.id]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setForm(empty); setModal('new'); };
  const openEdit = (s) => { setForm({ ...s }); setModal(s); };

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'new') { await post('/services', form); toast.success('Service added'); }
      else { await put(`/services/${modal.id}`, form); toast.success('Service updated'); }
      setModal(null); load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try { await del(`/services/${delTarget.id}`); toast.success('Service removed'); load(); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="My services" subtitle={items ? `${items.length} services` : ''}
        action={<button onClick={openNew} className="btn-primary btn-sm">+ Add service</button>} />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && <div className="card p-8 text-center text-slate-500">No services yet — add your first one.</div>}

      {items && items.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <h4 className="font-semibold text-navy">{s.name}</h4>
                  <div className="text-xs text-slate-500 capitalize">{s.category?.replace('_', ' ')}{s.city && ` · ${s.city}`}</div>
                </div>
                {!s.is_active && <span className="badge bg-rose-100 text-rose-700">Inactive</span>}
              </div>
              <p className="text-xs text-slate-500 line-clamp-2 my-2">{s.description}</p>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <div className="font-bold text-navy">{formatSAR(s.base_price, i18n.language)}</div>
                  <div className="text-[10px] text-slate-500">{(s.pricing_type || 'fixed').replace(/_/g, ' ')}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="btn-outline btn-sm">✎</button>
                  <button onClick={() => setDelTarget(s)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal === 'new' ? 'Add service' : `Edit: ${form.name}`}
        footer={<>
          <button onClick={() => setModal(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
        </>}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Category *</label>
              <select value={form.category} onChange={(e) => set('category', e.target.value)} className="input">
                {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">City</label>
              <select value={form.city} onChange={(e) => set('city', e.target.value)} className="input">
                {CITIES.map((c) => <option key={c} value={c}>{c || 'Multiple cities'}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Pricing type</label>
              <select value={form.pricing_type} onChange={(e) => set('pricing_type', e.target.value)} className="input">
                <option value="fixed">Fixed</option>
                <option value="per_day">Per day</option>
                <option value="per_visit">Per visit</option>
                <option value="per_person_per_day">Per person/day</option>
                <option value="per_worker_per_day">Per worker/day</option>
                <option value="per_shift">Per shift</option>
                <option value="per_kg">Per kg</option>
                <option value="per_unit">Per unit</option>
              </select>
            </div>
            <div>
              <label className="label">Base price (SAR) *</label>
              <input type="number" min="0" step="0.01" value={form.base_price} onChange={(e) => set('base_price', parseFloat(e.target.value || '0'))} className="input" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="rounded text-navy" />
            <span className="text-sm">Active (visible in marketplace)</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={remove}
        title="Delete service" message={`Permanently delete "${delTarget?.name}"?`}
        confirmLabel={t('common.delete')} danger />
    </div>
  );
}
