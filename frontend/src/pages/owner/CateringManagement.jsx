import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatSAR, formatDate } from '../../utils/formatters';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_ICON = { breakfast: '🥞', lunch: '🍱', dinner: '🍛', snack: '🍪' };
const DIETARY = ['halal', 'vegetarian', 'vegan', 'diabetic'];

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export default function CateringManagement() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState(null);
  const [campId, setCampId] = useState(null);
  const [tab, setTab] = useState('menu');

  // Menu state
  const [weekStart, setWeekStart] = useState(isoDate(new Date()));
  const [menu, setMenu] = useState([]);
  const [editor, setEditor] = useState(null);            // editing menu entry
  const [editForm, setEditForm] = useState({});

  // Packages state
  const [packages, setPackages] = useState([]);
  const [pkgOpen, setPkgOpen] = useState(false);
  const [pkgForm, setPkgForm] = useState(null);
  const [pkgDel, setPkgDel] = useState(null);

  // Orders + attendance
  const [orders, setOrders] = useState([]);
  const [attendance, setAttendance] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!campId) return;
    const end = isoDate(addDays(weekStart, 6));
    get(`/catering/menu/${campId}?start=${weekStart}&end=${end}`).then((r) => setMenu(r.menu || []));
    get(`/catering/packages/${campId}`).then((r) => setPackages(r.packages || []));
    get('/catering/orders').then((r) => {
      setOrders((r.orders || []).filter((o) => o.camp_id === campId));
    });
    get(`/catering/attendance/${campId}`).then(setAttendance).catch(() => setAttendance(null));
  }, [campId, weekStart]);

  // Build a {date → {meal_type → entry}} map for the calendar
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

  const openEditor = (date, meal_type, entry) => {
    setEditor({ date, meal_type });
    setEditForm({
      items: (entry?.items || []).join(', '),
      dietary_options: entry?.dietary_options || [],
      cost_per_person: entry?.cost_per_person ?? 0,
      id: entry?.id,
    });
  };

  const saveMenu = async () => {
    if (!editor || !campId) return;
    const itemsArr = (editForm.items || '')
      .split(',').map((s) => s.trim()).filter(Boolean);
    try {
      await post('/catering/menu', {
        camp_id: campId, date: editor.date, meal_type: editor.meal_type,
        items: itemsArr,
        dietary_options: editForm.dietary_options || [],
        cost_per_person: parseFloat(editForm.cost_per_person || 0),
      });
      toast.success(t('catering.menuSaved', 'Menu saved'));
      setEditor(null);
      const end = isoDate(addDays(weekStart, 6));
      get(`/catering/menu/${campId}?start=${weekStart}&end=${end}`).then((r) => setMenu(r.menu || []));
    } catch (e) { toast.error(e.message); }
  };

  const removeMenu = async (id) => {
    if (!confirm(t('catering.confirmDeleteMenu', 'Remove this menu item?'))) return;
    await del(`/catering/menu/${id}`);
    toast.success(t('catering.menuDeleted', 'Menu item removed'));
    const end = isoDate(addDays(weekStart, 6));
    get(`/catering/menu/${campId}?start=${weekStart}&end=${end}`).then((r) => setMenu(r.menu || []));
  };

  const savePackage = async () => {
    try {
      if (pkgForm.id) {
        await put(`/catering/packages/${pkgForm.id}`, pkgForm);
      } else {
        await post('/catering/packages', { ...pkgForm, camp_id: campId });
      }
      toast.success(t('catering.packageSaved', 'Package saved'));
      setPkgOpen(false);
      get(`/catering/packages/${campId}`).then((r) => setPackages(r.packages || []));
    } catch (e) { toast.error(e.message); }
  };

  const removePackage = async () => {
    if (!pkgDel) return;
    await del(`/catering/packages/${pkgDel.id}`);
    toast.success(t('catering.packageDeleted', 'Package removed'));
    get(`/catering/packages/${campId}`).then((r) => setPackages(r.packages || []));
  };

  const orderAction = async (id, status) => {
    await put(`/catering/orders/${id}/status`, { status });
    toast.success(t('catering.orderUpdated', 'Order updated'));
    get('/catering/orders').then((r) => setOrders((r.orders || []).filter((o) => o.camp_id === campId)));
  };

  if (!camps) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;
  if (!camps.length) {
    return (
      <div className="card p-8 text-center">
        <div className="text-5xl mb-3">🍽️</div>
        <p className="text-slate-600">{t('catering.noCamps', 'You need a camp before setting up catering.')}</p>
      </div>
    );
  }

  const totals = {
    weekMeals: menu.length,
    avgCost: menu.length ? Math.round(menu.reduce((s, m) => s + Number(m.cost_per_person || 0), 0) / menu.length * 100) / 100 : 0,
    activeOrders: orders.filter((o) => ['pending', 'approved'].includes(o.status)).length,
    served: attendance?.summary?.by_meal
      ? Object.values(attendance.summary.by_meal).reduce((a, b) => a + b, 0)
      : 0,
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('catering.title', 'Catering management')}
        subtitle={t('catering.subtitle', 'Weekly menu, packages, orders, and attendance')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('catering.weekMeals', 'Meals this week')}   value={totals.weekMeals}        icon="🍽️" />
        <StatCard label={t('catering.avgCost',  'Avg cost/person')}    value={formatSAR(totals.avgCost, i18n.language)} icon="💰" accent="gold" />
        <StatCard label={t('catering.activeOrders', 'Active orders')}  value={totals.activeOrders}     icon="📋" accent="emerald" />
        <StatCard label={t('catering.servedRecent', 'Meals served')}   value={totals.served}            icon="✓" accent="blue" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['menu',       '🗓️ Weekly menu'],
          ['packages',   '📦 Packages'],
          ['orders',     '🧾 Orders'],
          ['attendance', '✓ Attendance'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 transition ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500 hover:text-navy'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* MENU */}
      {tab === 'menu' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeekStart(isoDate(addDays(weekStart, -7)))} className="btn-ghost btn-sm">← prev week</button>
            <span className="text-sm text-slate-500">{weekStart} → {isoDate(addDays(weekStart, 6))}</span>
            <button onClick={() => setWeekStart(isoDate(addDays(weekStart, 7)))} className="btn-ghost btn-sm">next week →</button>
            <button onClick={() => setWeekStart(isoDate(new Date()))} className="btn-outline btn-sm ms-auto">Today</button>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-start px-3 py-2">Date</th>
                  {MEALS.map((m) => <th key={m} className="text-start px-3 py-2">{MEAL_ICON[m]} {m}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(calendar).map(([date, mealsForDay]) => (
                  <tr key={date}>
                    <td className="px-3 py-2 align-top">
                      <div className="font-medium text-navy">{formatDate(date)}</div>
                      <div className="text-[10px] text-slate-400">{new Date(date).toLocaleDateString(undefined, { weekday: 'short' })}</div>
                    </td>
                    {MEALS.map((m) => {
                      const entry = mealsForDay[m];
                      return (
                        <td key={m} className="px-3 py-2 align-top">
                          {entry ? (
                            <div className="bg-slate-50 rounded p-2">
                              <div className="text-xs text-navy line-clamp-2">{entry.items?.join(', ') || '—'}</div>
                              <div className="text-[10px] text-slate-500 mt-1">{formatSAR(entry.cost_per_person, i18n.language)}/pp</div>
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => openEditor(date, m, entry)} className="text-[10px] link">edit</button>
                                <button onClick={() => removeMenu(entry.id)} className="text-[10px] text-rose-500 hover:underline">del</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => openEditor(date, m, null)} className="text-xs text-slate-400 hover:text-navy">+ add</button>
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
      )}

      {/* PACKAGES */}
      {tab === 'packages' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => { setPkgForm({ name: '', description: '', includes_breakfast: true, includes_lunch: true, includes_dinner: true, price_per_day: 30, is_active: true }); setPkgOpen(true); }} className="btn-primary btn-sm">+ Add package</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {packages.map((p) => (
              <div key={p.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-navy">{p.name}</h4>
                    <div className="text-xs text-slate-500 line-clamp-2">{p.description}</div>
                  </div>
                  {p.is_active
                    ? <span className="badge bg-emerald-100 text-emerald-800">active</span>
                    : <span className="badge bg-slate-100 text-slate-600">inactive</span>}
                </div>
                <div className="text-2xl font-bold text-navy mt-2">{formatSAR(p.price_per_day, i18n.language)}<span className="text-xs text-slate-500"> / day</span></div>
                <div className="flex gap-1 mt-2 text-xs">
                  {p.includes_breakfast && <span className="chip">🥞 Breakfast</span>}
                  {p.includes_lunch     && <span className="chip">🍱 Lunch</span>}
                  {p.includes_dinner    && <span className="chip">🍛 Dinner</span>}
                </div>
                <div className="flex gap-1 mt-3">
                  <button onClick={() => { setPkgForm({ ...p }); setPkgOpen(true); }} className="btn-outline btn-sm">edit</button>
                  <button onClick={() => setPkgDel(p)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">delete</button>
                </div>
              </div>
            ))}
            {packages.length === 0 && (
              <div className="card p-8 text-center text-slate-500 text-sm col-span-full">
                {t('catering.noPackages', 'No packages yet — add your first meal plan.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDERS */}
      {tab === 'orders' && (
        <div className="card divide-y divide-slate-100">
          {orders.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-sm">No catering orders yet.</div>
          )}
          {orders.map((o) => (
            <div key={o.id} className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gold/15 text-gold-600 flex items-center justify-center text-lg">🧾</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-navy">{o.package_name}</span>
                  <span className={`badge ${
                    o.status === 'approved'  ? 'bg-emerald-100 text-emerald-800'
                    : o.status === 'pending' ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                  }`}>{o.status}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {o.worker_name} · {formatDate(o.start_date)} → {formatDate(o.end_date)} · {o.num_persons} person(s)
                </div>
                {o.notes && <div className="text-xs text-slate-400 mt-1 italic">"{o.notes}"</div>}
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy">{formatSAR(o.total_cost, i18n.language)}</div>
                {o.status === 'pending' && (
                  <div className="flex gap-1 mt-2 justify-end">
                    <button onClick={() => orderAction(o.id, 'approved')} className="btn-primary btn-sm">approve</button>
                    <button onClick={() => orderAction(o.id, 'rejected')} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ATTENDANCE */}
      {tab === 'attendance' && (
        <div className="card p-4">
          {!attendance ? (
            <div className="text-slate-500 text-sm">{t('common.loading')}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total entries"  value={attendance.summary?.total || 0} icon="📊" />
                <StatCard label="Unique workers" value={attendance.summary?.unique_workers || 0} icon="🧰" accent="blue" />
                <StatCard label="Days tracked"   value={Object.keys(attendance.summary?.by_date || {}).length} icon="📅" accent="gold" />
                <StatCard label="Last 7 days served" value={totals.served} icon="✓" accent="emerald" />
              </div>

              <h4 className="font-semibold text-navy text-sm mb-2">By meal</h4>
              <div className="flex gap-2 mb-4">
                {MEALS.map((m) => (
                  <div key={m} className="flex-1 bg-slate-50 rounded p-3 text-center">
                    <div className="text-2xl">{MEAL_ICON[m]}</div>
                    <div className="text-xs text-slate-500 capitalize">{m}</div>
                    <div className="text-lg font-bold text-navy">{attendance.summary?.by_meal?.[m] || 0}</div>
                  </div>
                ))}
              </div>

              <h4 className="font-semibold text-navy text-sm mb-2">Recent entries</h4>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {(attendance.attendance || []).slice(0, 50).map((a) => (
                  <div key={a.id} className="py-2 flex items-center justify-between text-sm">
                    <span>{MEAL_ICON[a.meal_type]} <b>{a.worker_name}</b></span>
                    <span className="text-slate-500 text-xs">{formatDate(a.date)} · {a.meal_type} · {a.attended ? '✅ attended' : '❌ absent'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* MENU EDITOR MODAL */}
      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor ? `${MEAL_ICON[editor.meal_type]} ${editor.meal_type} — ${editor.date}` : ''}
        footer={<>
          <button onClick={() => setEditor(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveMenu} className="btn-primary">{t('common.save')}</button>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="label">Items (comma-separated)</label>
            <textarea rows={3} value={editForm.items || ''} onChange={(e) => setEditForm({ ...editForm, items: e.target.value })}
              className="input" placeholder="e.g. Foul medames, Pita bread, Tea" />
          </div>
          <div>
            <label className="label">Dietary options</label>
            <div className="flex flex-wrap gap-2">
              {DIETARY.map((d) => (
                <button type="button" key={d}
                  onClick={() => {
                    const cur = new Set(editForm.dietary_options || []);
                    cur.has(d) ? cur.delete(d) : cur.add(d);
                    setEditForm({ ...editForm, dietary_options: Array.from(cur) });
                  }}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    (editForm.dietary_options || []).includes(d)
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Cost per person (SAR)</label>
            <input type="number" min="0" step="0.5" value={editForm.cost_per_person || 0}
              onChange={(e) => setEditForm({ ...editForm, cost_per_person: e.target.value })}
              className="input" />
          </div>
        </div>
      </Modal>

      {/* PACKAGE MODAL */}
      <Modal open={pkgOpen} onClose={() => setPkgOpen(false)} title={pkgForm?.id ? `Edit: ${pkgForm.name}` : 'Add package'}
        footer={<>
          <button onClick={() => setPkgOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={savePackage} className="btn-primary">{t('common.save')}</button>
        </>}>
        {pkgForm && (
          <div className="space-y-3">
            <div><label className="label">Name *</label>
              <input value={pkgForm.name} onChange={(e) => setPkgForm({ ...pkgForm, name: e.target.value })} className="input" /></div>
            <div><label className="label">Description</label>
              <textarea rows={2} value={pkgForm.description || ''} onChange={(e) => setPkgForm({ ...pkgForm, description: e.target.value })} className="input" /></div>
            <div className="flex gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!pkgForm.includes_breakfast} onChange={(e) => setPkgForm({ ...pkgForm, includes_breakfast: e.target.checked })} className="rounded text-navy" />
                🥞 Breakfast
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!pkgForm.includes_lunch} onChange={(e) => setPkgForm({ ...pkgForm, includes_lunch: e.target.checked })} className="rounded text-navy" />
                🍱 Lunch
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!pkgForm.includes_dinner} onChange={(e) => setPkgForm({ ...pkgForm, includes_dinner: e.target.checked })} className="rounded text-navy" />
                🍛 Dinner
              </label>
            </div>
            <div><label className="label">Price per day (SAR) *</label>
              <input type="number" min="0" step="0.5" value={pkgForm.price_per_day} onChange={(e) => setPkgForm({ ...pkgForm, price_per_day: parseFloat(e.target.value || 0) })} className="input" /></div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!pkgForm.is_active} onChange={(e) => setPkgForm({ ...pkgForm, is_active: e.target.checked })} className="rounded text-navy" />
              Active (visible to workers)
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!pkgDel} onClose={() => setPkgDel(null)} onConfirm={removePackage}
        title="Delete package" message={`Remove "${pkgDel?.name}"?`} danger />
    </div>
  );
}
