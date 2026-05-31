import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatSAR, formatDate, formatDateTime } from '../../utils/formatters';

const VEHICLE_TYPES = ['bus', 'van', 'pickup', 'car'];
const VEHICLE_ICON = { bus: '🚌', van: '🚐', pickup: '🛻', car: '🚗' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function TransportManagement() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [tab, setTab] = useState('vehicles');
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [camps, setCamps] = useState([]);

  const [vForm, setVForm] = useState(null);
  const [vDel, setVDel] = useState(null);

  const [rForm, setRForm] = useState(null);

  // GPS ping form
  const [pingFor, setPingFor] = useState(null);
  const [pingForm, setPingForm] = useState({ latitude: '', longitude: '', speed: '' });

  const reload = async () => {
    try {
      const [v, r, b, c] = await Promise.all([
        get('/transport/vehicles'),
        get('/transport/routes'),
        get('/transport/bookings').catch(() => ({ bookings: [] })),
        get('/camps/owner/my-camps'),
      ]);
      setVehicles(v.vehicles || []);
      setRoutes(r.routes || []);
      setBookings(b.bookings || []);
      setCamps(c.camps || []);
    } catch (e) { toast.error(e.message); }
  };
  useEffect(() => { reload(); }, []);

  // ─── VEHICLE ACTIONS ───
  const openVehicle = (v) => setVForm(v || {
    plate_number: '', vehicle_type: 'bus', capacity: 30,
    camp_id: camps[0]?.id || null,
    driver_name: '', driver_phone: '', driver_iqama: '',
    gps_device_id: '', is_active: true,
  });

  const saveVehicle = async () => {
    try {
      if (vForm.id) await put(`/transport/vehicles/${vForm.id}`, vForm);
      else          await post('/transport/vehicles', vForm);
      toast.success(t('transport.vehicleSaved', 'Vehicle saved'));
      setVForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const removeVehicle = async () => {
    try {
      const r = await del(`/transport/vehicles/${vDel.id}`);
      if (r.soft) toast.warn(`Soft-deleted (had ${r.active_bookings} active bookings)`);
      else        toast.success(t('transport.vehicleDeleted', 'Vehicle deleted'));
      reload();
    } catch (e) { toast.error(e.message); }
  };

  // ─── ROUTE ACTIONS ───
  const openRoute = (r) => {
    if (vehicles.length === 0) { toast.error(t('transport.addVehicleFirst', 'Add a vehicle first')); return; }
    setRForm(r ? { ...r, stops: r.stops || [] } : {
      vehicle_id: vehicles[0].id,
      route_name: '', origin: '', destination: '',
      departure_time: '06:00', arrival_time: '08:00',
      days_of_week: ['mon', 'tue', 'wed', 'thu', 'fri'],
      price_per_seat: 10, stops: [],
      is_active: true,
    });
  };

  const saveRoute = async () => {
    try {
      if (rForm.id) await put(`/transport/routes/${rForm.id}`, rForm);
      else          await post('/transport/routes', rForm);
      toast.success(t('transport.routeSaved', 'Route saved'));
      setRForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const toggleDay = (d) => {
    if (!rForm) return;
    const cur = new Set(rForm.days_of_week || []);
    cur.has(d) ? cur.delete(d) : cur.add(d);
    setRForm({ ...rForm, days_of_week: Array.from(cur) });
  };

  const addStopRow = () => {
    setRForm({ ...rForm, stops: [...(rForm.stops || []), { name: '', order: (rForm.stops || []).length, time: '' }] });
  };
  const updateStop = (i, patch) => {
    const ss = [...(rForm.stops || [])];
    ss[i] = { ...ss[i], ...patch };
    setRForm({ ...rForm, stops: ss });
  };
  const removeStop = (i) => {
    const ss = [...(rForm.stops || [])];
    ss.splice(i, 1);
    setRForm({ ...rForm, stops: ss });
  };

  // ─── GPS ───
  const sendPing = async () => {
    try {
      await post(`/transport/tracking/${pingFor.id}`, {
        latitude: parseFloat(pingForm.latitude),
        longitude: parseFloat(pingForm.longitude),
        speed: parseFloat(pingForm.speed || 0),
      });
      toast.success(t('transport.pingSent', 'GPS ping recorded'));
      setPingFor(null); setPingForm({ latitude: '', longitude: '', speed: '' });
    } catch (e) { toast.error(e.message); }
  };

  // ─── STATS ───
  const stats = useMemo(() => ({
    vehicles: vehicles.length,
    active_vehicles: vehicles.filter((v) => v.is_active).length,
    routes: routes.length,
    bookings: bookings.length,
    revenue: bookings
      .filter((b) => b.status === 'confirmed')
      .reduce((s, b) => s + Number(b.amount || 0), 0),
  }), [vehicles, routes, bookings]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('transport.title', 'Transportation')}
        subtitle={t('transport.subtitle', 'Fleet, routes, and driver management')}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label={t('transport.vehiclesTotal', 'Vehicles')} value={`${stats.active_vehicles}/${stats.vehicles}`} icon="🚌" accent="navy" />
        <StatCard label={t('transport.routesTotal', 'Routes')}     value={stats.routes}    icon="🛣️" accent="gold" />
        <StatCard label={t('transport.bookingsTotal', 'Bookings')} value={stats.bookings}  icon="🎫" accent="blue" />
        <StatCard label={t('transport.revenueLabel', 'Revenue')}   value={formatSAR(stats.revenue, i18n.language)} icon="💰" accent="emerald" />
        <StatCard label={t('transport.driversTotal', 'Drivers')}
          value={new Set(vehicles.map((v) => v.driver_name).filter(Boolean)).size}
          icon="👤" accent="rose" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['vehicles', '🚌 ' + t('transport.tabVehicles', 'Vehicles')],
          ['routes',   '🛣️ ' + t('transport.tabRoutes', 'Routes')],
          ['bookings', '🎫 ' + t('transport.tabBookings', 'Bookings')],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 transition ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500 hover:text-navy'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── VEHICLES ─── */}
      {tab === 'vehicles' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openVehicle(null)} className="btn-primary btn-sm">
              + {t('transport.addVehicle', 'Add vehicle')}
            </button>
          </div>
          {vehicles.length === 0 ? (
            <div className="card p-8 text-center text-slate-500">
              {t('transport.noVehicles', 'No vehicles yet — add your first one.')}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {vehicles.map((v) => (
                <div key={v.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-3xl">{VEHICLE_ICON[v.vehicle_type]}</div>
                      <div className="font-semibold text-navy mt-1">{v.plate_number}</div>
                      <div className="text-xs text-slate-500 capitalize">{v.vehicle_type} · capacity {v.capacity}</div>
                    </div>
                    {v.is_active
                      ? <span className="badge bg-emerald-100 text-emerald-800">active</span>
                      : <span className="badge bg-slate-100 text-slate-600">inactive</span>}
                  </div>
                  {v.driver_name && (
                    <div className="mt-3 text-xs text-slate-600">
                      👤 {v.driver_name}{v.driver_phone && ` · ${v.driver_phone}`}
                    </div>
                  )}
                  {v.camp_name && <div className="text-xs text-slate-500 mt-1">📍 {v.camp_name}</div>}
                  <div className="flex gap-1 mt-3 flex-wrap">
                    <button onClick={() => openVehicle(v)} className="btn-outline btn-sm">edit</button>
                    <button onClick={() => { setPingFor(v); setPingForm({ latitude: '', longitude: '', speed: '' }); }} className="btn-ghost btn-sm">
                      📡 ping GPS
                    </button>
                    <button onClick={() => setVDel(v)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── ROUTES ─── */}
      {tab === 'routes' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openRoute(null)} className="btn-primary btn-sm">
              + {t('transport.addRoute', 'Add route')}
            </button>
          </div>
          {routes.length === 0 ? (
            <div className="card p-8 text-center text-slate-500">
              {t('transport.noRoutes', 'No routes yet.')}
            </div>
          ) : (
            <div className="space-y-2">
              {routes.map((r) => (
                <div key={r.id} className="card p-4">
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{VEHICLE_ICON[r.vehicle_type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-navy">{r.route_name}</span>
                        {!r.is_active && <span className="badge bg-rose-100 text-rose-700">inactive</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.origin} → {r.destination} · {r.plate_number} · cap {r.capacity}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        🕘 {r.departure_time || '—'} → {r.arrival_time || '—'}
                        {' · '}
                        {(r.days_of_week || []).join(', ').toUpperCase() || 'no days set'}
                      </div>
                      {r.stops?.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-1">
                          stops: {r.stops.map((s) => s.name).join(' → ')}
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="font-semibold text-navy">{formatSAR(r.price_per_seat || 0, i18n.language)}</div>
                      <div className="text-[10px] text-slate-500">/ seat</div>
                      <button onClick={() => openRoute(r)} className="btn-outline btn-sm mt-2">edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── BOOKINGS ─── */}
      {tab === 'bookings' && (
        <div className="card divide-y divide-slate-100">
          {bookings.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
          ) : bookings.map((b) => (
            <div key={b.id} className="p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-navy-50 text-navy flex items-center justify-center">🎫</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-navy">{b.route_name}</div>
                <div className="text-xs text-slate-500">{b.passenger} · seat #{b.seat_number} · {formatDate(b.travel_date)}</div>
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy">{formatSAR(b.amount, i18n.language)}</div>
                <span className={`badge ${b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{b.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VEHICLE MODAL */}
      <Modal open={!!vForm} onClose={() => setVForm(null)} size="lg"
        title={vForm?.id ? `Edit: ${vForm.plate_number}` : t('transport.addVehicle', 'Add vehicle')}
        footer={<>
          <button onClick={() => setVForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveVehicle} className="btn-primary">{t('common.save')}</button>
        </>}>
        {vForm && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">{t('transport.plate', 'Plate number')} *</label>
                <input value={vForm.plate_number} onChange={(e) => setVForm({ ...vForm, plate_number: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.type', 'Vehicle type')} *</label>
                <select value={vForm.vehicle_type} onChange={(e) => setVForm({ ...vForm, vehicle_type: e.target.value })} className="input">
                  {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_ICON[t]} {t}</option>)}
                </select></div>
              <div><label className="label">{t('transport.capacity', 'Capacity (seats)')} *</label>
                <input type="number" min="1" max="200" value={vForm.capacity} onChange={(e) => setVForm({ ...vForm, capacity: parseInt(e.target.value || 1, 10) })} className="input" /></div>
              <div><label className="label">{t('transport.camp', 'Camp')}</label>
                <select value={vForm.camp_id || ''} onChange={(e) => setVForm({ ...vForm, camp_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="input">
                  <option value="">— none —</option>
                  {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
              <div><label className="label">{t('transport.driverName', 'Driver name')}</label>
                <input value={vForm.driver_name || ''} onChange={(e) => setVForm({ ...vForm, driver_name: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.driverPhone', 'Driver phone')}</label>
                <input value={vForm.driver_phone || ''} onChange={(e) => setVForm({ ...vForm, driver_phone: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.driverIqama', 'Driver Iqama')}</label>
                <input value={vForm.driver_iqama || ''} onChange={(e) => setVForm({ ...vForm, driver_iqama: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.gpsDevice', 'GPS device ID')}</label>
                <input value={vForm.gps_device_id || ''} onChange={(e) => setVForm({ ...vForm, gps_device_id: e.target.value })} className="input" /></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm pt-2">
              <input type="checkbox" checked={!!vForm.is_active} onChange={(e) => setVForm({ ...vForm, is_active: e.target.checked })} className="rounded text-navy" />
              {t('transport.activeAvailable', 'Active (available for booking)')}
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!vDel} onClose={() => setVDel(null)} onConfirm={removeVehicle}
        title={t('transport.deleteVehicle', 'Delete vehicle')}
        message={`${t('transport.deleteVehicleConfirm', 'Remove')} "${vDel?.plate_number}"? (${t('transport.softNote', 'If it has active bookings it will be soft-deleted instead.')})`}
        danger />

      {/* ROUTE MODAL */}
      <Modal open={!!rForm} onClose={() => setRForm(null)} size="lg"
        title={rForm?.id ? `Edit: ${rForm.route_name}` : t('transport.addRoute', 'Add route')}
        footer={<>
          <button onClick={() => setRForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveRoute} className="btn-primary">{t('common.save')}</button>
        </>}>
        {rForm && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">{t('transport.vehicle', 'Vehicle')} *</label>
                <select value={rForm.vehicle_id} onChange={(e) => setRForm({ ...rForm, vehicle_id: parseInt(e.target.value, 10) })} className="input">
                  {vehicles.map((v) => <option key={v.id} value={v.id}>{VEHICLE_ICON[v.vehicle_type]} {v.plate_number} ({v.capacity})</option>)}
                </select></div>
              <div><label className="label">{t('transport.routeName', 'Route name')} *</label>
                <input value={rForm.route_name} onChange={(e) => setRForm({ ...rForm, route_name: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.origin', 'Origin')} *</label>
                <input value={rForm.origin} onChange={(e) => setRForm({ ...rForm, origin: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.destination', 'Destination')} *</label>
                <input value={rForm.destination} onChange={(e) => setRForm({ ...rForm, destination: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.departure', 'Departure time')}</label>
                <input type="time" value={rForm.departure_time || ''} onChange={(e) => setRForm({ ...rForm, departure_time: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.arrival', 'Arrival time')}</label>
                <input type="time" value={rForm.arrival_time || ''} onChange={(e) => setRForm({ ...rForm, arrival_time: e.target.value })} className="input" /></div>
              <div><label className="label">{t('transport.pricePerSeat', 'Price per seat (SAR)')}</label>
                <input type="number" min="0" step="0.5" value={rForm.price_per_seat || 0} onChange={(e) => setRForm({ ...rForm, price_per_seat: parseFloat(e.target.value || 0) })} className="input" /></div>
            </div>

            <div>
              <label className="label">{t('transport.daysOfWeek', 'Days of week')}</label>
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d) => (
                  <button type="button" key={d} onClick={() => toggleDay(d)}
                    className={`px-3 py-1 rounded-full text-xs uppercase border ${
                      (rForm.days_of_week || []).includes(d)
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">{t('transport.stops', 'Stops')} ({(rForm.stops || []).length})</label>
              <div className="space-y-1">
                {(rForm.stops || []).map((s, i) => (
                  <div key={i} className="flex gap-1 items-center">
                    <input value={s.name} onChange={(e) => updateStop(i, { name: e.target.value })}
                      placeholder="Stop name" className="input !py-1.5 flex-1" />
                    <input type="time" value={s.time || ''} onChange={(e) => updateStop(i, { time: e.target.value })}
                      className="input !py-1.5 w-28" />
                    <button onClick={() => removeStop(i)} className="text-rose-500 px-2">✕</button>
                  </div>
                ))}
                <button onClick={addStopRow} type="button" className="btn-outline btn-sm">+ stop</button>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!rForm.is_active} onChange={(e) => setRForm({ ...rForm, is_active: e.target.checked })} className="rounded text-navy" />
              {t('transport.activeRoute', 'Active (visible to workers)')}
            </label>
          </div>
        )}
      </Modal>

      {/* GPS PING MODAL */}
      <Modal open={!!pingFor} onClose={() => setPingFor(null)}
        title={pingFor ? `📡 Send GPS ping — ${pingFor.plate_number}` : ''}
        footer={<>
          <button onClick={() => setPingFor(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={sendPing} className="btn-primary">{t('transport.sendPing', 'Send ping')}</button>
        </>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Latitude</label>
              <input type="number" step="0.000001" value={pingForm.latitude} onChange={(e) => setPingForm({ ...pingForm, latitude: e.target.value })} placeholder="24.7136" className="input" /></div>
            <div><label className="label">Longitude</label>
              <input type="number" step="0.000001" value={pingForm.longitude} onChange={(e) => setPingForm({ ...pingForm, longitude: e.target.value })} placeholder="46.6753" className="input" /></div>
          </div>
          <div><label className="label">Speed (km/h)</label>
            <input type="number" min="0" step="0.5" value={pingForm.speed} onChange={(e) => setPingForm({ ...pingForm, speed: e.target.value })} className="input" /></div>
          <p className="text-xs text-slate-500">
            {t('transport.pingHint', 'In production this is sent automatically by your GPS device. Use this form for manual testing.')}
          </p>
        </div>
      </Modal>
    </div>
  );
}
