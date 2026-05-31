import React, { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';
import { SkeletonGrid } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

const CATEGORIES = [
  { v: '',                    l: 'All categories', icon: '🛠️' },
  { v: 'heavy_construction',  l: 'Heavy construction', icon: '🏗️' },
  { v: 'dewatering',          l: 'Dewatering',  icon: '💧' },
  { v: 'generator',           l: 'Generators',  icon: '⚡' },
  { v: 'compressor',          l: 'Compressors', icon: '🌬️' },
  { v: 'water_pump',          l: 'Water pumps', icon: '🚰' },
  { v: 'tower_light',         l: 'Tower lights',icon: '💡' },
  { v: 'scaffolding',         l: 'Scaffolding', icon: '🧱' },
  { v: 'tools',               l: 'Tools',       icon: '🔧' },
];
const CITIES = ['', 'Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];

export default function EquipmentList() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => ({
    category: params.get('category') || '',
    city: params.get('city') || '',
    q: params.get('q') || '',
    min_price: params.get('min_price') || '',
    max_price: params.get('max_price') || '',
    page: parseInt(params.get('page') || '1', 10),
  }), [params]);

  const setFilter = (k, v) => {
    const n = new URLSearchParams(params);
    if (v === '' || v == null) n.delete(k); else n.set(k, v);
    if (k !== 'page') n.delete('page');
    setParams(n, { replace: true });
  };

  useEffect(() => {
    setLoading(true);
    const qp = { ...filters };
    Object.keys(qp).forEach((k) => qp[k] === '' && delete qp[k]);
    get('/equipment', qp).then(setData).catch(() => setData({ equipment: [], total: 0 })).finally(() => setLoading(false));
  }, [filters]);

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-navy to-navy-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Equipment rental</h1>
          <p className="text-navy-100 max-w-2xl">Generators, dewatering systems, scaffolding, tower lights & more — daily, weekly or monthly rates with operator & delivery options across Saudi Arabia.</p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
        {/* Filters */}
        <div className="card p-4 mb-4 flex flex-wrap gap-2 items-center">
          <input
            type="search"
            defaultValue={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="🔍 Search equipment…"
            className="input max-w-xs"
          />
          <select value={filters.city} onChange={(e) => setFilter('city', e.target.value)} className="input !py-2 max-w-[140px]">
            {CITIES.map((c) => <option key={c} value={c}>{c || 'All cities'}</option>)}
          </select>
          <input type="number" placeholder="min SAR" value={filters.min_price} onChange={(e) => setFilter('min_price', e.target.value)} className="input !py-2 max-w-[120px]" />
          <input type="number" placeholder="max SAR" value={filters.max_price} onChange={(e) => setFilter('max_price', e.target.value)} className="input !py-2 max-w-[120px]" />
          {data && <div className="ms-auto text-sm text-slate-500">{data.total} {t('common.results')}</div>}
        </div>

        {/* Category pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.v}
              onClick={() => setFilter('category', c.v)}
              className={`px-4 py-2 rounded-full whitespace-nowrap text-sm flex items-center gap-1.5 border transition ${
                filters.category === c.v ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-200 hover:border-navy'
              }`}
            >
              <span>{c.icon}</span>{c.l}
            </button>
          ))}
        </div>

        {loading && <SkeletonGrid count={6} />}

        {!loading && data && data.equipment.length === 0 && (
          <EmptyState icon="🔍" title="No equipment matches" body="Try clearing some filters." />
        )}

        {!loading && data && data.equipment.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.equipment.map((e) => (
              <Link key={e.id} to={`/equipment/${e.id}`} className="card overflow-hidden group hover:shadow-lift transition block">
                <div className="relative h-44 bg-slate-100">
                  <img src={safeImage(e.photos?.[0])} alt={e.name} className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                  <span className={`absolute top-2 ltr:left-2 rtl:right-2 badge ${e.status === 'available' ? 'bg-emerald-100 text-emerald-800' : e.status === 'rented' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-700'} capitalize`}>{e.status}</span>
                  <span className="absolute bottom-2 ltr:right-2 rtl:left-2 badge bg-white text-navy font-bold shadow">{formatSAR(e.daily_rate, i18n.language)}/day</span>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-navy line-clamp-1 group-hover:text-gold">{e.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5 capitalize">{e.category?.replace('_', ' ')}{e.model && ` · ${e.model}`}</div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><span>📍</span>{e.city}</div>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {e.operator_included && <span className="chip">👷 Operator</span>}
                    {e.delivery_available && <span className="chip">🚚 Delivery</span>}
                    {e.fuel_type && e.fuel_type !== 'N/A' && <span className="chip">⛽ {e.fuel_type}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-8">
            <button disabled={filters.page <= 1} onClick={() => setFilter('page', String(filters.page - 1))} className="btn-ghost">← {t('common.previous')}</button>
            <div className="px-3 text-sm text-slate-500">{filters.page} {t('common.of')} {data.total_pages}</div>
            <button disabled={filters.page >= data.total_pages} onClick={() => setFilter('page', String(filters.page + 1))} className="btn-ghost">{t('common.next')} →</button>
          </div>
        )}
      </div>
    </div>
  );
}
