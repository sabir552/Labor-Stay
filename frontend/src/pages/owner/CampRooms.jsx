import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatSAR } from '../../utils/formatters';

const ROOM_TYPES = [
  { v: 'standard',  l: 'Standard labour room' },
  { v: 'executive', l: 'Executive room' },
  { v: 'bed_space', l: 'Bed space' },
];
const ROOM_AMENITIES = ['AC', 'Attached Bathroom', 'TV', 'WiFi', 'Wardrobe', 'Fridge'];

const empty = { name: '', description: '', room_type: 'standard', capacity: 4, available_beds: 4, price_per_day: 50, price_per_month: 1400, amenities: [], photos: [], is_active: true };

export default function CampRooms() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [camp, setCamp] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [modal, setModal] = useState(null); // null | 'new' | room
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState(null);

  const load = () => {
    get(`/camps/${id}`).then((r) => { setCamp(r.camp); setRooms(r.rooms || []); });
  };
  useEffect(load, [id]);

  const openNew = () => { setForm(empty); setModal('new'); };
  const openEdit = (room) => { setForm({ ...empty, ...room, amenities: room.amenities || [], photos: room.photos || [] }); setModal(room); };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAmenity = (a) => set('amenities', form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a]);

  const save = async () => {
    setSaving(true);
    try {
      if (modal === 'new') {
        await post(`/rooms/camp/${id}`, form);
        toast.success('Room added');
      } else {
        await put(`/rooms/${modal.id}`, form);
        toast.success('Room updated');
      }
      setModal(null);
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    try {
      await del(`/rooms/${delTarget.id}`);
      toast.success('Room removed');
      load();
    } catch (e) { toast.error(e.message); }
  };

  if (!camp) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <Link to="/owner/camps" className="text-xs link">← {t('common.back')}</Link>
      <SectionHeader
        title={`${camp.name} — Rooms`}
        subtitle={`${rooms?.length || 0} rooms · ${camp.city}`}
        action={<button onClick={openNew} className="btn-primary btn-sm">+ Add room</button>}
      />

      <div className="space-y-2">
        {rooms?.map((r) => (
          <div key={r.id} className="card p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-navy-50 text-navy flex items-center justify-center text-xl shrink-0">🛏️</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-navy">{r.name}</h4>
                <span className="badge bg-slate-100 text-slate-700 capitalize">{r.room_type?.replace('_', ' ')}</span>
                {!r.is_active && <span className="badge bg-rose-100 text-rose-700">Inactive</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{r.available_beds}/{r.capacity} beds available</div>
            </div>
            <div className="text-end">
              <div className="font-semibold text-navy">{formatSAR(r.price_per_day, i18n.language)}</div>
              <div className="text-[10px] text-slate-500">/ day</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(r)} className="btn-outline btn-sm">✎</button>
              <button onClick={() => setDelTarget(r)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
            </div>
          </div>
        ))}
        {rooms?.length === 0 && <div className="card p-8 text-center text-slate-500">No rooms yet — add your first one.</div>}
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} size="lg"
        title={modal === 'new' ? 'Add room' : `Edit: ${form.name}`}
        footer={<>
          <button onClick={() => setModal(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
        </>}>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <input value={form.description} onChange={(e) => set('description', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Room type *</label>
              <select value={form.room_type} onChange={(e) => set('room_type', e.target.value)} className="input">
                {ROOM_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Capacity (total beds) *</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => set('capacity', parseInt(e.target.value || '1', 10))} className="input" />
            </div>
            <div>
              <label className="label">Available beds</label>
              <input type="number" min="0" max={form.capacity} value={form.available_beds} onChange={(e) => set('available_beds', parseInt(e.target.value || '0', 10))} className="input" />
            </div>
            <div>
              <label className="label">Price per day (SAR) *</label>
              <input type="number" min="0" step="0.01" value={form.price_per_day} onChange={(e) => set('price_per_day', parseFloat(e.target.value || '0'))} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Price per month (SAR)</label>
              <input type="number" min="0" step="0.01" value={form.price_per_month} onChange={(e) => set('price_per_month', parseFloat(e.target.value || '0'))} className="input" />
            </div>
          </div>

          <div>
            <label className="label">Amenities</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_AMENITIES.map((a) => (
                <button type="button" key={a} onClick={() => toggleAmenity(a)}
                  className={`px-2.5 py-1 rounded-full text-xs border ${form.amenities.includes(a) ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}>{a}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-2">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="rounded text-navy" />
            <span className="text-sm">Active (available for booking)</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={remove}
        title="Delete room"
        message={`Permanently delete "${delTarget?.name}"? Active bookings will not be affected.`}
        confirmLabel={t('common.delete')} danger />
    </div>
  );
}
