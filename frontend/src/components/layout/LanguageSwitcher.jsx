import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'en', label: 'English',  flag: '🇬🇧' },
  { code: 'ar', label: 'العربية',  flag: '🇸🇦' },
  { code: 'ur', label: 'اردو',     flag: '🇵🇰' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const change = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost gap-2 !px-3"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="text-sm font-medium hidden sm:inline">{current.label}</span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute mt-2 ltr:right-0 rtl:left-0 min-w-[160px] bg-white rounded-lg shadow-lift border border-slate-100 py-1 z-50">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => change(l.code)}
              className={`w-full text-start px-3 py-2 hover:bg-slate-50 text-sm flex items-center gap-2 ${l.code === current.code ? 'text-navy font-semibold' : 'text-slate-700'}`}
            >
              <span className="text-base">{l.flag}</span>
              <span>{l.label}</span>
              {l.code === current.code && <span className="ms-auto text-gold">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
