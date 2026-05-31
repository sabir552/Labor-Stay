import React, { useEffect, useState, useRef } from 'react';
import { get, put } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const FLAGS = {
  SAR: '🇸🇦', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  PKR: '🇵🇰', INR: '🇮🇳', BDT: '🇧🇩', EGP: '🇪🇬', PHP: '🇵🇭',
};

export default function CurrencySelector() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(() =>
    user?.preferred_currency || localStorage.getItem('laborstay_currency') || 'SAR'
  );
  const ref = useRef(null);

  useEffect(() => {
    get('/currency/rates').then(setMeta).catch(() => setMeta({ supported: ['SAR'], symbols: { SAR: 'ر.س' } }));
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Sync from user pref on login change
  useEffect(() => {
    if (user?.preferred_currency && user.preferred_currency !== current) {
      setCurrent(user.preferred_currency);
      localStorage.setItem('laborstay_currency', user.preferred_currency);
    }
  }, [user?.preferred_currency]);

  const change = async (ccy) => {
    setCurrent(ccy);
    localStorage.setItem('laborstay_currency', ccy);
    setOpen(false);
    // Notify whole app
    window.dispatchEvent(new CustomEvent('laborstay:currency', { detail: ccy }));
    if (user) {
      try { await put('/users/me/currency', { currency: ccy }); } catch {}
    }
  };

  if (!meta) return null;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost gap-1.5 !px-2 text-sm" aria-haspopup="menu">
        <span>{FLAGS[current] || '💱'}</span>
        <span className="font-medium">{current}</span>
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute mt-2 ltr:right-0 rtl:left-0 min-w-[180px] bg-white rounded-lg shadow-lift border border-slate-100 py-1 z-50">
          <div className="px-3 py-1.5 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Display currency
          </div>
          {(meta.supported || []).map((c) => (
            <button
              key={c}
              onClick={() => change(c)}
              className={`w-full text-start px-3 py-2 hover:bg-slate-50 text-sm flex items-center gap-2 ${c === current ? 'text-navy font-semibold' : 'text-slate-700'}`}
            >
              <span>{FLAGS[c] || '💱'}</span>
              <span className="flex-1">{c}</span>
              <span className="text-xs text-slate-400">{meta.symbols?.[c] || ''}</span>
              {c === current && <span className="text-gold ms-1">✓</span>}
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
            Rates updated hourly. Stored prices remain in SAR.
          </div>
        </div>
      )}
    </div>
  );
}
