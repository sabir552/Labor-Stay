import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Logo from '../common/Logo';
import LanguageSwitcher from './LanguageSwitcher';
import CurrencySelector from '../common/CurrencySelector';
import NotificationBell from './NotificationBell';
import UserMenu from './UserMenu';

export default function Navbar() {
  const { t } = useTranslation();
  const [mobile, setMobile] = useState(false);
  const nav = useNavigate();
  const [q, setQ] = useState('');

  const onSearch = (e) => {
    e.preventDefault();
    nav(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setMobile(false);
  };

  const linkClass = ({ isActive }) =>
    `text-sm font-medium px-2 py-1 rounded-md transition ${isActive ? 'text-navy bg-navy-50' : 'text-slate-600 hover:text-navy'}`;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="h-16 flex items-center justify-between gap-3">
          <Link to="/" className="shrink-0"><Logo /></Link>

          {/* Desktop search */}
          <form onSubmit={onSearch} className="hidden md:flex flex-1 max-w-lg">
            <div className="relative w-full">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input pe-10"
                placeholder={t('home.searchPlaceholder')}
              />
              <button type="submit" className="absolute top-1/2 -translate-y-1/2 ltr:right-2 rtl:left-2 text-slate-400 hover:text-navy">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </button>
            </div>
          </form>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink to="/search" className={linkClass}>{t('nav.camps')}</NavLink>
            <NavLink to="/equipment" className={linkClass}>{t('nav.equipment')}</NavLink>
            <NavLink to="/services" className={linkClass}>{t('nav.services')}</NavLink>
            <NavLink to="/about" className={linkClass}>{t('nav.about')}</NavLink>
          </nav>

          <div className="flex items-center gap-1">
            <CurrencySelector />
            <LanguageSwitcher />
            <NotificationBell />
            <UserMenu />
            <button
              onClick={() => setMobile((v) => !v)}
              className="lg:hidden btn-ghost !px-2"
              aria-label="menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobile
                  ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
                  : <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobile && (
          <div className="lg:hidden border-t border-slate-200 py-3 space-y-1">
            <form onSubmit={onSearch} className="px-1 mb-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input"
                placeholder={t('home.searchPlaceholder')}
              />
            </form>
            <NavLink to="/search"    onClick={() => setMobile(false)} className="block px-3 py-2 rounded-md hover:bg-slate-50 text-sm">{t('nav.camps')}</NavLink>
            <NavLink to="/equipment" onClick={() => setMobile(false)} className="block px-3 py-2 rounded-md hover:bg-slate-50 text-sm">{t('nav.equipment')}</NavLink>
            <NavLink to="/services"  onClick={() => setMobile(false)} className="block px-3 py-2 rounded-md hover:bg-slate-50 text-sm">{t('nav.services')}</NavLink>
            <NavLink to="/about"     onClick={() => setMobile(false)} className="block px-3 py-2 rounded-md hover:bg-slate-50 text-sm">{t('nav.about')}</NavLink>
            <NavLink to="/contact"   onClick={() => setMobile(false)} className="block px-3 py-2 rounded-md hover:bg-slate-50 text-sm">{t('nav.contact')}</NavLink>
          </div>
        )}
      </div>
    </header>
  );
}
