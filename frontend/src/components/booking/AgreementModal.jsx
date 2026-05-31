import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import { put } from '../../api/client';
import { formatSAR } from '../../utils/formatters';
import { useToast } from '../../context/ToastContext';

/**
 * A1 — Rental agreement signing modal.
 *
 * Props:
 *   open, onClose
 *   booking   — { id, booking_code, camp_name, room_name, start_date, end_date,
 *                 base_amount, vat_amount, total_amount, agreement_signed,
 *                 agreement_url, occupants }
 *   workerName — user's full name (must roughly match the typed signature)
 *   onSigned  — callback({ agreement_url, signed_at }) after success
 */
export default function AgreementModal({ open, onClose, booking, workerName, onSigned }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [typedName, setTypedName] = useState('');
  const [accept, setAccept] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) { setTypedName(''); setAccept(false); setScrolledToEnd(false); setSubmitting(false); }
  }, [open, booking?.id]);

  if (!booking) return null;
  const alreadySigned = !!booking.agreement_signed;

  const canSubmit = !alreadySigned && accept && typedName.trim().length >= 3 && scrolledToEnd;

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setScrolledToEnd(true);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await put(`/bookings/${booking.id}/sign-agreement`, {
        typed_name: typedName.trim(), accept: true,
      });
      toast.success(t('booking.agreementSignedToast', 'Agreement signed ✍️'));
      onSigned?.({ agreement_url: r.agreement_url, signed_at: r.signed_at });
      onClose?.();
    } catch (e) {
      toast.error(e.message || 'Could not sign agreement');
    } finally { setSubmitting(false); }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('booking.agreementTitle', 'Rental agreement')}
      size="lg"
      footer={alreadySigned ? (
        <>
          <button onClick={onClose} className="btn-ghost">{t('common.close', 'Close')}</button>
          {booking.agreement_url && (
            <a
              href={`/api/bookings/${booking.id}/agreement`}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
            >
              📄 {t('booking.downloadAgreement', 'Download signed PDF')}
            </a>
          )}
        </>
      ) : (
        <>
          <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submit} disabled={!canSubmit || submitting} className="btn-gold">
            {submitting ? t('common.loading') : `✍️ ${t('booking.signNow', 'Sign agreement')}`}
          </button>
        </>
      )}
    >
      {alreadySigned ? (
        <div className="text-center py-8">
          <div className="text-5xl mb-3">✅</div>
          <h3 className="text-lg font-semibold text-navy">{t('booking.alreadySigned', 'Agreement already signed')}</h3>
          <p className="text-sm text-slate-500 mt-1">{t('booking.signedHint', 'You can download a copy any time.')}</p>
        </div>
      ) : (
        <div>
          {/* Scrollable agreement body */}
          <div
            onScroll={onScroll}
            className="border border-slate-200 rounded-lg p-4 h-64 overflow-y-auto text-sm text-slate-700 leading-relaxed bg-slate-50"
          >
            <h4 className="font-semibold text-navy mb-1">{t('booking.agreementHeading', 'Accommodation Rental Agreement')}</h4>
            <p className="text-xs text-slate-500 mb-3">Booking <b>{booking.booking_code}</b></p>

            <p className="mb-3">
              <b>{t('booking.premises', 'Premises')}:</b> {booking.camp_name} — {booking.room_name}
            </p>
            <p className="mb-3">
              <b>{t('booking.term', 'Term')}:</b> {booking.start_date} → {booking.end_date} ({booking.occupants || 1} {t('common.occupants').toLowerCase()})
            </p>
            <p className="mb-3">
              <b>{t('booking.totalPayable', 'Total payable')}:</b> {formatSAR(booking.total_amount, i18n.language)}
              <span className="text-xs text-slate-500"> ({formatSAR(booking.base_amount, i18n.language)} + 15% VAT)</span>
            </p>

            <h5 className="font-semibold mt-3 mb-1">{t('booking.occObligations', 'Occupant obligations')}</h5>
            <ul className="list-disc ms-5 space-y-1 text-xs">
              <li>Pay the total amount above on or before the check-in date.</li>
              <li>Respect camp rules, prayer times, and Saudi labour regulations.</li>
              <li>Use the room and facilities responsibly and report damage immediately.</li>
              <li>No subletting or overnight visitors without prior owner approval.</li>
              <li>Vacate the room by the check-out date or arrange a written extension.</li>
            </ul>

            <h5 className="font-semibold mt-3 mb-1">{t('booking.cancellationPolicy', 'Cancellation policy')}</h5>
            <ul className="list-disc ms-5 space-y-1 text-xs">
              <li>Cancellations ≥ 48 hours before check-in are fully refundable.</li>
              <li>Cancellations &lt; 48 hours forfeit one night.</li>
              <li>Bookings unpaid within 24 hours of creation are auto-cancelled.</li>
            </ul>

            <p className="text-xs text-slate-500 mt-4">
              By typing your full legal name below and clicking "Sign agreement", you
              electronically accept this agreement in accordance with Saudi e-Transactions Law.
              VAT 15% is collected on behalf of ZATCA. A 10% platform commission applies to the provider.
            </p>
          </div>
          {!scrolledToEnd && (
            <p className="text-[10px] text-slate-400 mt-1 text-center">
              ↓ {t('booking.scrollToEnd', 'Please scroll to the end before signing')}
            </p>
          )}

          {/* Signature inputs */}
          <div className="mt-4 space-y-3">
            <div>
              <label className="label">{t('booking.typedSignature', 'Type your full name as your signature')}</label>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={workerName || ''}
                className="input font-serif text-lg italic"
                autoComplete="off"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                {t('booking.mustMatchName', 'Must match your account name')}: <b>{workerName}</b>
              </p>
            </div>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
                className="mt-1 rounded text-navy"
              />
              <span>{t('booking.iAccept', 'I have read and accept this rental agreement.')}</span>
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
