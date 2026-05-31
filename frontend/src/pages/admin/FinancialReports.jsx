import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import { formatSAR, formatDateTime } from '../../utils/formatters';

export default function FinancialReports() {
  const { t, i18n } = useTranslation();
  const [pnl, setPnl] = useState(null);
  const [commission, setCommission] = useState(null);
  const [vat, setVat] = useState(null);
  const [outstanding, setOutstanding] = useState(null);
  const [refunds, setRefunds] = useState(null);
  const [tab, setTab] = useState('pnl');

  useEffect(() => {
    get('/admin/finance/profit-loss').then(setPnl).catch(() => setPnl({ months: [], totals: {} }));
    get('/admin/finance/commission-report').then(setCommission).catch(() => setCommission({}));
    get('/admin/finance/vat-report').then(setVat).catch(() => setVat({}));
    get('/admin/finance/outstanding').then(setOutstanding).catch(() => setOutstanding({}));
    get('/admin/finance/refunds').then(setRefunds).catch(() => setRefunds({}));
  }, []);

  const t_ = pnl?.totals || {};

  return (
    <div className="space-y-4">
      <SectionHeader title={t('finance.title', 'Financial reports')}
        subtitle={t('finance.subtitle', 'Platform-wide P&L, VAT, commission, refunds, outstanding')} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('finance.grossRevenue', 'Gross revenue')} value={formatSAR(t_.gross_revenue || 0, i18n.language)} icon="💵" accent="navy" />
        <StatCard label={t('finance.platformCommission', 'Commission')} value={formatSAR(t_.platform_commission || 0, i18n.language)} icon="💰" accent="gold" />
        <StatCard label={t('finance.vatCollected', 'VAT collected')} value={formatSAR(t_.vat_collected || 0, i18n.language)} icon="🧾" accent="blue" />
        <StatCard label={t('finance.ownerPayouts', 'Owner payouts due')} value={formatSAR(t_.owner_payouts_due || 0, i18n.language)} icon="📤" accent="emerald" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          ['pnl', '📊 ' + t('finance.tabPL', 'P&L')],
          ['commission', '💰 ' + t('finance.tabCommission', 'Commission')],
          ['vat', '🧾 ' + t('finance.tabVAT', 'VAT (ZATCA)')],
          ['outstanding', '⚠️ ' + t('finance.tabOutstanding', 'Outstanding')],
          ['refunds', '↩️ ' + t('finance.tabRefunds', 'Refunds')],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm whitespace-nowrap border-b-2 ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500'
            }`}>{l}</button>
        ))}
      </div>

      {/* P&L */}
      {tab === 'pnl' && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-start px-4 py-2">Month</th>
                <th className="text-end px-4 py-2">Payments</th>
                <th className="text-end px-4 py-2">Gross revenue</th>
                <th className="text-end px-4 py-2">VAT collected</th>
                <th className="text-end px-4 py-2">Commission</th>
                <th className="text-end px-4 py-2">Owner payouts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(pnl?.months || []).length === 0 && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-500">{t('common.noData')}</td></tr>
              )}
              {(pnl?.months || []).map((m) => (
                <tr key={m.month} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-navy">{m.month}</td>
                  <td className="px-4 py-2 text-end">{m.payments}</td>
                  <td className="px-4 py-2 text-end font-semibold">{formatSAR(m.gross_revenue, i18n.language)}</td>
                  <td className="px-4 py-2 text-end text-blue-700">{formatSAR(m.vat_collected, i18n.language)}</td>
                  <td className="px-4 py-2 text-end text-gold-600">{formatSAR(m.platform_commission, i18n.language)}</td>
                  <td className="px-4 py-2 text-end text-emerald-700">{formatSAR(m.owner_payouts_due, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Commission */}
      {tab === 'commission' && commission && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-3">By owner</h3>
            <div className="text-3xl font-bold text-navy mb-3">{formatSAR(commission.total_commission || 0, i18n.language)}</div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {(commission.by_owner || []).map((o, i) => (
                <div key={i} className="flex justify-between text-sm py-1.5 border-b border-slate-100">
                  <span className="text-navy">{o.company_name || o.owner_name}</span>
                  <span><span className="text-slate-500 text-xs">{o.bookings}</span> <b className="text-gold-600">{formatSAR(o.commission, i18n.language)}</b></span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-3">By city</h3>
            <div className="space-y-2">
              {(commission.by_city || []).map((c) => {
                const max = Math.max(1, ...(commission.by_city || []).map((x) => parseFloat(x.commission || 0)));
                const pct = Math.round((parseFloat(c.commission || 0) / max) * 100);
                return (
                  <div key={c.city}>
                    <div className="flex justify-between text-sm">
                      <span>{c.city}</span>
                      <b className="text-navy">{formatSAR(c.commission, i18n.language)}</b>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VAT */}
      {tab === 'vat' && vat && (
        <div className="space-y-3">
          <div className="card p-5">
            <h3 className="font-semibold text-navy mb-2">📋 ZATCA-compliant VAT report</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div><div className="text-xs text-slate-500">Seller VAT</div><div className="font-mono text-navy">{vat.header?.seller_vat}</div></div>
              <div><div className="text-xs text-slate-500">Period</div><div className="text-navy">{vat.header?.report_period?.start} → {vat.header?.report_period?.end}</div></div>
              <div><div className="text-xs text-slate-500">Currency</div><div className="text-navy">{vat.header?.currency}</div></div>
              <div><div className="text-xs text-slate-500">Rate</div><div className="text-navy">{vat.totals?.vat_rate}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div className="bg-slate-50 rounded p-3"><div className="text-xs text-slate-500">Taxable base</div><div className="font-bold text-navy">{formatSAR(vat.totals?.taxable_base || 0, i18n.language)}</div></div>
              <div className="bg-blue-50 rounded p-3"><div className="text-xs text-slate-500">VAT amount</div><div className="font-bold text-blue-700">{formatSAR(vat.totals?.vat_amount || 0, i18n.language)}</div></div>
              <div className="bg-emerald-50 rounded p-3"><div className="text-xs text-slate-500">Total incl. VAT</div><div className="font-bold text-emerald-700">{formatSAR(vat.totals?.total_inc_vat || 0, i18n.language)}</div></div>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-start px-4 py-2">Invoice</th>
                  <th className="text-start px-4 py-2">Payer</th>
                  <th className="text-end px-4 py-2">Base</th>
                  <th className="text-end px-4 py-2">VAT</th>
                  <th className="text-end px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(vat.line_items || []).slice(0, 100).map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">{l.invoice_number}</td>
                    <td className="px-4 py-2 text-slate-700">{l.payer_name}</td>
                    <td className="px-4 py-2 text-end">{formatSAR(l.taxable_base, i18n.language)}</td>
                    <td className="px-4 py-2 text-end text-blue-700">{formatSAR(l.vat_amount, i18n.language)}</td>
                    <td className="px-4 py-2 text-end font-semibold">{formatSAR(l.total_inc_vat, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OUTSTANDING */}
      {tab === 'outstanding' && outstanding && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Corp outstanding" value={formatSAR(outstanding.totals?.corporate_outstanding || 0, i18n.language)} icon="🏢" accent="gold" />
            <StatCard label="Bookings unpaid" value={formatSAR(outstanding.totals?.bookings_outstanding || 0, i18n.language)} icon="🛏️" accent="rose" />
            <StatCard label="Grand total" value={formatSAR(outstanding.totals?.grand_total || 0, i18n.language)} icon="💸" accent="navy" />
          </div>
          {(outstanding.corporate_invoices || []).length > 0 && (
            <div className="card p-4">
              <h4 className="font-semibold text-navy mb-2">Corporate invoices</h4>
              <div className="space-y-1">
                {outstanding.corporate_invoices.map((inv) => (
                  <div key={inv.id} className="flex justify-between text-sm py-1 border-b border-slate-100">
                    <span><b>{inv.invoice_number}</b> · {inv.company_name}{inv.is_overdue && <span className="badge bg-rose-100 text-rose-700 ms-2">overdue</span>}</span>
                    <b className="text-navy">{formatSAR(inv.total_amount, i18n.language)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(outstanding.unpaid_bookings || []).length > 0 && (
            <div className="card p-4">
              <h4 className="font-semibold text-navy mb-2">Unpaid bookings</h4>
              <div className="space-y-1">
                {outstanding.unpaid_bookings.slice(0, 20).map((b) => (
                  <div key={b.id} className="flex justify-between text-sm py-1 border-b border-slate-100">
                    <span><b>{b.booking_code}</b> · {b.worker_name} → {b.camp_name}</span>
                    <span className="badge bg-amber-100 text-amber-800">{b.status}</span>
                    <b className="text-navy">{formatSAR(b.total_amount, i18n.language)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* REFUNDS */}
      {tab === 'refunds' && refunds && (
        <div className="space-y-3">
          <div className="card p-4 text-center">
            <div className="text-xs text-slate-500">Total refunded</div>
            <div className="text-2xl font-bold text-rose-600">{formatSAR(refunds.total || 0, i18n.language)}</div>
            <div className="text-xs text-slate-500">across {refunds.count || 0} refunds</div>
          </div>
          <div className="card divide-y divide-slate-100">
            {(refunds.refunds || []).length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
            )}
            {(refunds.refunds || []).map((r) => (
              <div key={r.id} className="p-3 flex justify-between items-center text-sm">
                <div>
                  <div className="font-mono text-xs">{r.invoice_number}</div>
                  <div className="text-xs text-slate-500">{r.user_name} · {r.camp_name || '—'} · {formatDateTime(r.created_at)}</div>
                </div>
                <b className="text-rose-600">−{formatSAR(r.amount, i18n.language)}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
