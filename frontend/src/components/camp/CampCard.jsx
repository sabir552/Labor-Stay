import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StarRating from '../common/StarRating';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';

export default function CampCard({ camp }) {
  const { t, i18n } = useTranslation();
  return (
    <Link to={`/camps/${camp.id}`} className="card overflow-hidden group hover:shadow-lift transition block">
      <div className="relative h-48 overflow-hidden bg-slate-100">
        <img
          src={safeImage(camp.cover_photo)}
          alt={camp.name}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <div className="absolute top-2 ltr:left-2 rtl:right-2 flex gap-1">
          {camp.is_featured && <span className="badge bg-gold text-white">★ {t('camp.featured')}</span>}
          {camp.status === 'approved' && <span className="badge bg-emerald-100 text-emerald-800">✓</span>}
        </div>
        {camp.min_price_day != null && (
          <span className="absolute bottom-2 ltr:right-2 rtl:left-2 badge bg-white text-navy font-bold shadow">
            {t('common.from')} {formatSAR(camp.min_price_day, i18n.language)}{t('common.perDay')}
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-navy line-clamp-1 group-hover:text-gold">{camp.name}</h3>
          <StarRating value={camp.rating} size={12} />
        </div>
        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
          <span>📍</span>{camp.city}{camp.region ? `, ${camp.region}` : ''}
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {(camp.amenities || []).slice(0, 4).map((a) => (
            <span key={a} className="chip">{a}</span>
          ))}
          {(camp.amenities || []).length > 4 && <span className="chip">+{camp.amenities.length - 4}</span>}
        </div>
        {camp.distance_km != null && (
          <div className="mt-2 text-xs text-slate-500">~{camp.distance_km.toFixed(1)} km away</div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault(); e.stopPropagation();
            window.dispatchEvent(new CustomEvent('laborstay:compare:add', { detail: { id: camp.id, name: camp.name } }));
          }}
          className="text-[10px] text-slate-400 hover:text-navy mt-2"
          aria-label="compareAdd"
        >
          + {t('compare.addToCompare', 'Add to compare')}
        </button>
      </div>
    </Link>
  );
}
