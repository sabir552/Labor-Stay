import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * B5 — Categorized nearby places panel with tabs and icons.
 *
 * Accepts pois = [{ name, type, distance_km, walking_time_min, lat, lng }]
 * Falls back gracefully if the array is empty or items are sparse.
 */
const CATEGORIES = [
  { key: 'all',             label: 'All',              icon: '📍' },
  { key: 'hospital',        label: 'Hospitals',        icon: '🏥' },
  { key: 'pharmacy',        label: 'Pharmacies',       icon: '💊' },
  { key: 'mosque',          label: 'Mosques',          icon: '🕌' },
  { key: 'supermarket',     label: 'Supermarkets',     icon: '🛒' },
  { key: 'bus_station',     label: 'Bus stations',     icon: '🚌' },
  { key: 'metro_station',   label: 'Metro',            icon: '🚇' },
  { key: 'taxi_service',    label: 'Taxi',             icon: '🚕' },
  { key: 'airport',         label: 'Airports',         icon: '✈️' },
  { key: 'industrial_area', label: 'Industrial',       icon: '🏭' },
  { key: 'nearby_project',  label: 'Projects',         icon: '🏗️' },
  { key: 'nearby_plant',    label: 'Plants',           icon: '⚙️' },
  { key: 'nearby_city',     label: 'Nearby cities',    icon: '🏙️' },
  { key: 'other',           label: 'Other',            icon: '📌' },
];

const iconFor = (type) => (CATEGORIES.find((c) => c.key === type)?.icon) || '📌';

export default function NearbyPoisPanel({ pois = [] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState('all');

  const presentCategories = useMemo(() => {
    const set = new Set(pois.map((p) => p.type));
    return CATEGORIES.filter((c) => c.key === 'all' || set.has(c.key));
  }, [pois]);

  const filtered = active === 'all' ? pois : pois.filter((p) => p.type === active);

  if (!pois || pois.length === 0) {
    return <div className="text-sm text-slate-500">{t('camp.noNearby', 'No nearby places listed yet.')}</div>;
  }

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2 mb-3">
        {presentCategories.map((c) => {
          const count = c.key === 'all' ? pois.length : pois.filter((p) => p.type === c.key).length;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs flex items-center gap-1 border transition ${
                active === c.key
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-navy'
              }`}
            >
              <span>{c.icon}</span>{c.label} <span className="opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        {filtered.map((p, i) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition">
            <span className="text-lg shrink-0">{iconFor(p.type)}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-navy font-medium truncate">{p.name}</div>
              <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                {p.distance_km != null && <span>📏 {p.distance_km} km</span>}
                {p.walking_time_min != null && <span>🚶 {p.walking_time_min} min</span>}
                <span className="capitalize opacity-75">{(p.type || '').replace(/_/g, ' ')}</span>
              </div>
            </div>
            {p.lat != null && p.lng != null && (
              <a
                href={`https://www.google.com/maps?q=${p.lat},${p.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs link shrink-0 mt-1"
              >
                Map
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
