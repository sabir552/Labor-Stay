import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Shared dashboard chrome (worker / owner / provider / admin).
 * `items` = [{ to, label, icon, end? }]
 */
export default function DashboardLayout({ title, items = [] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const link = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
      isActive ? 'bg-navy text-white shadow-soft' : 'text-slate-600 hover:bg-slate-100 hover:text-navy'
    }`;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-8">
      <div className="flex items-center justify-between mb-4 lg:hidden">
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        <button onClick={() => setOpen((v) => !v)} className="btn-outline btn-sm">☰ Menu</button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className={`lg:w-60 shrink-0 ${open ? 'block' : 'hidden lg:block'}`}>
          <div className="card p-3 sticky top-20">
            <div className="px-3 py-2 mb-1 hidden lg:block">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{title}</div>
            </div>
            <nav className="space-y-1">
              {items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} className={link} onClick={() => setOpen(false)}>
                  <span className="text-base">{it.icon}</span>
                  <span>{it.label}</span>
                  {it.badge != null && it.badge > 0 && (
                    <span className="ms-auto bg-gold text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                      {it.badge > 9 ? '9+' : it.badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function StatCard({ label, value, icon, accent = 'navy' }) {
  const colors = {
    navy: 'bg-navy-50 text-navy',
    gold: 'bg-gold/10 text-gold-500',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 ${colors[accent]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500 uppercase tracking-wider truncate">{label}</div>
        <div className="text-xl font-bold text-navy">{value}</div>
      </div>
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <h2 className="text-xl font-semibold text-navy">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
