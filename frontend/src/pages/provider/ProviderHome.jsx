import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatCard, SectionHeader } from '../../components/layout/DashboardLayout';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';

export default function ProviderHome() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [services, setServices] = useState(null);
  const [requests, setRequests] = useState(null);

  useEffect(() => {
    get('/services', { limit: 50 }).then((r) => setServices((r.services || []).filter((s) => s.provider_id === user.id))).catch(() => setServices([]));
    get('/services/requests/my').then((r) => setRequests(r.requests || [])).catch(() => setRequests([]));
  }, [user.id]);

  const pending = (requests || []).filter((r) => r.status === 'pending');
  const quoted = (requests || []).filter((r) => r.status === 'quoted' || r.status === 'accepted');

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-gold to-gold-500 text-white rounded-2xl p-6 lg:p-8">
        <h1 className="text-2xl lg:text-3xl font-bold">Provider dashboard</h1>
        <p className="text-white/90 mt-1">Hi {user?.full_name?.split(' ')[0]} — manage your services and RFQs</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="My services"      value={services?.length || 0} icon="🛠️" accent="gold" />
        <StatCard label="Pending RFQs"     value={pending.length} icon="⏳" accent="navy" />
        <StatCard label="Quoted"           value={quoted.length} icon="💬" accent="blue" />
        <StatCard label="Total requests"   value={requests?.length || 0} icon="📋" accent="emerald" />
      </div>

      <section>
        <SectionHeader title="New requests for quotation"
          action={<Link to="/provider/requests" className="btn-outline btn-sm">{t('common.viewDetails')}</Link>} />
        {pending.length === 0 && <EmptyState icon="📥" title="No pending RFQs" body="You're all caught up." />}
        {pending.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {pending.slice(0, 5).map((r) => (
              <Link key={r.id} to={`/provider/requests`} className="block p-4 hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">⏳</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-navy truncate">{r.service_name} — qty {r.quantity}</div>
                    <div className="text-xs text-slate-500 line-clamp-1">{r.description}</div>
                  </div>
                  <div className="text-xs text-slate-400">{formatDate(r.created_at)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="My services"
          action={<Link to="/provider/services" className="btn-primary btn-sm">+ Add service</Link>} />
        {(services || []).length === 0 && (
          <EmptyState icon="🛠️" title="No services listed yet" action={<Link to="/provider/services" className="btn-primary">+ Add your first service</Link>} />
        )}
        {(services || []).length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {services.slice(0, 4).map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-navy">{s.name}</div>
                    <div className="text-xs text-slate-500 capitalize">{s.category?.replace('_', ' ')}</div>
                  </div>
                  <div className="text-end">
                    <div className="font-bold text-navy">{formatSAR(s.base_price, i18n.language)}</div>
                    <div className="text-[10px] text-slate-500">{(s.pricing_type || 'fixed').replace(/_/g, ' ')}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
