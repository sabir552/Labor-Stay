import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { formatSAR } from '../../utils/formatters';
import StarRating from '../../components/common/StarRating';
import { SkeletonGrid } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

const CATEGORIES = [
  { v: '', l: 'All services', icon: '🛠️' },
  { v: 'labour_supply', l: 'Labour supply',           icon: '👷' },
  { v: 'catering',      l: 'Catering',                icon: '🍽️' },
  { v: 'transportation',l: 'Transportation',          icon: '🚌' },
  { v: 'facility_management', l: 'Facility management', icon: '🏢' },
  { v: 'cleaning',      l: 'Cleaning',                icon: '🧹' },
  { v: 'security',      l: 'Security',                icon: '🛡️' },
  { v: 'laundry',       l: 'Laundry',                 icon: '👕' },
  { v: 'portable_office', l: 'Portable office',       icon: '🏗️' },
  { v: 'container_rental', l: 'Container rental',     icon: '📦' },
];

export default function ServicesList() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => ({
    category: params.get('category') || '',
    q: params.get('q') || '',
    city: params.get('city') || '',
  }), [params]);

  const setFilter = (k, v) => {
    const n = new URLSearchParams(params);
    if (v === '' || v == null) n.delete(k); else n.set(k, v);
    setParams(n, { replace: true });
  };

  useEffect(() => {
    setLoading(true);
    const qp = { ...filters };
    Object.keys(qp).forEach((k) => qp[k] === '' && delete qp[k]);
    get('/services', qp).then(setData).catch(() => setData({ services: [], total: 0 })).finally(() => setLoading(false));
  }, [filters]);

  return (
    <div>
      <section className="bg-gradient-to-br from-gold to-gold-500 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Services marketplace</h1>
          <p className="text-white/90 max-w-2xl">Catering, transport, security, cleaning, laundry & more. Request a quote in minutes from verified KSA providers.</p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        <div className="card p-4 mb-4 flex flex-wrap gap-2 items-center">
          <input type="search" defaultValue={filters.q} onChange={(e) => setFilter('q', e.target.value)}
            placeholder="🔍 Search services…" className="input max-w-xs" />
          {data && <div className="ms-auto text-sm text-slate-500">{data.total} {t('common.results')}</div>}
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-1">
          {CATEGORIES.map((c) => (
            <button key={c.v} onClick={() => setFilter('category', c.v)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm flex items-center gap-1.5 border transition ${
                filters.category === c.v ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-200 hover:border-navy'}`}>
              <span>{c.icon}</span>{c.l}
            </button>
          ))}
        </div>

        {loading && <SkeletonGrid count={6} />}

        {!loading && data && data.services.length === 0 && (
          <EmptyState icon="🛠️" title="No services match" body="Try a different category." />
        )}

        {!loading && data && data.services.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.services.map((s) => {
              const cat = CATEGORIES.find((c) => c.v === s.category);
              return (
                <Link to={`/services/${s.id}`} key={s.id} className="card overflow-hidden hover:shadow-lift transition block">
                  <div className="relative h-32 bg-gradient-to-br from-navy to-navy-600 flex items-center justify-center text-6xl">
                    {cat?.icon || '🛠️'}
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-navy line-clamp-1">{s.name}</h3>
                      <StarRating value={s.rating} size={11} />
                    </div>
                    <div className="text-xs text-slate-500 mt-1 capitalize">{s.category?.replace('_', ' ')}{s.city && ` · 📍 ${s.city}`}</div>
                    <p className="text-sm text-slate-600 mt-2 line-clamp-2">{s.description}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <span className="text-lg font-bold text-navy">{formatSAR(s.base_price, i18n.language)}</span>
                        <span className="text-xs text-slate-500 ms-1">{(s.pricing_type || 'fixed').replace(/_/g, ' ')}</span>
                      </div>
                      <span className="btn-primary btn-sm">Request quote →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
