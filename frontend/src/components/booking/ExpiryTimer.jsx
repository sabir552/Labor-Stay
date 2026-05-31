import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * A2 — Live countdown for unpaid pending bookings.
 *
 * Props:
 *   createdAt    — ISO timestamp of booking creation
 *   windowHours  — countdown window (default 24)
 *   onExpire     — callback fired once when timer hits zero
 *
 * Shows:  "Pay within HH:MM:SS or booking will be auto-cancelled"
 * Red when < 1h remaining. Replaces itself with "Booking expired" at 0.
 */
export default function ExpiryTimer({ createdAt, windowHours = 24, onExpire, compact = false }) {
  const { t } = useTranslation();
  const expiry = new Date(createdAt).getTime() + windowHours * 3600_000;
  const [now, setNow] = useState(Date.now());
  const [fired, setFired] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fired && now >= expiry) {
      setFired(true);
      try { onExpire?.(); } catch {}
    }
  }, [now, expiry, fired, onExpire]);

  const remainingMs = Math.max(0, expiry - now);
  const expired = remainingMs <= 0;
  const urgent  = remainingMs <= 3600_000 && !expired;

  const hh = Math.floor(remainingMs / 3600_000);
  const mm = Math.floor((remainingMs % 3600_000) / 60_000);
  const ss = Math.floor((remainingMs % 60_000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const text = expired ? '00:00:00' : `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  const tone =
    expired ? 'bg-slate-100 text-slate-600 border-slate-300'
    : urgent ? 'bg-rose-50 text-rose-700 border-rose-300 animate-pulse'
    : 'bg-amber-50 text-amber-800 border-amber-300';

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded-md border ${tone}`}>
        {expired ? '⏱️' : urgent ? '⚠️' : '⏳'}{text}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`} role="timer" aria-live="polite">
      {expired ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-xl">⏱️</span>
          <div>
            <div className="font-semibold">{t('booking.expired', 'Booking expired')}</div>
            <div className="text-xs opacity-80">{t('booking.expiredHint', 'This booking was auto-cancelled. Please search again.')}</div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-xl">{urgent ? '⚠️' : '⏳'}</span>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider opacity-75">
              {t('booking.payWithin', 'Pay within')}
            </div>
            <div className="font-mono font-bold text-2xl tabular-nums">{text}</div>
          </div>
          <div className="text-xs text-end opacity-80 max-w-[10rem]">
            {t('booking.orAutoCancel', 'or booking will be auto-cancelled')}
          </div>
        </div>
      )}
    </div>
  );
}
