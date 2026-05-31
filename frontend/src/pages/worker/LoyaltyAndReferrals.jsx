import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatDate, formatSAR } from '../../utils/formatters';

const TIER_COLOR = { bronze: 'bg-amber-700', silver: 'bg-slate-400', gold: 'bg-gold' };
const TIER_ICON  = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export default function LoyaltyAndReferrals() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState('loyalty');
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [ref, setRef] = useState(null);

  const reload = async () => {
    const [b, h, t_, r] = await Promise.all([
      get('/loyalty/balance'),
      get('/loyalty/history'),
      get('/loyalty/tiers'),
      get('/referrals/stats'),
    ]);
    setBalance(b); setHistory(h.transactions || []);
    setTiers(t_.tiers || []); setRef(r);
  };
  useEffect(() => { reload(); }, []);

  const copyCode = () => {
    if (!ref?.code) return;
    try {
      navigator.clipboard.writeText(ref.code);
      toast.success(t('refer.copied', 'Code copied!'));
    } catch { toast.info(ref.code); }
  };
  const copyLink = () => {
    if (!ref?.link) return;
    try {
      navigator.clipboard.writeText(ref.link);
      toast.success(t('refer.linkCopied', 'Link copied!'));
    } catch { toast.info(ref.link); }
  };

  const redeem = async (points) => {
    try {
      const r = await post('/loyalty/redeem', { points });
      toast.success(`${t('loyalty.redeemed', 'Redeemed')} ${points}pts → ${formatSAR(r.discount_sar, i18n.language)} discount`);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  if (!balance) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={t('loyalty.title', 'Loyalty & Referrals')}
        subtitle={t('loyalty.subtitle', 'Earn points on every booking and refer friends for SAR 50 credit')} />

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['loyalty',   '🏆 ' + t('loyalty.tabLoyalty', 'Loyalty points')],
          ['referrals', '🎁 ' + t('loyalty.tabReferrals', 'Referrals')],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'loyalty' && (
        <div className="space-y-4">
          {/* Hero card */}
          <div className={`rounded-2xl p-6 text-white ${TIER_COLOR[balance.tier]}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider opacity-80">{t('loyalty.currentTier', 'Current tier')}</div>
                <div className="text-3xl font-bold mt-1">{TIER_ICON[balance.tier]} {balance.tier_label}</div>
                <div className="text-sm opacity-90 mt-1">{balance.discount_pct}% {t('loyalty.discountOn', 'discount on all bookings')}</div>
              </div>
              <div className="text-end">
                <div className="text-4xl font-extrabold">{balance.points}</div>
                <div className="text-sm opacity-90">{t('loyalty.pts', 'points')}</div>
                <div className="text-xs opacity-75 mt-1">≈ {formatSAR(balance.sar_value, i18n.language)} {t('loyalty.value', 'value')}</div>
              </div>
            </div>
            {balance.next_tier && (
              <div className="mt-4 pt-3 border-t border-white/20 text-sm">
                {balance.next_tier.points_needed} {t('loyalty.pointsToNext', 'more points to')} {balance.next_tier.key}
              </div>
            )}
          </div>

          {/* Redeem actions */}
          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-2">{t('loyalty.redeem', 'Redeem points')}</h3>
            <p className="text-xs text-slate-500 mb-3">{t('loyalty.redeemHint', '100 pts = SAR 10 discount on your next booking')}</p>
            <div className="flex gap-2 flex-wrap">
              {[100, 250, 500, 1000].map((p) => (
                <button key={p} disabled={balance.points < p}
                  onClick={() => redeem(p)}
                  className="btn-outline btn-sm disabled:opacity-30 disabled:cursor-not-allowed">
                  {p}pts → {formatSAR(p * 0.1, i18n.language)}
                </button>
              ))}
            </div>
          </div>

          {/* Tier ladder */}
          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-2">{t('loyalty.tierLadder', 'Tier ladder')}</h3>
            <div className="grid grid-cols-3 gap-2">
              {tiers.map((t_) => (
                <div key={t_.key} className={`rounded-lg p-3 text-center ${t_.key === balance.tier ? 'ring-2 ring-navy bg-navy-50' : 'bg-slate-50'}`}>
                  <div className="text-2xl">{TIER_ICON[t_.key]}</div>
                  <div className="font-semibold text-navy mt-1">{t_.label}</div>
                  <div className="text-xs text-slate-500">{t_.min}{t_.max != null ? `–${t_.max}` : '+'} pts</div>
                  <div className="text-xs text-gold-600 font-semibold mt-1">{t_.discount_pct}% off</div>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-navy">{t('loyalty.history', 'Transaction history')}</h3>
            </div>
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {history.length === 0 && <div className="p-4 text-center text-sm text-slate-500">{t('common.noData')}</div>}
              {history.map((h) => (
                <div key={h.id} className="p-3 flex items-center gap-3">
                  <div className="text-xl">
                    {h.transaction_type === 'earned' ? '✨'
                     : h.transaction_type === 'bonus' ? '🎁'
                     : h.transaction_type === 'redeemed' ? '💸'
                     : '⏰'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700">{h.description}</div>
                    <div className="text-[10px] text-slate-400">{formatDate(h.created_at)}</div>
                  </div>
                  <div className={`font-bold text-sm ${h.points > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {h.points > 0 ? '+' : ''}{h.points}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'referrals' && ref && (
        <div className="space-y-4">
          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-gold to-gold-500 text-white p-6">
            <div className="text-xs uppercase tracking-wider opacity-90">{t('refer.yourCode', 'Your code')}</div>
            <div className="font-mono font-extrabold text-4xl tracking-wider mt-1">{ref.code}</div>
            <div className="text-sm opacity-90 mt-2">{t('refer.earn', 'Earn SAR')} {ref.reward_amount} {t('refer.perFriend', 'per friend')}</div>
            <div className="flex gap-2 mt-4">
              <button onClick={copyCode} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded text-sm">📋 {t('refer.copyCode', 'Copy code')}</button>
              <button onClick={copyLink} className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded text-sm">🔗 {t('refer.copyLink', 'Copy link')}</button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t('refer.referred', 'Referred')} value={ref.referrals.length} icon="👥" />
            <StatCard label={t('refer.pending', 'Pending')} value={ref.summary.pending} icon="⏳" accent="gold" />
            <StatCard label={t('refer.rewarded', 'Rewarded')} value={ref.summary.rewarded} icon="🎁" accent="emerald" />
            <StatCard label={t('refer.earned', 'Earned')} value={formatSAR(ref.summary.earned, i18n.language)} icon="💰" accent="navy" />
          </div>

          <div className="card divide-y divide-slate-100">
            {ref.referrals.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">{t('refer.empty', 'No referrals yet. Share your code!')}</div>
            )}
            {ref.referrals.map((r) => (
              <div key={r.id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-navy text-white text-xs font-bold flex items-center justify-center">
                  {(r.referred_name || '?').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-navy">{r.referred_name || '—'}</div>
                  <div className="text-xs text-slate-500">{r.referred_email}</div>
                </div>
                <span className={`badge ${
                  r.status === 'rewarded' ? 'bg-emerald-100 text-emerald-800'
                  : r.status === 'pending' ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
                }`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
