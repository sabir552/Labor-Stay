import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post, put, upload } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];
const REGIONS = ['Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk', 'Hail', 'Northern Borders', 'Jazan', 'Najran', 'Al-Baha', 'Al-Jouf', 'Qassim'];
const TYPES = [
  { v: 'standard',  l: 'Standard labour camp' },
  { v: 'executive', l: 'Executive camp' },
  { v: 'istira',    l: 'Istira facility' },
];
const AMENITIES = ['AC', 'WiFi', 'Laundry', 'Kitchen', 'Prayer Area', 'Parking', 'Gym', 'TV', '24/7 Security', 'Cleaning'];
const NATS = ['Pakistani', 'Indian', 'Bangladeshi', 'Egyptian', 'Filipino', 'Nepali', 'Sri Lankan', 'Yemeni', 'Sudanese'];

const empty = {
  name: '', description: '', camp_type: 'standard',
  address: '', city: 'Riyadh', region: 'Riyadh',
  latitude: '', longitude: '',
  amenities: [], nearby_pois: [], nationality_preference: [],
  family_allowed: false, smoking_allowed: false,
  rules: '', licence_number: '', capacity: '', emergency_contact: '',
};

export default function CampForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const { t } = useTranslation();
  const toast = useToast();
  const nav = useNavigate();

  const [form, setForm] = useState(empty);
  const [photos, setPhotos] = useState([]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleAmenity = (a) => set('amenities', form.amenities.includes(a) ? form.amenities.filter((x) => x !== a) : [...form.amenities, a]);
  const toggleNat = (n) => set('nationality_preference', form.nationality_preference.includes(n) ? form.nationality_preference.filter((x) => x !== n) : [...form.nationality_preference, n]);

  useEffect(() => {
    if (!isEdit) return;
    get(`/camps/${id}`).then((r) => {
      const c = r.camp;
      setForm({
        ...empty, ...c,
        amenities: c.amenities || [],
        nearby_pois: c.nearby_pois || [],
        nationality_preference: c.nationality_preference || [],
      });
      setPhotos(r.photos || []);
    });
  }, [id, isEdit]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        latitude: form.latitude === '' ? null : parseFloat(form.latitude),
        longitude: form.longitude === '' ? null : parseFloat(form.longitude),
        capacity: form.capacity === '' ? 0 : parseInt(form.capacity, 10),
      };
      let camp;
      if (isEdit) {
        const r = await put(`/camps/${id}`, payload);
        camp = r.camp;
      } else {
        const r = await post('/camps', payload);
        camp = r.camp;
      }

      // Upload photos if any
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append('photos', f));
        await upload(`/camps/${camp.id}/photos`, fd);
      }
      toast.success(isEdit ? 'Camp updated' : 'Camp created — pending admin verification');
      nav(`/owner/camps/${camp.id}/rooms`);
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Link to="/owner/camps" className="text-xs link">← {t('common.back')}</Link>
      <SectionHeader title={isEdit ? `${t('common.edit')}: ${form.name}` : t('owner.addCamp')} />

      <form onSubmit={submit} className="space-y-4">
        {/* Basics */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-navy mb-1">Basics</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Camp name *</label>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Camp type *</label>
              <select required value={form.camp_type} onChange={(e) => set('camp_type', e.target.value)} className="input">
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Capacity (total beds)</label>
              <input type="number" min="0" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} className="input" />
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-navy mb-1">Location</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('common.city')} *</label>
              <select required value={form.city} onChange={(e) => set('city', e.target.value)} className="input">
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Region</label>
              <select value={form.region} onChange={(e) => set('region', e.target.value)} className="input">
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input value={form.address} onChange={(e) => set('address', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Latitude</label>
              <input type="number" step="0.000001" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} className="input" placeholder="24.7136" />
            </div>
            <div>
              <label className="label">Longitude</label>
              <input type="number" step="0.000001" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} className="input" placeholder="46.6753" />
            </div>
          </div>
        </div>

        {/* Amenities */}
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">{t('camp.amenities')}</h3>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <button type="button" key={a} onClick={() => toggleAmenity(a)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${form.amenities.includes(a) ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-navy mb-1">Preferences & rules</h3>
          <div>
            <label className="label">Nationality preference (leave empty for all)</label>
            <div className="flex flex-wrap gap-2">
              {NATS.map((n) => (
                <button type="button" key={n} onClick={() => toggleNat(n)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition ${form.nationality_preference.includes(n) ? 'bg-gold text-white border-gold' : 'bg-white text-slate-600 border-slate-200 hover:border-gold'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.family_allowed} onChange={(e) => set('family_allowed', e.target.checked)} className="rounded text-navy" />
              <span className="text-sm">{t('search.familyAllowed')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.smoking_allowed} onChange={(e) => set('smoking_allowed', e.target.checked)} className="rounded text-navy" />
              <span className="text-sm">{t('search.smokingAllowed')}</span>
            </label>
          </div>
          <div>
            <label className="label">Rules & regulations</label>
            <textarea rows={3} value={form.rules} onChange={(e) => set('rules', e.target.value)} className="input" placeholder="e.g. No loud noise after 10 PM…" />
          </div>
        </div>

        {/* Compliance */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-navy mb-1">Ministry of HR compliance</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Licence number</label>
              <input value={form.licence_number} onChange={(e) => set('licence_number', e.target.value)} className="input" placeholder="MOHR-12345" />
            </div>
            <div>
              <label className="label">Emergency contact</label>
              <input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} className="input" placeholder="+9665..." />
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-2">Photos</h3>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {photos.map((p) => (
                <img key={p.id} src={p.url} alt="" className="aspect-square rounded-lg object-cover border border-slate-100" />
              ))}
            </div>
          )}
          <label className="btn-outline btn-sm cursor-pointer inline-flex">
            📎 Add photos
            <input type="file" multiple accept="image/*" onChange={(e) => setFiles(Array.from(e.target.files || []))} className="hidden" />
          </label>
          {files.length > 0 && <span className="text-xs text-slate-500 ms-2">{files.length} file(s) selected</span>}
        </div>

        <div className="flex gap-2 justify-end">
          <Link to="/owner/camps" className="btn-ghost">{t('common.cancel')}</Link>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
