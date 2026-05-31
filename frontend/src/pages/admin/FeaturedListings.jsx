import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import StarRating from '../../components/common/StarRating';
import { safeImage } from '../../utils/helpers';

export default function FeaturedListings() {
  const { t } = useTranslation();
  const toast = useToast();
  const [camps, setCamps] = useState(null);
  const [filter, setFilter] = useState('approved');

  const load = () => {
    get('/admin/camps', filter === 'all' ? {} : { status: filter })
      .then((r) => setCamps(r.camps || []))
      .catch(() => setCamps([]));
  };
  useEffect(load, [filter]);

  const toggleFeatured = async (id) => {
    try {
      const r = await put(`/admin/camps/${id}/featured`);
      toast.success(r.is_featured ? 'Featured ★' : 'Removed from featured');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const featuredCount = (camps || []).filter((c) => c.is_featured).length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('admin.featuredListings')}
        subtitle={camps ? `${featuredCount} featured · ${camps.length} total ${filter}` : ''}
      />

      <div className="flex gap-2">
        {['approved', 'all', 'pending'].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border capitalize ${filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}>
            {s}
          </button>
        ))}
      </div>

      {camps === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}

      {camps && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {camps.map((c) => (
            <div key={c.id} className={`card overflow-hidden border-2 transition ${c.is_featured ? 'border-gold' : 'border-transparent'}`}>
              <div className="relative h-32 bg-slate-100">
                <div className="absolute inset-0 bg-gradient-to-br from-navy/80 to-navy-700/80 flex items-center justify-center text-white text-3xl">🏕️</div>
                {c.is_featured && <span className="absolute top-2 ltr:left-2 rtl:right-2 badge bg-gold text-white">★ FEATURED</span>}
              </div>
              <div className="p-3">
                <h4 className="font-semibold text-navy truncate">{c.name}</h4>
                <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                  <span>{c.city}</span>
                  <StarRating value={c.rating} size={11} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1 capitalize">{c.status} · {c.owner_name}</div>
                <div className="flex gap-2 mt-3">
                  <Link to={`/camps/${c.id}`} target="_blank" className="btn-ghost btn-sm flex-1 justify-center">👁 View</Link>
                  <button
                    onClick={() => toggleFeatured(c.id)}
                    className={`btn-sm flex-1 justify-center ${c.is_featured ? 'btn-outline border-rose-300 text-rose-700' : 'btn-gold'}`}>
                    {c.is_featured ? 'Unfeature' : '★ Feature'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
