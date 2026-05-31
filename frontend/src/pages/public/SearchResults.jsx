import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import CampCard from '../../components/camp/CampCard';
import { SkeletonGrid } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

const CITIES = ['Riyadh', 'Jeddah', 'Dammam', 'Mecca', 'Medina', 'Khobar', 'Jubail', 'Yanbu', 'Tabuk', 'Abha'];
const CAMP_TYPES = ['standard', 'executive', 'istira'];
const AMENITIES = ['AC', 'WiFi', 'Laundry', 'Kitchen', 'Prayer Area', 'Parking', 'Gym'];
const NATIONALITIES = ['Pakistani', 'Indian', 'Bangladeshi', 'Egyptian', 'Filipino', 'Nepali', 'Sri Lankan', 'Yemeni'];

export default function SearchResults() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Build query object from URL params
  const filters = useMemo(() => ({
    q: params.get('q') || '',
    city: params.get('city') || '',
    camp_type: params.get('camp_type') || '',
    min_price: params.get('min_price') || '',
    max_price: params.get('max_price') || '',
    min_rating: params.get('min_rating') || '',
    amenities: params.get('amenities') || '',
    nationality: params.get('nationality') || '',
    available_only: params.get('available_only') || '',
    family_allowed: params.get('family_allowed') || '',
    sort: params.get('sort') || 'featured',
    page: parseInt(params.get('page') || '1', 10),
  }), [params]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value === '' || value == null || value === false) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const toggleAmenity = (a) => {
    const cur = (filters.amenities || '').split(',').filter(Boolean);
    const next = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a];
    setFilter('amenities', next.join(','));
  };

  useEffect(() => {
    setLoading(true);
    const qp = { ...filters };
    Object.keys(qp).forEach((k) => qp[k] === '' && delete qp[k]);
    get('/camps/search', qp).then(setData).catch(() => setData({ camps: [], total: 0 })).finally(() => setLoading(false));
  }, [filters]);

  const activeAmenities = new Set((filters.amenities || '').split(',').filter(Boolean));

  const clearAll = () => setParams({}, { replace: true });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* ---------- FILTERS SIDEBAR ---------- */}
        <aside className={`lg:w-72 shrink-0 ${showFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="card p-4 sticky top-20 space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-navy">{t('search.filters')}</h3>
              <button onClick={clearAll} className="text-xs link">{t('common.clear')}</button>
            </div>

            <div>
              <label className="label">{t('common.city')}</label>
              <select value={filters.city} onChange={(e) => setFilter('city', e.target.value)} className="input !py-2">
                <option value="">{t('common.all')}</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="label">{t('search.campType')}</label>
              <select value={filters.camp_type} onChange={(e) => setFilter('camp_type', e.target.value)} className="input !py-2">
                <option value="">{t('common.all')}</option>
                {CAMP_TYPES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>

            <div>
              <label className="label">{t('search.priceRange')}</label>
              <div className="flex gap-2">
                <input type="number" placeholder="min" value={filters.min_price} onChange={(e) => setFilter('min_price', e.target.value)} className="input !py-2" />
                <input type="number" placeholder="max" value={filters.max_price} onChange={(e) => setFilter('max_price', e.target.value)} className="input !py-2" />
              </div>
            </div>

            <div>
              <label className="label">{t('search.minRating')}</label>
              <select value={filters.min_rating} onChange={(e) => setFilter('min_rating', e.target.value)} className="input !py-2">
                <option value="">{t('common.all')}</option>
                {[5, 4, 3, 2].map((r) => <option key={r} value={r}>{r}★ & up</option>)}
              </select>
            </div>

            <div>
              <label className="label">{t('search.amenities')}</label>
              <div className="space-y-1.5">
                {AMENITIES.map((a) => (
                  <label key={a} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={activeAmenities.has(a)} onChange={() => toggleAmenity(a)} className="rounded text-navy" />
                    <span className="text-sm">{a}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="label">{t('search.nationality')}</label>
              <select value={filters.nationality} onChange={(e) => setFilter('nationality', e.target.value)} className="input !py-2">
                <option value="">{t('common.all')}</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2 border-t border-slate-100">
              <input type="checkbox" checked={filters.available_only === 'true'} onChange={(e) => setFilter('available_only', e.target.checked ? 'true' : '')} className="rounded text-navy" />
              <span>{t('search.availableOnly')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.family_allowed === 'true'} onChange={(e) => setFilter('family_allowed', e.target.checked ? 'true' : '')} className="rounded text-navy" />
              <span>{t('search.familyAllowed')}</span>
            </label>
          </div>
        </aside>

        {/* ---------- RESULTS ---------- */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h1 className="text-2xl font-bold text-navy">{t('search.title')}</h1>
              {data && <div className="text-sm text-slate-500">{data.total} {t('common.results')}</div>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters((v) => !v)} className="btn-outline btn-sm lg:hidden">
                ⚙ {t('search.filters')}
              </button>
              <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} className="input !py-2 max-w-[180px] text-sm">
                <option value="featured">{t('search.sortFeatured')}</option>
                <option value="price_asc">{t('search.sortPriceAsc')}</option>
                <option value="price_desc">{t('search.sortPriceDesc')}</option>
                <option value="rating">{t('search.sortRating')}</option>
                <option value="newest">{t('search.sortNewest')}</option>
              </select>
              <div className="hidden sm:flex border border-slate-200 rounded-lg overflow-hidden">
                <button onClick={() => setView('grid')} className={`px-3 py-2 text-sm ${view === 'grid' ? 'bg-navy text-white' : 'bg-white text-slate-600'}`}>▦</button>
                <button onClick={() => setView('map')} className={`px-3 py-2 text-sm ${view === 'map' ? 'bg-navy text-white' : 'bg-white text-slate-600'}`}>🗺</button>
              </div>
            </div>
          </div>

          {loading && <SkeletonGrid count={6} />}

          {!loading && data && data.camps.length === 0 && (
            <EmptyState
              icon="🔍"
              title={t('search.noResults')}
              body={t('search.tryRemoving')}
              action={<button onClick={clearAll} className="btn-primary">{t('common.clear')}</button>}
            />
          )}

          {!loading && data && data.camps.length > 0 && view === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {data.camps.map((c) => <CampCard key={c.id} camp={c} />)}
            </div>
          )}

          {!loading && data && data.camps.length > 0 && view === 'map' && (
            <MapView camps={data.camps} />
          )}

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-8">
              <button
                disabled={filters.page <= 1}
                onClick={() => setFilter('page', String(filters.page - 1))}
                className="btn-ghost"
              >← {t('common.previous')}</button>
              <div className="px-3 text-sm text-slate-500">
                {filters.page} {t('common.of')} {data.total_pages}
              </div>
              <button
                disabled={filters.page >= data.total_pages}
                onClick={() => setFilter('page', String(filters.page + 1))}
                className="btn-ghost"
              >{t('common.next')} →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Lightweight in-iframe map fallback — clusters camps as pins on a stylized SVG. */
function MapView({ camps }) {
  const valid = camps.filter((c) => c.latitude != null && c.longitude != null);
  if (!valid.length) return <div className="card p-8 text-center text-slate-500">No coordinates available.</div>;

  // Bounding box
  const lats = valid.map((c) => +c.latitude); const lngs = valid.map((c) => +c.longitude);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats);
  const minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const pad = 0.5;
  const norm = (v, min, max) => max === min ? 0.5 : (v - min) / (max - min);

  return (
    <div className="card overflow-hidden">
      <div className="relative bg-gradient-to-br from-navy-50 to-emerald-50 h-[520px]">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle, #1A3C5E 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        {valid.map((c) => {
          const x = norm(+c.longitude, minLn - pad, maxLn + pad) * 100;
          const y = (1 - norm(+c.latitude, minLa - pad, maxLa + pad)) * 100;
          return (
            <Link
              key={c.id}
              to={`/camps/${c.id}`}
              className="absolute group"
              style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)' }}
            >
              <div className="flex flex-col items-center">
                <div className="bg-gold text-white text-xs font-bold px-2 py-1 rounded shadow-lift whitespace-nowrap opacity-0 group-hover:opacity-100 transition mb-1">
                  {c.name} — {c.city}
                </div>
                <div className="w-6 h-6 rounded-full bg-navy text-white flex items-center justify-center text-xs shadow-lift hover:scale-125 transition">📍</div>
              </div>
            </Link>
          );
        })}
        <div className="absolute bottom-3 ltr:right-3 rtl:left-3 bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-slate-600 shadow">
          {valid.length} camps
        </div>
      </div>
    </div>
  );
}
