import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { post } from '../../api/client';
import Logo from '../../components/common/Logo';
import Modal from '../../components/common/Modal';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const nextPath = params.get('next') || '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.full_name?.split(' ')[0]}!`);
      const home = nextPath
        || (user.role === 'admin' ? '/admin'
          : user.role === 'owner' ? '/owner'
          : user.role === 'provider' ? '/provider'
          : '/worker');
      nav(home);
    } catch (e) {
      toast.error(e.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const sendReset = async () => {
    try {
      await post('/auth/forgot-password', { email: forgotEmail });
      toast.success('If an account exists, a reset link has been sent.');
      setForgotOpen(false);
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="card p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-block mb-3"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold text-navy">{t('auth.loginTitle')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.loginSubtitle')}</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">{t('auth.email')}</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
          </div>
          <div>
            <label className="label flex justify-between items-center">
              <span>{t('auth.password')}</span>
              <button type="button" onClick={() => setForgotOpen(true)} className="text-xs link font-normal">{t('auth.forgotPassword')}</button>
            </label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="current-password" />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t('common.loading') : t('auth.loginBtn')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          <span>{t('auth.noAccount')}</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <Link to={`/register${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="btn-outline w-full">
          {t('auth.registerBtn')}
        </Link>

        {/* Demo creds helper */}
        <div className="mt-6 p-3 bg-slate-50 rounded-lg text-xs text-slate-600 space-y-1">
          <div className="font-semibold text-navy mb-1">Demo accounts (click to fill):</div>
          {[
            ['worker@email.com', 'Worker@123', 'Worker'],
            ['owner@riyadhcamps.sa', 'Owner@123', 'Owner'],
            ['admin@laborstay.sa', 'Admin@123', 'Admin'],
          ].map(([e, p, r]) => (
            <button
              key={e}
              type="button"
              onClick={() => { setEmail(e); setPassword(p); }}
              className="block w-full text-start hover:bg-slate-100 rounded px-1 py-0.5"
            >
              <span className="text-gold font-mono">{e}</span> <span className="text-slate-400">/ {p}</span> <span className="text-slate-500">({r})</span>
            </button>
          ))}
        </div>
      </div>

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Reset password"
        footer={<><button onClick={() => setForgotOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
                  <button onClick={sendReset} className="btn-primary">Send link</button></>}>
        <p className="text-sm text-slate-600 mb-3">Enter your email and we'll send you a reset link.</p>
        <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="input" placeholder="you@example.com" />
      </Modal>
    </div>
  );
}
