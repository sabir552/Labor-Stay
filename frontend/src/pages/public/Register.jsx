import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Logo from '../../components/common/Logo';

const NATIONALITIES = ['Pakistani', 'Indian', 'Bangladeshi', 'Egyptian', 'Filipino', 'Nepali', 'Sri Lankan', 'Yemeni', 'Sudanese', 'Saudi', 'Other'];

export default function Register() {
  const { t, i18n } = useTranslation();
  const { register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initialRole = params.get('role') || 'worker';

  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    nationality: '', iqama_number: '', iqama_expiry: '',
    company_name: '', cr_number: '', vat_number: '', address: '',
    consent: false,
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.consent) { toast.error('You must accept the PDPL consent.'); return; }
    setLoading(true);
    try {
      const payload = {
        role, full_name: form.full_name, email: form.email, password: form.password,
        phone: form.phone, preferred_language: i18n.language,
        consent: 'true',
        ...(role === 'worker'
          ? { nationality: form.nationality, iqama_number: form.iqama_number, iqama_expiry: form.iqama_expiry }
          : { company_name: form.company_name, cr_number: form.cr_number, vat_number: form.vat_number, address: form.address }),
      };
      const user = await register(payload);
      toast.success(`Welcome, ${user.full_name}!`);
      nav(role === 'admin' ? '/admin' : role === 'owner' ? '/owner' : role === 'provider' ? '/provider' : '/worker');
    } catch (e) {
      toast.error(e.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const RoleBtn = ({ value, label, icon }) => (
    <button
      type="button"
      onClick={() => setRole(value)}
      className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-lg border-2 transition ${role === value ? 'border-gold bg-gold/10 text-navy' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="card p-6 sm:p-8 w-full max-w-xl">
        <div className="text-center mb-5">
          <div className="inline-block mb-3"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-navy">{t('auth.registerTitle')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.registerSubtitle')}</p>
        </div>

        <div className="mb-5">
          <label className="label">{t('auth.iAmA')}</label>
          <div className="flex gap-2">
            <RoleBtn value="worker"   label={t('auth.worker')}   icon="🧰" />
            <RoleBtn value="owner"    label={t('auth.owner')}    icon="🏢" />
            <RoleBtn value="provider" label={t('auth.provider')} icon="🚛" />
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('auth.fullName')}</label>
              <input required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">{t('auth.phone')}</label>
              <input required value={form.phone} onChange={(e) => set('phone', e.target.value)} className="input" placeholder="+9665..." />
            </div>
            <div>
              <label className="label">{t('auth.email')}</label>
              <input type="email" required value={form.email} onChange={(e) => set('email', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">{t('auth.password')}</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => set('password', e.target.value)} className="input" />
            </div>
          </div>

          {role === 'worker' && (
            <div className="grid sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div>
                <label className="label">{t('auth.nationality')}</label>
                <select value={form.nationality} onChange={(e) => set('nationality', e.target.value)} className="input" required>
                  <option value="">-</option>
                  {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className="label">{t('auth.iqamaNumber')}</label>
                <input value={form.iqama_number} onChange={(e) => set('iqama_number', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('auth.iqamaExpiry')}</label>
                <input type="date" value={form.iqama_expiry} onChange={(e) => set('iqama_expiry', e.target.value)} className="input" />
              </div>
            </div>
          )}

          {(role === 'owner' || role === 'provider') && (
            <div className="grid sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div>
                <label className="label">{t('auth.companyName')}</label>
                <input required value={form.company_name} onChange={(e) => set('company_name', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('auth.crNumber')}</label>
                <input required value={form.cr_number} onChange={(e) => set('cr_number', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('auth.vatNumber')}</label>
                <input value={form.vat_number} onChange={(e) => set('vat_number', e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">{t('auth.address')}</label>
                <input value={form.address} onChange={(e) => set('address', e.target.value)} className="input" />
              </div>
            </div>
          )}

          <label className="flex items-start gap-2 pt-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} className="mt-1 rounded text-navy" />
            <span className="text-slate-700">
              {t('auth.consent')} <Link to="/privacy" className="link">PDPL</Link>
            </span>
          </label>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? t('common.loading') : t('auth.registerBtn')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-5">
          {t('auth.haveAccount')} <Link to="/login" className="link font-medium">{t('auth.loginBtn')}</Link>
        </p>
      </div>
    </div>
  );
}
