import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import EmptyState from '../../components/common/EmptyState';
import { formatSAR, formatDate, statusBadgeClass } from '../../utils/formatters';

const VEHICLE_ICON = { bus: '🚌', van: '🚐', pickup: '🛻', car: '🚗' };
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

export default function TransportBooking() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [routes, setRoutes] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [bookForm, setBookForm] = useState(null);

  const reload = async () => {
    const qs = new URLSearchParams();
    if (origin)      qs.set('origin', origin);
    if (destination) qs.set('destination', destination);
    const r = await get('/transport/routes?' + qs.toString());
    setRoutes(r.routes || []);
    const b = await get('/transport/bookings/mine').catch(() => ({ bookings: [] }));
    setBookings(b.bookings || []);
  };

  useEffect(() => { reload(); }, [origin, destination]);

  const submitBooking = async () => {
    if (!bookForm) return;
    try {
      const r = await post('/transport/bookings', {
        route_id: bookForm.route_id, travel_date: bookForm.travel_date,
      });
      toast.success(`${t('transport.seatBooked', 'Seat')} #${r.booking.seat_number} ✓ (${r.seats_remaining} ${t('transport.seatsLeft', 'left')})`);
      setBookForm(null);
      reload();
    } catch (e) {
      if (e?.raw?.response?.data?.error?.includes('already have a booking')) {
        toast.warn(t('transport.alreadyBooked', 'You already have a booking on this route for this date'));
      } else if (e?.raw?.response?.data?.error?.includes('No seats')) {
        toast.error(t('transport.fullyBooked', 'Sorry — fully booked on that date'));
      } else {
        toast.error(e.message);
      }
    }
  };

  const cancelBooking = async (b) => {
    if (!confirm(t('transport.confirmCancel', 'Cancel this transport booking?'))) return;
    await put(`/transport/bookings/${b.id}/cancel`, {});
    toast.success(t('transport.cancelled', 'Booking cancelled'));
    reload();
  };

  const upcoming = useMemo(() =>
    bookings.filter((b) => b.status !== 'cancelled' && new Date(b.travel_date) >= new Date(isoDate(new Date()) + 'T00:00:00'))
  , [bookings]);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('transport.workerTitle', 'Transport bookings')}
        subtitle={t('transport.workerSubtitle', 'Reserve a seat on shuttles between camps and work sites')} />

      {/* My upcoming bookings */}
      {upcoming.length > 0 && (
        <div className="card p-4">
          <h3 className="font-semibold text-navy mb-3 text-sm">{t('transport.myUpcoming', 'My upcoming rides')}</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {upcoming.map((b) => (
              <div key={b.id} className="border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                <div className="text-2xl">{VEHICLE_ICON[b.vehicle_type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-navy">{b.route_name}</div>
                  <div className="text-xs text-slate-500">{b.origin} → {b.destination}</div>
                  <div className="text-xs text-slate-500">🕘 {b.departure_time || '—'} · seat #{b.seat_number}</div>
                  <div className="text-xs text-slate-500 mt-1">🗓️ {formatDate(b.travel_date)}</div>
                </div>
                <div className="text-end">
                  <div className="font-semibold text-navy">{formatSAR(b.amount, i18n.language)}</div>
                  <span className={`badge ${statusBadgeClass(b.status)}`}>{b.status}</span>
                  <button onClick={() => cancelBooking(b)} className="block text-xs text-rose-600 hover:underline mt-1 ms-auto">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card p-4 grid sm:grid-cols-3 gap-3">
        <div><label className="label">{t('transport.from', 'From')}</label>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={t('transport.fromPlaceholder', 'e.g. Camp, Riyadh')} className="input" /></div>
        <div><label className="label">{t('transport.to', 'To')}</label>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t('transport.toPlaceholder', 'e.g. Industrial Zone')} className="input" /></div>
        <div className="flex items-end">
          <button onClick={() => { setOrigin(''); setDestination(''); }} className="btn-ghost btn-sm">{t('common.clear')}</button>
        </div>
      </div>

      {/* Routes list */}
      <div className="space-y-2">
        <h3 className="font-semibold text-navy text-sm">{t('transport.availableRoutes', 'Available routes')}</h3>
        {routes === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
        {routes && routes.length === 0 && (
          <EmptyState icon="🚌" title={t('transport.noRoutesFound', 'No routes match')}
            body={t('transport.tryClearFilters', 'Try clearing your filters.')} />
        )}
        {routes && routes.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            {routes.map((r) => (
              <div key={r.id} className="card p-4 hover:shadow-lift transition">
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{VEHICLE_ICON[r.vehicle_type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy">{r.route_name}</div>
                    <div className="text-xs text-slate-500">{r.origin} → {r.destination}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      🕘 {r.departure_time || '—'} → {r.arrival_time || '—'}
                    </div>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(r.days_of_week || []).map((d) => <span key={d} className="chip uppercase text-[10px]">{d}</span>)}
                    </div>
                    {r.stops?.length > 0 && (
                      <div className="text-[10px] text-slate-400 mt-2">
                        {t('transport.stopsLabel', 'Stops')}: {r.stops.map((s) => s.name).join(' → ')}
                      </div>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-lg font-bold text-navy">{formatSAR(r.price_per_seat || 0, i18n.language)}</div>
                    <div className="text-[10px] text-slate-500">/ seat</div>
                  </div>
                </div>
                <button onClick={() => setBookForm({
                  route_id: r.id, route_name: r.route_name,
                  travel_date: isoDate(new Date(Date.now() + 86400_000)),
                  price: r.price_per_seat || 0,
                })} className="btn-gold btn-sm w-full mt-3">
                  {t('transport.bookSeat', 'Book seat')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* BOOKING MODAL */}
      {bookForm && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={() => setBookForm(null)}>
          <div className="bg-white rounded-xl shadow-lift w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-navy">{t('transport.book', 'Book')}: {bookForm.route_name}</h3>
            <div>
              <label className="label">{t('transport.travelDate', 'Travel date')}</label>
              <input type="date" value={bookForm.travel_date}
                min={isoDate(new Date())}
                onChange={(e) => setBookForm({ ...bookForm, travel_date: e.target.value })} className="input" />
            </div>
            <div className="bg-slate-50 rounded p-2 text-sm">
              {t('transport.priceLabel', 'Price')}: <b>{formatSAR(bookForm.price, i18n.language)}</b>
              <div className="text-[10px] text-slate-500 mt-1">
                {t('transport.seatAuto', 'A seat will be auto-assigned. You can cancel up until departure.')}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setBookForm(null)} className="btn-ghost">{t('common.cancel')}</button>
              <button onClick={submitBooking} className="btn-primary">{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
