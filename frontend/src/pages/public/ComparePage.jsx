import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';
import StarRating from '../../components/common/StarRating';
import EmptyState from '../../components/common/EmptyState';

export default function ComparePage() {
  const { t, i18n } = useTranslation();
  const [params] = useSearchParams();
  const idsStr = params.get('ids') || '';
  const [camps, setCamps] = useState(null);

  useEffect(() => {
    if (!idsStr) { setCamps([]); return; }
    get(`/camps/compare?ids=${encodeURIComponent(idsStr)}`)
      .then((r) => setCamps(r.camps || []))
      .catch(() => setCamps([]));
  }, [idsStr]);

  if (camps === null) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;
  if (!camps.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <EmptyState icon="📊" title={t('compare.empty', 'Nothing to compare')}
          body={t('compare.emptyBody', 'Pick 1-3 camps from search and use "Add to compare".')}
          action={<Link to="/search" className="btn-primary">{t('common.search')}</Link>} />
      </div>
    );
  }

  // Build comparison rows
  const all = new Set();
  for (const c of camps) (c.amenities || []).forEach((a) => all.add(a));
  const amenityList = Array.from(all).sort();

  const rows = [
    { key: 'cover',     label: '', render: (c) => (
      <img src={safeImage(c.cover_photo)} alt="" className="w-full h-32 object-cover rounded-t-lg" />
    )},
    { key: 'name',      label: '', render: (c) => <div className="font-bold text-navy">{c.name}</div> },
    { key: 'rating',    label: t('common.rating'), render: (c) => <StarRating value={c.rating || 0} /> },
    { key: 'city',      label: t('common.city'), render: (c) => `📍 ${c.city}${c.region ? `, ${c.region}` : ''}` },
    { key: 'type',      label: t('search.campType'), render: (c) => <span className="capitalize">{c.camp_type || '—'}</span> },
    { key: 'price',     label: t('common.price') + '/' + t('common.perDay').replace(/^\/\s*/, ''),
      render: (c) => c.min_price_day != null
        ? <b className="text-gold-600">{formatSAR(c.min_price_day, i18n.language)}</b>
        : '—' },
    { key: 'capacity',  label: t('compare.capacity', 'Capacity'),
      render: (c) => `${c.total_capacity || 0} beds (${c.available_beds || 0} free)` },
    { key: 'reviews',   label: t('compare.reviews', 'Reviews'),
      render: (c) => `${c.review_count || 0}` },
    { key: 'family',    label: t('compare.family', 'Families'),
      render: (c) => c.family_allowed ? '✓' : '—' },
    { key: 'smoking',   label: t('compare.smoking', 'Smoking'),
      render: (c) => c.smoking_allowed ? '🚬 OK' : '🚭 No' },
    { key: 'nationality', label: t('compare.nationality', 'Nationality'),
      render: (c) => (c.nationality_preference || []).length
        ? (c.nationality_preference || []).join(', ')
        : t('compare.any', 'Any') },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <SectionHeader title={t('compare.title', 'Compare camps')}
        subtitle={t('compare.subtitle', 'Side-by-side comparison')}
        action={<Link to="/search" className="btn-outline btn-sm">+ {t('compare.more', 'Add more')}</Link>} />

      <div className="overflow-x-auto">
        <div className={`grid gap-3 min-w-fit`} style={{ gridTemplateColumns: `160px repeat(${camps.length}, minmax(220px, 1fr))` }}>
          {/* Header row */}
          <div></div>
          {camps.map((c) => (
            <div key={c.id} className="card overflow-hidden">
              <img src={safeImage(c.cover_photo)} alt={c.name} className="w-full h-32 object-cover" />
              <div className="p-3">
                <Link to={`/camps/${c.id}`} className="font-bold text-navy hover:text-gold line-clamp-1">{c.name}</Link>
                <div className="text-xs text-slate-500">{c.city}</div>
              </div>
            </div>
          ))}

          {/* Data rows */}
          {rows.slice(2).map((row) => (
            <React.Fragment key={row.key}>
              <div className="text-xs uppercase tracking-wider text-slate-500 self-center px-2 py-1 bg-slate-50 rounded">{row.label}</div>
              {camps.map((c) => (
                <div key={c.id} className="card p-3 text-sm text-slate-700 self-center">{row.render(c)}</div>
              ))}
            </React.Fragment>
          ))}

          {/* Amenities */}
          <div className="text-xs uppercase tracking-wider text-slate-500 self-start px-2 py-1 bg-slate-50 rounded">
            {t('camp.amenities')}
          </div>
          {camps.map((c) => (
            <div key={c.id} className="card p-3 text-sm space-y-1">
              {amenityList.map((a) => {
                const has = (c.amenities || []).includes(a);
                return (
                  <div key={a} className={`flex items-center gap-2 ${has ? 'text-slate-700' : 'text-slate-300'}`}>
                    <span>{has ? '✓' : '—'}</span><span>{a}</span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Book buttons */}
          <div></div>
          {camps.map((c) => (
            <Link key={c.id} to={`/camps/${c.id}`} className="btn-gold btn-sm justify-center self-start">
              {t('common.bookNow')} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
