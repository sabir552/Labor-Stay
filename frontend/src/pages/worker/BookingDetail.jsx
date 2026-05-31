import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { get, post, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatDateTime, formatSAR, statusBadgeClass } from '../../utils/formatters';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import StarRating from '../../components/common/StarRating';
import ExpiryTimer from '../../components/booking/ExpiryTimer';
import AgreementModal from '../../components/booking/AgreementModal';
import { useAuth } from '../../context/AuthContext';

export default function BookingDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrUrl, setQrUrl] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paying, setPaying] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [agreementOpen, setAgreementOpen] = useState(false);
  const { user } = useAuth();

  const load = () => {
    setLoading(true);
    get(`/bookings/${id}`).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const showQR = async () => {
    try {
      const r = await get(`/bookings/${id}/qr-code`);
      setQrUrl(r.qr);
      setQrOpen(true);
    } catch (e) { toast.error(e.message); }
  };

  // Download PDFs through the authenticated axios instance so JWT is sent.
  const download = async (path, filename) => {
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error('Download failed'); }
  };

  const cancel = async () => {
    try {
      await put(`/bookings/${id}/cancel`, {});
      toast.success('Booking cancelled.');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const pay = async () => {
    // A1 — block payment if agreement not signed; open signing modal instead.
    if (data?.booking && !data.booking.agreement_signed) {
      setAgreementOpen(true);
      return;
    }
    setPaying(true);
    try {
      const r = await post('/payments/initiate', { booking_id: parseInt(id, 10), method: 'mada' });
      toast.info('Simulating payment gateway…');
      // Dev: instantly call callback so booking flips to confirmed
      await post('/payments/callback', { gateway_ref: r.payment.gateway_ref, status: 'paid' });
      toast.success('Payment received ✅');
      load();
    } catch (e) {
      if (e?.details && Array.isArray(e.details)) toast.error(e.message);
      else if (e?.raw?.response?.data?.code === 'AGREEMENT_NOT_SIGNED') setAgreementOpen(true);
      else toast.error(e.message || 'Payment failed');
    }
    finally { setPaying(false); }
  };

  const submitReview = async () => {
    try {
      await post('/reviews', {
        camp_id: data.booking.camp_id, booking_id: parseInt(id, 10),
        rating: review.rating, comment: review.comment,
      });
      toast.success('Review submitted — thank you!');
      setReviewOpen(false);
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;
  if (!data?.booking) return <div className="card p-8 text-center text-slate-500">Booking not found.</div>;

  const b = data.booking;
  const isPaid = (data.payments || []).some((p) => p.status === 'paid');
  const canCancel = ['pending', 'confirmed'].includes(b.status);
  const canReview = ['confirmed', 'checked_in', 'checked_out'].includes(b.status);
  const canPay = !isPaid && ['pending', 'confirmed'].includes(b.status);

  return (
    <div className="space-y-4">
      <Link to="/worker/bookings" className="text-xs link">← {t('common.back')}</Link>

      {/* Header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`badge ${statusBadgeClass(b.status)}`}>{t(`booking.${b.status.replace(/_/g, '')}`, b.status)}</span>
              {isPaid && <span className="badge bg-emerald-100 text-emerald-800">PAID</span>}
            </div>
            <h1 className="text-2xl font-bold text-navy">{b.camp_name}</h1>
            <div className="text-sm text-slate-500 mt-1">{b.room_name} ({b.room_type}) · {b.city}</div>
            <div className="text-xs text-slate-400 font-mono mt-1">{b.booking_code}</div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-bold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
            <div className="text-xs text-slate-400">{t('common.total')}</div>
          </div>
        </div>

        {/* A2 — Expiry timer for unpaid pending bookings */}
        {b.status === 'pending' && !isPaid && (
          <div className="mt-4">
            <ExpiryTimer createdAt={b.created_at} onExpire={load} />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
          {/* A1 — Sign agreement button */}
          {canPay && !b.agreement_signed && (
            <button onClick={() => setAgreementOpen(true)} className="btn-primary btn-sm">
              ✍️ {t('booking.signAgreement', 'Sign agreement')}
            </button>
          )}
          {canPay && b.agreement_signed && (
            <a
              href={`/api/bookings/${id}/agreement`}
              target="_blank" rel="noreferrer"
              className="btn-outline btn-sm"
            >
              📄 {t('booking.downloadAgreement', 'Download agreement')}
            </a>
          )}
          {canPay && (
            <button onClick={pay} disabled={paying || !b.agreement_signed} className="btn-gold btn-sm">
              💳 {paying ? t('common.loading') : t('booking.payNow')}
            </button>
          )}
          {(b.status === 'confirmed' || b.status === 'checked_in') && (
            <button onClick={showQR} className="btn-primary btn-sm">📱 {t('booking.showQR')}</button>
          )}
          <button onClick={() => download(`/bookings/${id}/receipt`, `receipt-${b.booking_code}.pdf`)} className="btn-outline btn-sm">
            🧾 {t('booking.downloadReceipt')}
          </button>
          <button onClick={() => download(`/bookings/${id}/contract`, `contract-${b.booking_code}.pdf`)} className="btn-outline btn-sm">
            📄 {t('booking.downloadContract')}
          </button>
          {canReview && (
            <button onClick={() => setReviewOpen(true)} className="btn-ghost btn-sm">⭐ {t('camp.writeReview')}</button>
          )}
          {canCancel && (
            <button onClick={() => setConfirmCancel(true)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 ms-auto">
              ✕ {t('booking.cancelBooking')}
            </button>
          )}
        </div>
      </div>

      {/* Dates & details */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Stay details</h3>
          <Row label={t('common.checkIn')} value={formatDate(b.start_date)} />
          <Row label={t('common.checkOut')} value={formatDate(b.end_date)} />
          <Row label={t('common.occupants')} value={b.occupants} />
          <Row label="Type" value={b.booking_type} />
          {b.checked_in_at && b.status === 'checked_in' && <Row label="Checked in" value={formatDateTime(b.checked_in_at)} />}
          {b.checked_out_at && b.status === 'checked_out' && <Row label="Checked out" value={formatDateTime(b.checked_out_at)} />}
        </div>
        <div className="card p-5">
          <h3 className="font-semibold text-navy mb-3">Price breakdown</h3>
          <Row label="Base" value={formatSAR(b.base_amount, i18n.language)} />
          <Row label={t('common.vat')} value={formatSAR(b.vat_amount, i18n.language)} />
          <div className="h-px bg-slate-200 my-2" />
          <Row label={<b className="text-navy">{t('common.total')}</b>} value={<b className="text-navy">{formatSAR(b.total_amount, i18n.language)}</b>} />
        </div>
      </div>

      {/* Payments */}
      <div className="card p-5">
        <h3 className="font-semibold text-navy mb-3">Payments</h3>
        {(data.payments || []).length === 0 && (
          <div className="text-sm text-slate-500">No payment yet. {canPay && 'Click Pay now to start.'}</div>
        )}
        {(data.payments || []).map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
            <div>
              <div className="font-mono text-xs text-slate-500">{p.invoice_number}</div>
              <div className="text-xs text-slate-400">{p.method} · {formatDateTime(p.paid_at || p.created_at)}</div>
            </div>
            <div className="text-end">
              <div className="font-semibold text-navy">{formatSAR(p.amount, i18n.language)}</div>
              <span className={`badge ${statusBadgeClass(p.status)}`}>{p.status}</span>
            </div>
          </div>
        ))}
      </div>

      {b.rejection_reason && (
        <div className="card p-4 border-s-4 border-rose-500 bg-rose-50">
          <div className="text-sm font-semibold text-rose-800 mb-1">Reason</div>
          <div className="text-sm text-rose-700">{b.rejection_reason}</div>
        </div>
      )}

      {/* QR modal */}
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title={`QR · ${b.booking_code}`}>
        <div className="text-center">
          {qrUrl && <img src={qrUrl} alt="QR" className="mx-auto w-64 h-64 border border-slate-200 rounded-lg" />}
          <p className="text-sm text-slate-500 mt-3">Show this at the camp gate to check in.</p>
        </div>
      </Modal>

      {/* Confirm cancel */}
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancel}
        title={t('booking.cancelBooking')}
        message="Are you sure you want to cancel this booking? This action cannot be undone."
        confirmLabel={t('booking.cancelBooking')}
        danger
      />

      {/* A1 — Agreement modal */}
      <AgreementModal
        open={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        booking={data?.booking}
        workerName={user?.full_name}
        onSigned={() => load()}
      />

      {/* Review modal */}
      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title={t('camp.writeReview')}
        footer={<>
          <button onClick={() => setReviewOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submitReview} className="btn-primary">{t('common.save')}</button>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="label">{t('common.rating')}</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setReview({ ...review, rating: s })}
                  className={`text-3xl ${s <= review.rating ? 'text-gold' : 'text-slate-300'} hover:scale-110 transition`}>★</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Comment</label>
            <textarea rows={4} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} className="input" placeholder="Share your experience…" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 capitalize">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );
}
