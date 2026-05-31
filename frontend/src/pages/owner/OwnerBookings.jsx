import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDate, formatDateTime, formatSAR, statusBadgeClass } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

const STATUSES = ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'rejected'];

export function OwnerBookingsList() {
  const { t, i18n } = useTranslation();
  const [bookings, setBookings] = useState(null);
  const [filter, setFilter] = useState('pending');

  const load = () => get('/bookings/owner-bookings').then((r) => setBookings(r.bookings || []));
  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!bookings) return null;
    return filter === 'all' ? bookings : bookings.filter((b) => b.status === filter);
  }, [bookings, filter]);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('owner.bookingRequests')} subtitle={`${bookings?.length || 0} total`} />

      <div className="flex flex-wrap gap-2">
        {['all', ...STATUSES].map((s) => {
          const count = s === 'all' ? bookings?.length || 0 : (bookings || []).filter((b) => b.status === s).length;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
              {s === 'all' ? t('common.all') : t(`booking.${s.replace(/_/g, '')}`, s)}
              <span className="ms-1.5 opacity-75">{count}</span>
            </button>
          );
        })}
      </div>

      {filtered === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {filtered && filtered.length === 0 && <EmptyState icon="📭" title="No bookings in this state" />}

      {filtered && filtered.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {filtered.map((b) => (
            <Link key={b.id} to={`/owner/bookings/${b.id}`} className="block p-4 hover:bg-slate-50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-navy text-white flex items-center justify-center text-sm shrink-0">{(b.worker_name || '?').slice(0, 2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-navy">{b.worker_name}</div>
                    <span className={`badge ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{b.camp_name} · {b.room_name}</div>
                  <div className="text-xs text-slate-500">{formatDate(b.start_date)} → {formatDate(b.end_date)} · {b.occupants} pax</div>
                  <div className="text-[10px] text-slate-400 font-mono mt-1">{b.booking_code}</div>
                </div>
                <div className="text-end shrink-0">
                  <div className="font-bold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                  <div className="text-[10px] text-slate-400">net: {formatSAR(b.net_to_owner, i18n.language)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function OwnerBookingDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = () => get(`/bookings/${id}`).then(setData);
  useEffect(load, [id]);

  const approve = async () => {
    try { await put(`/bookings/${id}/status`, { status: 'confirmed' }); toast.success('Booking approved'); load(); }
    catch (e) { toast.error(e.message); }
  };
  const reject = async () => {
    try { await put(`/bookings/${id}/status`, { status: 'rejected', rejection_reason: rejectReason }); toast.success('Booking rejected'); setRejectOpen(false); load(); }
    catch (e) { toast.error(e.message); }
  };
  const checkin = async () => {
    try { await put(`/bookings/${id}/checkin`, {}); toast.success('Checked in ✅'); load(); } catch (e) { toast.error(e.message); }
  };
  const checkout = async () => {
    try { await put(`/bookings/${id}/checkout`, {}); toast.success('Checked out'); load(); } catch (e) { toast.error(e.message); }
  };

  if (!data?.booking) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;
  const b = data.booking;

  return (
    <div className="space-y-4">
      <Link to="/owner/bookings" className="text-xs link">← {t('common.back')}</Link>

      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className={`badge ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span>
            <h1 className="text-2xl font-bold text-navy mt-1">{b.worker_name}</h1>
            <div className="text-sm text-slate-500">{b.camp_name} · {b.room_name}</div>
            <div className="text-xs text-slate-400 font-mono mt-1">{b.booking_code}</div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-bold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
            <div className="text-xs text-emerald-700">net: {formatSAR(b.net_to_owner, i18n.language)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
          {b.status === 'pending' && (
            <>
              <button onClick={approve} className="btn-primary btn-sm">✓ {t('owner.approve')}</button>
              <button onClick={() => setRejectOpen(true)} className="btn-outline btn-sm text-rose-700 border-rose-300">✕ {t('owner.reject')}</button>
            </>
          )}
          {b.status === 'confirmed' && <button onClick={checkin} className="btn-primary btn-sm">📍 {t('owner.checkInGuest')}</button>}
          {b.status === 'checked_in' && <button onClick={checkout} className="btn-gold btn-sm">📤 {t('owner.checkOutGuest')}</button>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Stay</h3>
          <Row label={t('common.checkIn')} value={formatDate(b.start_date)} />
          <Row label={t('common.checkOut')} value={formatDate(b.end_date)} />
          <Row label={t('common.occupants')} value={b.occupants} />
          {b.checked_in_at && b.status !== 'pending' && <Row label="Checked in" value={formatDateTime(b.checked_in_at)} />}
          {b.checked_out_at && b.status === 'checked_out' && <Row label="Checked out" value={formatDateTime(b.checked_out_at)} />}
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Guest contact</h3>
          <Row label="Name" value={b.worker_name} />
          <Row label="Email" value={b.worker_email} />
          <Row label="Phone" value={b.worker_phone} />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-navy mb-3">Earnings breakdown</h3>
        <Row label="Gross (paid by worker)" value={formatSAR(b.total_amount, i18n.language)} />
        <Row label="VAT (collected for ZATCA)" value={formatSAR(b.vat_amount, i18n.language)} />
        <Row label="Platform commission (10%)" value={`− ${formatSAR(b.commission_amount, i18n.language)}`} />
        <div className="h-px bg-slate-200 my-2" />
        <Row label={<b className="text-navy">Net to you</b>} value={<b className="text-emerald-700">{formatSAR(b.net_to_owner, i18n.language)}</b>} />
      </div>

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject booking"
        footer={<>
          <button onClick={() => setRejectOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={reject} className="btn bg-rose-600 text-white hover:bg-rose-700 px-5 py-2.5">{t('owner.reject')}</button>
        </>}>
        <label className="label">Reason (sent to guest)</label>
        <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="input" placeholder="e.g. Room not available on those dates" />
      </Modal>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}
