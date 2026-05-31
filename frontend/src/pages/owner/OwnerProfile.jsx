import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { initials } from '../../utils/formatters';

export default function OwnerProfile() {
  const { t, i18n } = useTranslation();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get('/users/me').then((r) => {
      setProfile(r.user);
      const op = r.user.owner_profile || {};
      setForm({
        full_name: r.user.full_name || '',
        phone: r.user.phone || '',
        preferred_language: r.user.preferred_language || 'en',
        company_name: op.company_name || '',
        cr_number: op.cr_number || '',
        vat_number: op.vat_number || '',
        address: op.address || '',
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

  if (!profile) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title="Company profile" subtitle={profile.email} />

      <div className="card p-5 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-gold text-white text-2xl font-bold flex items-center justify-center">
          {initials(form.company_name || profile.full_name)}
        </div>
        <div>
          <div className="font-semibold text-navy text-lg">{form.company_name || profile.full_name}</div>
          <div className="text-xs text-slate-500">{profile.email} · <span className="capitalize">{profile.role}</span></div>
          <div className="mt-2">
            {profile.is_verified
              ? <span className="badge bg-emerald-100 text-emerald-800">✓ Verified business</span>
              : <span className="badge bg-amber-100 text-amber-800">Pending verification</span>}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="card p-5 space-y-3">
        <h3 className="font-semibold text-navy mb-1">Contact details</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">{t('auth.fullName')}</label>
            <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.phone')}</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
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

        <h3 className="font-semibold text-navy mt-4 mb-1">Company / KSA business</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">{t('auth.companyName')}</label>
            <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.crNumber')}</label>
            <input value={form.cr_number} onChange={(e) => setForm({ ...form, cr_number: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.vatNumber')}</label>
            <input value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} className="input" />
          </div>
          <div>
            <label className="label">{t('auth.address')}</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input" />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">{saving ? t('common.loading') : t('common.save')}</button>
      </form>
    </div>
  );
}
