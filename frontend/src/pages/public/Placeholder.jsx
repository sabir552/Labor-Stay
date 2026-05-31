import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Temporary scaffolding page — replaced piece by piece.
 */
export default function Placeholder({ title, subtitle, icon = '🚧' }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <div className="text-6xl mb-4">{icon}</div>
      <h1 className="text-3xl font-bold text-navy mb-3">{title}</h1>
      {subtitle && <p className="text-slate-500">{subtitle}</p>}
      <p className="mt-6 text-xs text-slate-400">{t('common.loading').replace('…', '')} — built in the next piece.</p>
    </div>
  );
}
