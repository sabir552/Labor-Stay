import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { initials } from '../../utils/formatters';

export default function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" className="btn-ghost">{t('nav.login')}</Link>
        <Link to="/register" className="btn-primary btn-sm">{t('nav.register')}</Link>
      </div>
    );
  }

  const dashHome = user.role === 'admin' ? '/admin'
                 : user.role === 'owner' ? '/owner'
                 : user.role === 'provider' ? '/provider'
                 : '/worker';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 group">
        <span className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center font-semibold text-sm">
          {initials(user.full_name)}
        </span>
        <span className="hidden md:inline text-sm font-medium text-slate-700 group-hover:text-navy">{user.full_name?.split(' ')[0]}</span>
        <span className="text-xs text-slate-500">▾</span>
      </button>
      {open && (
        <div className="absolute mt-2 ltr:right-0 rtl:left-0 min-w-[200px] bg-white rounded-lg shadow-lift border border-slate-100 py-1 z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-sm font-semibold text-navy">{user.full_name}</div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
            <div className="text-[10px] uppercase tracking-wider text-gold font-bold mt-1">{user.role}</div>
          </div>
          <Link to={dashHome} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50 text-sm">{t('nav.dashboard')}</Link>
          <Link to={dashHome + "/messages"} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50 text-sm">{t('nav.messages')}</Link>
          <Link to={dashHome + "/profile"} onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50 text-sm">{t('nav.profile')}</Link>
          <button
            onClick={() => { logout(); setOpen(false); nav('/'); }}
            className="w-full text-start px-3 py-2 hover:bg-rose-50 text-sm text-rose-600 border-t border-slate-100"
          >
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
