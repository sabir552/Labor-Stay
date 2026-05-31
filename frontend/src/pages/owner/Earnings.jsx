import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import Modal from '../../components/common/Modal';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatSAR, formatDate } from '../../utils/formatters';

export default function Earnings() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [payments, setPayments] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [myPayouts, setMyPayouts] = useState([]);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ amount: 0, bank_name: '', iban: '', account_holder: '' });

  useEffect(() => {
    get('/payments/my-payments').then((r) => setPayments(r.payments || [])).catch(() => setPayments([]));
    get('/payouts/my-requests').then((r) => { setMyPayouts(r.requests || []); setEarnings(r.earnings); }).catch(() => {});
  }, []);

  const paid = (payments || []).filter((p) => p.status === 'paid');
  const gross = paid.reduce((s, p) => s + Number(p.amount || 0), 0);
  // Commission is on the booking, not the payment row — approximate as 10% of gross
  const commission = gross * 0.10;
  const net = gross - commission;

  // Group by month (last 12)
  const byMonth = {};
  paid.forEach((p) => {
    const m = (p.paid_at || p.created_at || '').slice(0, 7);
    if (!m) return;
    byMonth[m] = (byMonth[m] || 0) + Number(p.amount || 0);
  });
  const months = Object.keys(byMonth).sort().slice(-12);
  const maxMonth = Math.max(1, ...Object.values(byMonth));

  return (
    <div className="space-y-5">
      <SectionHeader title={t('owner.earnings')} subtitle="Your platform revenue overview" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Gross" value={formatSAR(gross, i18n.language)} icon="💵" accent="navy" />
        <StatCard label="VAT (already collected)" value={formatSAR(gross * 0.15 / 1.15, i18n.language)} icon="🧾" accent="blue" />
        <StatCard label="Commission (10%)" value={formatSAR(commission, i18n.language)} icon="📉" accent="rose" />
        <StatCard label="Net to you" value={formatSAR(net, i18n.language)} icon="💰" accent="emerald" />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-navy mb-3">Monthly gross</h3>
        {months.length === 0 && <div className="text-sm text-slate-500 text-center py-6">No paid payments yet.</div>}
        {months.length > 0 && (
          <div className="flex items-end gap-2 h-44 pt-2">
            {months.map((m) => {
              const h = (byMonth[m] / maxMonth) * 100;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] text-slate-500">{formatSAR(byMonth[m], i18n.language).replace('SAR ', '')}</div>
                  <div className="w-full bg-gold rounded-t-md transition-all hover:bg-gold-500" style={{ height: `${h}%`, minHeight: '4px' }} />
                  <div className="text-[10px] text-slate-400">{m.slice(5)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-navy">{t('owner.payout', 'Payout')}</h3>
          <button onClick={() => { setPayoutForm({ ...payoutForm, amount: Math.min(net, earnings?.available || net) }); setPayoutOpen(true); }} className="btn-gold btn-sm">
            {t('owner.requestPayout', 'Request payout')}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <div className="bg-slate-50 rounded p-2">
            <div className="text-[10px] text-slate-500">{t('owner.totalEarned', 'Total earned')}</div>
            <div className="font-bold text-navy text-sm">{formatSAR(earnings?.earned || 0, i18n.language)}</div>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <div className="text-[10px] text-slate-500">{t('owner.alreadyPaidOut', 'Paid out')}</div>
            <div className="font-bold text-emerald-700 text-sm">{formatSAR(earnings?.paid_out || 0, i18n.language)}</div>
          </div>
          <div className="bg-slate-50 rounded p-2">
            <div className="text-[10px] text-slate-500">{t('owner.pendingPayout', 'Pending')}</div>
            <div className="font-bold text-amber-700 text-sm">{formatSAR(earnings?.pending || 0, i18n.language)}</div>
          </div>
          <div className="bg-gold/15 rounded p-2">
            <div className="text-[10px] text-slate-500">{t('owner.availableNow', 'Available now')}</div>
            <div className="font-bold text-gold-600 text-sm">{formatSAR(earnings?.available || 0, i18n.language)}</div>
          </div>
        </div>
        {myPayouts.length > 0 && (
          <div className="mt-3 divide-y divide-slate-100">
            {myPayouts.slice(0, 5).map((r) => (
              <div key={r.id} className="py-2 flex justify-between items-center text-sm">
                <span>
                  {r.iban && <span className="font-mono text-xs">{r.iban}</span>}
                  {' '}
                  <span className={`badge ${
                    r.status === 'paid' ? 'bg-emerald-100 text-emerald-800'
                    : r.status === 'pending' ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-600'
                  }`}>{r.status}</span>
                </span>
                <b className="text-navy">{formatSAR(r.amount, i18n.language)}</b>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} size="md"
        title={t('owner.requestPayout', 'Request payout')}
        footer={<>
          <button onClick={() => setPayoutOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={async () => {
            try {
              await post('/payouts/request', payoutForm);
              toast.success(t('owner.payoutRequested', 'Payout requested — admin will process within 1-3 business days.'));
              setPayoutOpen(false);
              const fresh = await get('/payouts/my-requests');
              setMyPayouts(fresh.requests || []); setEarnings(fresh.earnings);
            } catch (e) { toast.error(e.message); }
          }} className="btn-primary">{t('common.confirm')}</button>
        </>}>
        <div className="space-y-3">
          <div className="bg-gold/10 rounded p-3 text-sm text-center">
            {t('owner.availableNow', 'Available now')}: <b className="text-navy">{formatSAR(earnings?.available || 0, i18n.language)}</b>
          </div>
          <div>
            <label className="label">{t('owner.amount', 'Amount (SAR)')} *</label>
            <input type="number" min="1" max={earnings?.available || 0}
              value={payoutForm.amount}
              onChange={(e) => setPayoutForm({ ...payoutForm, amount: parseFloat(e.target.value || 0) })}
              className="input" />
          </div>
          <div>
            <label className="label">{t('owner.bank', 'Bank name')}</label>
            <input value={payoutForm.bank_name}
              onChange={(e) => setPayoutForm({ ...payoutForm, bank_name: e.target.value })}
              className="input" placeholder="e.g. SNB, Al Rajhi" />
          </div>
          <div>
            <label className="label">{t('owner.iban', 'IBAN')}</label>
            <input value={payoutForm.iban}
              onChange={(e) => setPayoutForm({ ...payoutForm, iban: e.target.value })}
              className="input font-mono" placeholder="SA00 0000 ..." />
          </div>
          <div>
            <label className="label">{t('owner.accountHolder', 'Account holder name')}</label>
            <input value={payoutForm.account_holder}
              onChange={(e) => setPayoutForm({ ...payoutForm, account_holder: e.target.value })}
              className="input" />
          </div>
        </div>
      </Modal>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-navy">Recent payments</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {(payments || []).slice(0, 30).map((p) => (
            <div key={p.id} className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${p.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                {p.status === 'paid' ? '✓' : p.status === 'refunded' ? '↩' : '⏳'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-slate-700">{p.invoice_number}</div>
                <div className="text-xs text-slate-500">{p.camp_name} · {p.method} · {formatDate(p.paid_at || p.created_at)}</div>
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy">{formatSAR(p.amount, i18n.language)}</div>
                <div className={`text-[10px] uppercase ${p.status === 'paid' ? 'text-emerald-700' : 'text-slate-500'}`}>{p.status}</div>
              </div>
            </div>
          ))}
          {(payments || []).length === 0 && <div className="p-8 text-center text-slate-500 text-sm">No payments yet.</div>}
        </div>
      </div>
    </div>
  );
}
