import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function MyEquipmentBookings() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(null);
  useEffect(() => { get('/equipment/bookings/my').then((r) => setItems(r.bookings || [])).catch(() => setItems([])); }, []);

  return (
    <div className="space-y-4">
      <SectionHeader title="Equipment bookings"
        subtitle={items ? `${items.length} bookings` : ''}
        action={<Link to="/equipment" className="btn-outline btn-sm">Browse equipment</Link>} />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && <EmptyState icon="🚜" title="No equipment bookings yet" action={<Link to="/equipment" className="btn-primary">Browse equipment</Link>} />}

      {items && items.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {items.map((b) => (
            <div key={b.id} className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-navy-50 text-navy text-xl flex items-center justify-center">🚜</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-navy">{b.equipment_name}</div>
                  <span className={`badge ${statusBadgeClass(b.status)}`}>{b.status}</span>
                </div>
                <div className="text-xs text-slate-500 capitalize">{b.category?.replace('_', ' ')} · {b.rental_type}</div>
                <div className="text-xs text-slate-500">{formatDate(b.start_date)} → {formatDate(b.end_date)}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">{b.booking_code}</div>
              </div>
              <div className="text-end">
                <div className="font-bold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                {b.operator_assigned ? <div className="text-[10px] text-emerald-700">+ operator</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
