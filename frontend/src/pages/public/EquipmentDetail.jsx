import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';

function todayPlus(d) { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); }

export default function EquipmentDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [form, setForm] = useState({ start_date: todayPlus(1), end_date: todayPlus(8), rental_type: 'daily', operator_assigned: false });
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    get(`/equipment/${id}`).then(setData).catch(() => setData(null));
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!user) { toast.info('Please sign in first'); nav(`/login?next=/equipment/${id}`); return; }
    setBooking(true);
    try {
      const r = await post('/equipment/bookings', { equipment_id: parseInt(id, 10), ...form });
      toast.success(`Booking ${r.booking.booking_code} submitted (${r.days} days = ${formatSAR(r.total, i18n.language)})`);
      nav(user.role === 'owner' ? '/owner/equipment-bookings' : '/worker/equipment-bookings');
    } catch (e) { toast.error(e.message); }
    finally { setBooking(false); }
  };

  if (!data?.equipment) return <div className="max-w-3xl mx-auto py-24 text-center text-slate-500">{t('common.loading')}</div>;
  const eq = data.equipment;
  const days = Math.max(1, Math.ceil((new Date(form.end_date) - new Date(form.start_date)) / 86400000));
  const rate = form.rental_type === 'monthly' ? eq.monthly_rate : form.rental_type === 'weekly' ? eq.weekly_rate : eq.daily_rate;
  const units = form.rental_type === 'monthly' ? Math.ceil(days / 28) : form.rental_type === 'weekly' ? Math.ceil(days / 7) : days;
  const estTotal = rate * units;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="text-xs text-slate-500 mb-3">
        <Link to="/" className="hover:text-navy">{t('nav.home')}</Link> ›{' '}
        <Link to="/equipment" className="hover:text-navy">{t('nav.equipment')}</Link> ›{' '}
        <span className="text-navy">{eq.name}</span>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="card overflow-hidden">
            <img src={safeImage(eq.photos?.[0])} alt={eq.name} className="w-full h-72 object-cover" />
            {eq.photos && eq.photos.length > 1 && (
              <div className="grid grid-cols-4 gap-1 p-1">
                {eq.photos.slice(1, 5).map((p, i) => <img key={i} src={p} alt="" className="aspect-square object-cover rounded" />)}
              </div>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`badge capitalize ${eq.status === 'available' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>{eq.status}</span>
              <span className="badge bg-navy-50 text-navy capitalize">{eq.category?.replace('_', ' ')}</span>
            </div>
            <h1 className="text-2xl font-bold text-navy">{eq.name}</h1>
            <div className="text-sm text-slate-500 mt-1">{eq.manufacturer} {eq.model && `· ${eq.model}`} · 📍 {eq.city}</div>
            <p className="text-slate-600 mt-3">{eq.description}</p>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-3">Specifications</h3>
            <div className="grid sm:grid-cols-2 gap-y-2 text-sm">
              <Spec label="Daily rate"   value={formatSAR(eq.daily_rate, i18n.language)} />
              <Spec label="Weekly rate"  value={formatSAR(eq.weekly_rate, i18n.language)} />
              <Spec label="Monthly rate" value={formatSAR(eq.monthly_rate, i18n.language)} />
              <Spec label="Fuel type"    value={eq.fuel_type || '—'} />
              <Spec label="Operator"     value={eq.operator_included ? '✓ Included on request' : 'Self-operate'} />
              <Spec label="Delivery"     value={eq.delivery_available ? `${formatSAR(eq.delivery_charge, i18n.language)} delivery available` : 'Pickup only'} />
              {Object.entries(eq.specifications || {}).map(([k, v]) => <Spec key={k} label={k} value={String(v)} />)}
            </div>
          </div>

          {data.owner && (
            <div className="card p-5">
              <h3 className="font-semibold text-navy mb-2">Provided by</h3>
              <div className="text-sm font-medium text-navy">{data.owner.company_name || data.owner.full_name}</div>
            </div>
          )}
        </div>

        {/* Booking widget */}
        <div className="lg:col-span-1">
          <form onSubmit={submit} className="card p-5 sticky top-20 space-y-3">
            <div className="text-2xl font-bold text-navy">{formatSAR(eq.daily_rate, i18n.language)} <span className="text-xs text-slate-500 font-normal">/ day</span></div>

            <div>
              <label className="label !mb-1 text-xs">Rental type</label>
              <select value={form.rental_type} onChange={(e) => setForm({ ...form, rental_type: e.target.value })} className="input !py-2 text-sm">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label !mb-1 text-xs">From</label>
                <input type="date" min={todayPlus(0)} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input !py-2 text-sm" />
              </div>
              <div>
                <label className="label !mb-1 text-xs">To</label>
                <input type="date" min={form.start_date} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="input !py-2 text-sm" />
              </div>
            </div>
            {eq.operator_included && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.operator_assigned} onChange={(e) => setForm({ ...form, operator_assigned: e.target.checked })} className="rounded text-navy" />
                <span>👷 Add operator</span>
              </label>
            )}

            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between text-slate-600"><span>{units} × {formatSAR(rate, i18n.language)}</span><span>{formatSAR(estTotal, i18n.language)}</span></div>
              <div className="flex justify-between font-bold text-navy"><span>Est. total</span><span>{formatSAR(estTotal, i18n.language)}</span></div>
            </div>

            <button type="submit" disabled={booking || eq.status !== 'available'} className="btn-gold w-full">
              {eq.status === 'available' ? (booking ? t('common.loading') : 'Request booking') : 'Currently unavailable'}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Owner will confirm within 24 hours.</p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value }) {
  return (
    <div className="flex items-center justify-between sm:justify-start sm:gap-2">
      <span className="text-slate-500 capitalize">{label}:</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}
