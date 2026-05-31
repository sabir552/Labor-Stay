import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, post, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR, statusBadgeClass } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

const MEAL_ICON = { breakfast: '🥞', lunch: '🍱', dinner: '🍛', snack: '🍪' };

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function MealPlan() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [orders, setOrders] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [activeCampId, setActiveCampId] = useState(null);
  const [menu, setMenu] = useState([]);
  const [packages, setPackages] = useState([]);
  const [weekStart, setWeekStart] = useState(isoDate(new Date()));
  const [orderForm, setOrderForm] = useState(null);

  // Load orders + current bookings (camps the worker can subscribe at)
  useEffect(() => {
    get('/catering/orders/mine').then((r) => setOrders(r.orders || []));
    get('/bookings/my-bookings').then((r) => {
      const live = (r.bookings || []).filter((b) =>
        ['confirmed', 'checked_in', 'checked_out'].includes(b.status)
      );
      setBookings(live);
      // Default to the first non-checked-out camp
      const active = live.find((b) => b.status !== 'checked_out') || live[0];
      if (active) setActiveCampId(active.camp_id);
    });
  }, []);

  useEffect(() => {
    if (!activeCampId) return;
    const end = isoDate(addDays(weekStart, 6));
    get(`/catering/menu/${activeCampId}?start=${weekStart}&end=${end}`).then((r) => setMenu(r.menu || []));
    get(`/catering/packages/${activeCampId}`).then((r) => setPackages((r.packages || []).filter((p) => p.is_active)));
  }, [activeCampId, weekStart]);

  // Calendar: date → meal_type → entry
  const calendar = useMemo(() => {
    const out = {};
    for (let i = 0; i < 7; i++) {
      const d = isoDate(addDays(weekStart, i));
      out[d] = { breakfast: null, lunch: null, dinner: null, snack: null };
    }
    for (const m of menu) {
      if (out[m.date]) out[m.date][m.meal_type] = m;
    }
    return out;
  }, [menu, weekStart]);

  const recordAttendance = async (date, meal_type, attended) => {
    if (!activeCampId) return;
    try {
      await post('/catering/attendance', {
        camp_id: activeCampId, date, meal_type, attended,
      });
      toast.success(t('catering.attendanceRecorded', attended ? 'Marked attending ✓' : 'Marked absent'));
    } catch (e) { toast.error(e.message); }
  };

  const submitOrder = async () => {
    if (!orderForm) return;
    try {
      const r = await post('/catering/orders', {
        camp_id: orderForm.camp_id, package_id: orderForm.package_id,
        start_date: orderForm.start_date, end_date: orderForm.end_date,
        num_persons: orderForm.num_persons || 1, notes: orderForm.notes,
      });
      toast.success(`${t('catering.orderPlaced', 'Order placed')} — ${formatSAR(r.total, i18n.language)}`);
      setOrderForm(null);
      const fresh = await get('/catering/orders/mine');
      setOrders(fresh.orders || []);
    } catch (e) { toast.error(e.message); }
  };

  const cancelOrder = async (o) => {
    if (!confirm(t('catering.confirmCancelOrder', 'Cancel this catering order?'))) return;
    await del(`/catering/orders/${o.id}`);
    toast.success(t('catering.orderCancelled', 'Order cancelled'));
    const fresh = await get('/catering/orders/mine');
    setOrders(fresh.orders || []);
  };

  if (orders === null) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  if (bookings.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title={t('catering.mealPlan', 'Meal plan')} />
        <EmptyState icon="🍽️" title={t('catering.noStay', 'No active stay')}
          body={t('catering.noStayHint', 'Book a camp to access its meal plan and catering options.')}
          action={<Link to="/search" className="btn-primary">{t('common.search')}</Link>} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('catering.mealPlan', 'Meal plan')}
        subtitle={t('catering.mealPlanSubtitle', 'View your camp\u2019s weekly menu and manage your catering plan')} />

      {bookings.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {Array.from(new Set(bookings.map((b) => b.camp_id))).map((cid) => {
            const b = bookings.find((x) => x.camp_id === cid);
            return (
              <button key={cid} onClick={() => setActiveCampId(cid)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs border ${
                  activeCampId === cid ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
                }`}>
                {b.camp_name}
              </button>
            );
          })}
        </div>
      )}

      {/* WEEKLY MENU */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-navy">{t('catering.weeklyMenu', 'Weekly menu')}</h3>
          <button onClick={() => setWeekStart(isoDate(addDays(weekStart, -7)))} className="btn-ghost btn-sm ms-auto">←</button>
          <span className="text-xs text-slate-500">{weekStart} → {isoDate(addDays(weekStart, 6))}</span>
          <button onClick={() => setWeekStart(isoDate(addDays(weekStart, 7)))} className="btn-ghost btn-sm">→</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-start px-3 py-2">Day</th>
                {['breakfast', 'lunch', 'dinner', 'snack'].map((m) =>
                  <th key={m} className="text-start px-3 py-2">{MEAL_ICON[m]} {m}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(calendar).map(([date, meals]) => (
                <tr key={date}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-navy">{formatDate(date)}</div>
                    <div className="text-[10px] text-slate-400">{new Date(date).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  </td>
                  {['breakfast', 'lunch', 'dinner', 'snack'].map((m) => {
                    const entry = meals[m];
                    return (
                      <td key={m} className="px-3 py-2 align-top">
                        {entry ? (
                          <div className="bg-slate-50 rounded p-2">
                            <div className="text-xs text-navy">{(entry.items || []).join(', ') || '—'}</div>
                            {entry.dietary_options?.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {entry.dietary_options.map((d) => <span key={d} className="text-[9px] chip">{d}</span>)}
                              </div>
                            )}
                            <div className="flex gap-1 mt-2">
                              <button onClick={() => recordAttendance(date, m, true)}
                                className="text-[10px] text-emerald-600 hover:underline">✓ I'll attend</button>
                              <button onClick={() => recordAttendance(date, m, false)}
                                className="text-[10px] text-slate-400 hover:text-rose-600">skip</button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PACKAGES */}
      <div className="card p-4">
        <h3 className="font-semibold text-navy mb-3">{t('catering.packages', 'Available packages')}</h3>
        {packages.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-6">
            {t('catering.noActivePackages', 'No catering packages available at this camp.')}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {packages.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-lg p-3 hover:shadow-soft transition">
                <div className="font-semibold text-navy">{p.name}</div>
                <div className="text-xs text-slate-500 line-clamp-2 min-h-[2em]">{p.description}</div>
                <div className="flex gap-1 mt-2 text-xs">
                  {p.includes_breakfast && <span className="chip">🥞</span>}
                  {p.includes_lunch     && <span className="chip">🍱</span>}
                  {p.includes_dinner    && <span className="chip">🍛</span>}
                </div>
                <div className="text-xl font-bold text-navy mt-2">
                  {formatSAR(p.price_per_day, i18n.language)}<span className="text-xs text-slate-500"> /day</span>
                </div>
                <button onClick={() => setOrderForm({
                  camp_id: activeCampId, package_id: p.id, package_name: p.name, price: p.price_per_day,
                  start_date: isoDate(new Date()),
                  end_date:   isoDate(addDays(new Date(), 7)),
                  num_persons: 1, notes: '',
                })} className="btn-gold btn-sm w-full mt-3">{t('catering.orderNow', 'Order')}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MY ORDERS */}
      <div className="card p-4">
        <h3 className="font-semibold text-navy mb-3">{t('catering.myOrders', 'My catering orders')}</h3>
        {orders.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-4">{t('common.noData')}</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((o) => (
              <div key={o.id} className="py-3 flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/15 text-gold-600 flex items-center justify-center">🧾</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-navy">{o.package_name}</span>
                    <span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">{o.camp_name} · {formatDate(o.start_date)} → {formatDate(o.end_date)} · {o.num_persons} person(s)</div>
                </div>
                <div className="text-end">
                  <div className="font-semibold text-navy">{formatSAR(o.total_cost, i18n.language)}</div>
                  {o.status === 'pending' && (
                    <button onClick={() => cancelOrder(o)} className="text-xs text-rose-600 hover:underline mt-1">cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ORDER MODAL (inline simple form) */}
      {orderForm && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={() => setOrderForm(null)}>
          <div className="bg-white rounded-xl shadow-lift w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-navy">Order: {orderForm.package_name}</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">From</label>
                <input type="date" value={orderForm.start_date} onChange={(e) => setOrderForm({ ...orderForm, start_date: e.target.value })} className="input" />
              </div>
              <div>
                <label className="label">To</label>
                <input type="date" value={orderForm.end_date} onChange={(e) => setOrderForm({ ...orderForm, end_date: e.target.value })} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Persons</label>
              <input type="number" min="1" value={orderForm.num_persons} onChange={(e) => setOrderForm({ ...orderForm, num_persons: parseInt(e.target.value || 1, 10) })} className="input" />
            </div>
            <div>
              <label className="label">Notes (allergies, preferences…)</label>
              <textarea rows={2} value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} className="input" />
            </div>
            <div className="bg-slate-50 rounded p-2 text-sm">
              Estimated total: <b>{formatSAR(
                orderForm.price * Math.max(1, Math.ceil((new Date(orderForm.end_date) - new Date(orderForm.start_date)) / 86400000)) * (orderForm.num_persons || 1),
                i18n.language
              )}</b>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOrderForm(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={submitOrder} className="btn-primary">{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
