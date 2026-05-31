import React from 'react';

const COLOR_CLASS = {
  gold: 'bg-gold/20 text-gold-600 border-gold/30',
  emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  navy: 'bg-navy-50 text-navy border-navy-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function BadgeDisplay({ badges = [], size = 'sm' }) {
  if (!badges || badges.length === 0) return null;
  const sz = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';
  return (
    <div className="inline-flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b.key}
          className={`rounded-full border ${sz} ${COLOR_CLASS[b.color] || COLOR_CLASS.slate}`}
          title={b.label}>
          <span className="me-0.5">{b.icon}</span>{b.label}
        </span>
      ))}
    </div>
  );
}
