import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api, { put, get, upload } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, initials } from '../../utils/formatters';

const NATIONALITIES = ['Pakistani', 'Indian', 'Bangladeshi', 'Egyptian', 'Filipino', 'Nepali', 'Sri Lankan', 'Yemeni', 'Sudanese', 'Saudi', 'Other'];

export default function WorkerProfile() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    get('/users/me').then((r) => {
      setProfile(r.user);
      setForm({
        full_name: r.user.full_name || '',
        phone: r.user.phone || '',
        preferred_language: r.user.preferred_language || 'en',
        nationality: r.user.worker_profile?.nationality || '',
        iqama_number: r.user.worker_profile?.iqama_number || '',
        iqama_expiry: r.user.worker_profile?.iqama_expiry || '',
      });
    });
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/users/me', form);
      if (form.preferred_language !== i18n.language) i18n.changeLanguage(form.preferred_language);
      await refreshUser();
      toast.success('Profile saved');
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const uploadIqama = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    setUploading(true);
    try {
      const r = await upload('/users/me/iqama-photo', fd);
      toast.success('Iqama photo uploaded — pending admin verification.');
      // refresh profile
      const refreshed = await get('/users/me');
      setProfile(refreshed.user);
    } catch (e) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  if (!profile) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  const wp = profile.worker_profile || {};

  // Iqama expiry alert (within 30 days)
  let expiryAlert = null;
  if (wp.iqama_expiry) {
    const days = Math.ceil((new Date(wp.iqama_expiry) - new Date()) / 86400000);
    if (days < 0) expiryAlert = { kind: 'error', msg: `Iqama expired ${-days} days ago` };
    else if (days <= 30) expiryAlert = { kind: 'warn', msg: `Iqama expires in ${days} days — please renew.` };
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('nav.profile')} subtitle={profile.email} />

      {/* Avatar + verification */}
      <div className="card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-navy text-white text-2xl font-bold flex items-center justify-center">
          {initials(profile.full_name)}
        </div>
        <div className="flex-1">
          <div className="font-semibold text-navy text-lg">{profile.full_name}</div>
          <div className="text-xs text-slate-500">{profile.email} · <span className="capitalize">{profile.role}</span></div>
          <div className="flex gap-2 mt-2">
            {profile.is_verified
              ? <span className="badge bg-emerald-100 text-emerald-800">✓ Verified account</span>
              : <span className="badge bg-amber-100 text-amber-800">Pending verification</span>}
            {wp.iqama_verified
              ? <span className="badge bg-emerald-100 text-emerald-800">✓ Iqama verified</span>
              : wp.iqama_photo_url
                ? <span className="badge bg-amber-100 text-amber-800">Iqama under review</span>
                : <span className="badge bg-slate-100 text-slate-600">No Iqama photo</span>}
          </div>
        </div>
      </div>

      {/* Iqama expiry alert */}
      {expiryAlert && (
        <div className={`card p-4 border-s-4 ${expiryAlert.kind === 'error' ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-amber-500 bg-amber-50 text-amber-800'}`}>
          <div className="font-medium text-sm">⚠️ {expiryAlert.msg}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={save} className="card p-5 space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">{t('auth.fullName')}</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="label">{t('auth.phone')}</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.nationality')}</label>
            <select value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })} className="input">
              <option value="">-</option>
              {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('auth.iqamaNumber')}</label>
            <input value={form.iqama_number} onChange={(e) => setForm({ ...form, iqama_number: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.iqamaExpiry')}</label>
            <input type="date" value={form.iqama_expiry || ''} onChange={(e) => setForm({ ...form, iqama_expiry: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('nav.language')}</label>
            <select value={form.preferred_language} onChange={(e) => setForm({ ...form, preferred_language: e.target.value })} className="input">
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="ur">اردو</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t('common.loading') : t('common.save')}
        </button>
      </form>

      {/* Iqama upload */}
      <div className="card p-5">
        <h3 className="font-semibold text-navy mb-2">Iqama document</h3>
        <p className="text-sm text-slate-500 mb-3">Upload a clear photo of your Iqama. Admin will verify within 24 hours.</p>
        {wp.iqama_photo_url && (
          <a href={wp.iqama_photo_url} target="_blank" rel="noreferrer" className="block mb-3">
            <img src={wp.iqama_photo_url} alt="Iqama" className="max-h-48 rounded-lg border border-slate-200" />
          </a>
        )}
        <label className="btn-outline btn-sm cursor-pointer inline-flex">
          {uploading ? t('common.loading') : '📎 Upload Iqama photo'}
          <input type="file" accept="image/*,.pdf" onChange={uploadIqama} className="hidden" disabled={uploading} />
        </label>
      </div>
    </div>
  );
}
