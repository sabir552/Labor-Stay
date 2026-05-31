import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { post } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatSAR } from '../../utils/formatters';

function todayPlus(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BookingWidget({ room, camp }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [endDate,   setEndDate]   = useState(todayPlus(8));
  const [occupants, setOccupants] = useState(1);
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!room) return;
    if (new Date(endDate) <= new Date(startDate)) return;
    setQuoting(true);
    post(`/rooms/${room.id}/quote`, { start_date: startDate, end_date: endDate, occupants })
      .then(setQuote)
      .catch(() => setQuote(null))
      .finally(() => setQuoting(false));
  }, [room?.id, startDate, endDate, occupants]);

  if (!room) {
    return (
      <div className="card p-5 text-sm text-slate-500 text-center">
        ← Select a room to see pricing
      </div>
    );
  }

  const submit = async () => {
    if (!user) {
      toast.info('Please sign in to book.');
      nav(`/login?next=/camps/${camp.id}`);
      return;
    }
    if (user.role !== 'worker') {
      toast.error('Only workers can create bookings.');
      return;
    }
    setBooking(true);
    try {
      const r = await post('/bookings', {
        room_id: room.id, start_date: startDate, end_date: endDate, occupants,
        booking_type: quote?.stay?.nights >= 28 ? 'monthly' : 'weekly',
      });
      if (r.status === 'waiting_list') {
        toast.warn(t('camp.addToWaitingList') + ' — ' + r.message);
        return;
      }
      toast.success(`Booking ${r.booking.booking_code} created.`);
      nav(`/worker/bookings/${r.booking.id}`);
    } catch (e) {
      toast.error(e.message || 'Booking failed.');
    } finally { setBooking(false); }
  };

  return (
    <div className="card p-5 sticky top-20">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-2xl font-bold text-navy">{formatSAR(room.price_per_day, i18n.language)}</div>
        <div className="text-xs text-slate-500">{t('common.perDay')}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="label !mb-1 text-xs">{t('common.checkIn')}</label>
          <input type="date" min={todayPlus(0)} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input !py-2 text-sm" />
        </div>
        <div>
          <label className="label !mb-1 text-xs">{t('common.checkOut')}</label>
          <input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input !py-2 text-sm" />
        </div>
      </div>
      <div className="mb-4">
        <label className="label !mb-1 text-xs">{t('common.occupants')}</label>
        <input type="number" min={1} max={room.capacity} value={occupants} onChange={(e) => setOccupants(parseInt(e.target.value || '1', 10))} className="input !py-2 text-sm" />
      </div>

      {/* Quote breakdown */}
      <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1.5 mb-4">
        {quoting && <div className="text-slate-500 text-xs">{t('common.loading')}</div>}
        {quote && (
          <>
            <Row label={`${quote.stay.nights} × ${formatSAR(room.price_per_day, i18n.language)}`} value={formatSAR(quote.totals.base, i18n.language)} />
            {quote.stay.breakdown.some((b) => b.type !== 'standard') && (
              <Row label={<span className="text-gold text-xs">Dynamic pricing applied</span>} value="" />
            )}
            <Row label={t('common.vat')} value={formatSAR(quote.totals.vat, i18n.language)} />
            <div className="h-px bg-slate-200 my-1" />
            <Row label={<b className="text-navy">{t('common.total')}</b>} value={<b className="text-navy">{formatSAR(quote.totals.total, i18n.language)}</b>} />
          </>
        )}
      </div>

      {room.available_beds > 0 ? (
        <button onClick={submit} disabled={booking || !quote} className="btn-gold w-full">
          {booking ? t('common.loading') : t('camp.reserveNow')}
        </button>
      ) : (
        <button onClick={submit} disabled={booking} className="btn-outline w-full">
          {t('camp.addToWaitingList')}
        </button>
      )}
      <p className="text-[10px] text-slate-400 text-center mt-2">
        🔒 Secure payment · ZATCA invoice · 24h to confirm
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-slate-600">
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
