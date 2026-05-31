import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { safeImage } from '../../utils/helpers';
import StarRating from '../../components/common/StarRating';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';

export default function MyCamps() {
  const { t } = useTranslation();
  const toast = useToast();
  const [camps, setCamps] = useState(null);
  const [delTarget, setDelTarget] = useState(null);

  const load = () => get('/camps/owner/my-camps').then((r) => setCamps(r.camps || [])).catch(() => setCamps([]));
  useEffect(load, []);

  const remove = async () => {
    try {
      await del(`/camps/${delTarget.id}`);
      toast.success('Camp deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('owner.myCamps')}
        subtitle={`${camps?.length || 0} camps`}
        action={<Link to="/owner/camps/new" className="btn-primary btn-sm">+ {t('owner.addCamp')}</Link>}
      />

      {camps === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {camps && camps.length === 0 && (
        <EmptyState icon="🏕️" title="No camps yet" body="Add your first listing in minutes."
          action={<Link to="/owner/camps/new" className="btn-primary">{t('owner.addCamp')}</Link>} />
      )}

      {camps && camps.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {camps.map((c) => (
            <div key={c.id} className="card overflow-hidden">
              <div className="relative h-36">
                <img src={safeImage(c.cover_photo)} alt={c.name} className="w-full h-full object-cover" />
                <div className="absolute top-2 ltr:left-2 rtl:right-2 flex gap-1">
                  <span className={`badge ${c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                  {c.is_featured && <span className="badge bg-gold text-white">★</span>}
                </div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-navy truncate">{c.name}</h4>
                  <StarRating value={c.rating} size={12} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{c.city}</div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-sm font-semibold text-navy">{c.total_capacity}</div><div className="text-[10px] text-slate-500">beds</div></div>
                  <div><div className="text-sm font-semibold text-navy">{c.occupancy_pct}%</div><div className="text-[10px] text-slate-500">occupied</div></div>
                  <div><div className="text-sm font-semibold text-navy">{c.review_count}</div><div className="text-[10px] text-slate-500">reviews</div></div>
                </div>

                <div className="flex gap-1.5 mt-4">
                  <Link to={`/owner/camps/${c.id}/edit`} className="btn-outline btn-sm flex-1 justify-center">✎ {t('common.edit')}</Link>
                  <Link to={`/owner/camps/${c.id}/rooms`} className="btn-primary btn-sm flex-1 justify-center">🛏️ Rooms</Link>
                  <button onClick={() => setDelTarget(c)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={remove}
        title="Delete camp"
        message={`Permanently delete "${delTarget?.name}"? All rooms and bookings under it will be deleted.`}
        confirmLabel={t('common.delete')}
        danger
      />
    </div>
  );
}
