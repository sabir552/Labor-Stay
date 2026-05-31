import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatSAR, formatDate } from '../../utils/formatters';

const PAYMENT_TERMS = ['net15', 'net30', 'net60'];

export default function CorporateAccounts() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [tab, setTab] = useState('accounts');
  const [invoices, setInvoices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [camps, setCamps] = useState([]);
  const [form, setForm] = useState(null);
  const [bulkForm, setBulkForm] = useState(null);
  const [invForm, setInvForm] = useState(null);
  const [spendDetail, setSpendDetail] = useState(null);

  const reload = async () => {
    const [a, i, b, c] = await Promise.all([
      get('/corporate/accounts'),
      get('/corporate/invoices'),
      get('/corporate/bookings'),
      get('/admin/camps?status=approved').catch(() => ({ camps: [] })),
    ]);
    setAccounts(a.accounts || []);
    setInvoices(i.invoices || []);
    setBookings(b.bookings || []);
    setCamps(c.camps || []);
  };
  useEffect(() => { reload(); }, []);

  const openAccount = (a) => setForm(a ? { ...a } : {
    company_name: '', cr_number: '', vat_number: '',
    contact_name: '', contact_email: '', contact_phone: '',
    finance_email: '',
    credit_limit: 50000, payment_terms: 'net30', is_active: true,
  });

  const saveAccount = async () => {
    try {
      if (form.id) await put(`/corporate/accounts/${form.id}`, form);
      else         await post('/corporate/accounts', form);
      toast.success(t('corp.saved', 'Account saved'));
      setForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const openBulk = (acc) => setBulkForm({
    corporate_id: acc.id, company_name: acc.company_name, balance: acc.current_balance,
    camp_id: camps[0]?.id || 1, num_beds: 10,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  });

  const submitBulk = async () => {
    try {
      const r = await post('/corporate/bulk-booking', bulkForm);
      toast.success(`${t('corp.bulkOk', 'Bulk booking confirmed')} — ${formatSAR(r.booking.total_amount, i18n.language)}`);
      setBulkForm(null);
      reload();
    } catch (e) {
      if (e?.raw?.response?.data?.required) {
        toast.error(`${e.message} (need ${formatSAR(e.raw.response.data.required, i18n.language)})`);
      } else toast.error(e.message);
    }
  };

  const openInvoice = (acc) => {
    const now = new Date();
    setInvForm({
      corporate_id: acc.id, company_name: acc.company_name,
      month: now.getMonth() + 1, year: now.getFullYear(),
    });
  };

  const generateInvoice = async () => {
    try {
      const r = await post('/corporate/invoice/generate', invForm);
      toast.success(`${t('corp.invoiceGenerated', 'Invoice generated')} ${r.invoice.invoice_number}`);
      setInvForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const markInvoicePaid = async (id) => {
    try { await put(`/corporate/invoices/${id}/pay`, {}); toast.success('Marked paid'); reload(); }
    catch (e) { toast.error(e.message); }
  };

  const viewSpend = async (acc) => {
    const r = await get(`/corporate/spend-report/${acc.id}`);
    setSpendDetail({ acc, ...r });
  };

  const totals = {
    accounts: accounts.length,
    creditAllocated: accounts.reduce((s, a) => s + parseFloat(a.credit_limit || 0), 0),
    creditUsed: accounts.reduce((s, a) => s + (parseFloat(a.credit_limit || 0) - parseFloat(a.current_balance || 0)), 0),
    outstanding: invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.total_amount || 0), 0),
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('corp.title', 'Corporate accounts')}
        subtitle={t('corp.subtitle', 'Manage credit limits, bulk bookings, and monthly invoices')}
        action={<button onClick={() => openAccount(null)} className="btn-primary btn-sm">+ {t('corp.newAccount', 'New account')}</button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('corp.totalAccounts', 'Accounts')} value={totals.accounts} icon="🏢" />
        <StatCard label={t('corp.creditAllocated', 'Credit allocated')} value={formatSAR(totals.creditAllocated, i18n.language)} icon="💳" accent="navy" />
        <StatCard label={t('corp.creditUsed', 'Credit used')} value={formatSAR(totals.creditUsed, i18n.language)} icon="📉" accent="gold" />
        <StatCard label={t('corp.outstanding', 'Outstanding invoices')} value={formatSAR(totals.outstanding, i18n.language)} icon="⚠️" accent="rose" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['accounts',  '🏢 ' + t('corp.tabAccounts', 'Accounts')],
          ['bookings',  '🛏️ ' + t('corp.tabBookings', 'Bulk bookings')],
          ['invoices',  '📄 ' + t('corp.tabInvoices', 'Invoices')],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'accounts' && (
        <div className="space-y-3">
          {accounts.length === 0 && <div className="card p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
          {accounts.map((a) => {
            const utilization = a.credit_limit > 0
              ? Math.round(((a.credit_limit - a.current_balance) / a.credit_limit) * 100) : 0;
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-navy">{a.company_name}</h4>
                      {!a.is_active && <span className="badge bg-rose-100 text-rose-700">inactive</span>}
                      <span className="badge bg-navy-50 text-navy uppercase">{a.payment_terms}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      CR: {a.cr_number || '—'} · VAT: {a.vat_number || '—'}
                      {a.contact_email && ` · ${a.contact_email}`}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-xs text-slate-500">{t('corp.balance', 'Balance')}</div>
                    <div className="font-bold text-navy">{formatSAR(a.current_balance, i18n.language)}</div>
                    <div className="text-[10px] text-slate-500">of {formatSAR(a.credit_limit, i18n.language)}</div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${utilization > 80 ? 'bg-rose-500' : utilization > 50 ? 'bg-gold' : 'bg-emerald-500'}`}
                      style={{ width: `${utilization}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">{utilization}% utilized</div>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  <button onClick={() => openBulk(a)} className="btn-gold btn-sm" disabled={!a.is_active}>+ Bulk booking</button>
                  <button onClick={() => openInvoice(a)} className="btn-outline btn-sm">📄 Generate invoice</button>
                  <button onClick={() => viewSpend(a)} className="btn-outline btn-sm">📊 Spend report</button>
                  <button onClick={() => openAccount(a)} className="btn-ghost btn-sm">✎ Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'bookings' && (
        <div className="card divide-y divide-slate-100">
          {bookings.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
          {bookings.map((b) => (
            <div key={b.id} className="p-4 flex items-start gap-3">
              <div className="text-2xl">🛏️</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-navy">{b.company_name} → {b.camp_name}</div>
                <div className="text-xs text-slate-500">
                  {b.num_beds} beds · {formatDate(b.start_date)} → {formatDate(b.end_date)}
                </div>
                <span className={`badge mt-1 ${b.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{b.status}</span>
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy">{formatSAR(b.total_amount, i18n.language)}</div>
                {b.invoice_id && <div className="text-[10px] text-slate-400">invoiced</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card divide-y divide-slate-100">
          {invoices.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
          {invoices.map((inv) => (
            <div key={inv.id} className="p-4 flex items-start gap-3">
              <div className="text-2xl">📄</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm text-navy">{inv.invoice_number}</span>
                  <span className="text-slate-500 text-xs">{inv.company_name}</span>
                  {inv.is_overdue && <span className="badge bg-rose-100 text-rose-700">overdue</span>}
                  <span className={`badge ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{inv.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {inv.month}/{inv.year} · due {formatDate(inv.due_date)}
                </div>
              </div>
              <div className="text-end">
                <div className="font-semibold text-navy">{formatSAR(inv.total_amount, i18n.language)}</div>
                <div className="text-[10px] text-slate-500">incl. VAT {formatSAR(inv.vat_amount, i18n.language)}</div>
                {inv.status !== 'paid' && (
                  <button onClick={() => markInvoicePaid(inv.id)} className="btn-gold btn-sm mt-1">Mark paid</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACCOUNT MODAL */}
      <Modal open={!!form} onClose={() => setForm(null)} size="lg"
        title={form?.id ? `Edit: ${form.company_name}` : t('corp.newAccount', 'New corporate account')}
        footer={<>
          <button onClick={() => setForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveAccount} className="btn-primary">{t('common.save')}</button>
        </>}>
        {form && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Company name *</label>
                <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="input" /></div>
              <div><label className="label">CR number</label>
                <input value={form.cr_number || ''} onChange={(e) => setForm({ ...form, cr_number: e.target.value })} className="input" /></div>
              <div><label className="label">VAT number</label>
                <input value={form.vat_number || ''} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} className="input" /></div>
              <div><label className="label">Contact name</label>
                <input value={form.contact_name || ''} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="input" /></div>
              <div><label className="label">Contact phone</label>
                <input value={form.contact_phone || ''} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="input" /></div>
              <div><label className="label">Contact email</label>
                <input type="email" value={form.contact_email || ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="input" /></div>
              <div><label className="label">Finance email</label>
                <input type="email" value={form.finance_email || ''} onChange={(e) => setForm({ ...form, finance_email: e.target.value })} className="input" placeholder="invoices sent here" /></div>
              <div><label className="label">Credit limit (SAR)</label>
                <input type="number" min="0" step="1000" value={form.credit_limit || 0} onChange={(e) => setForm({ ...form, credit_limit: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">Payment terms</label>
                <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="input">
                  {PAYMENT_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select></div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded text-navy" />
              Active
            </label>
          </div>
        )}
      </Modal>

      {/* BULK BOOKING MODAL */}
      <Modal open={!!bulkForm} onClose={() => setBulkForm(null)} size="md"
        title={bulkForm ? `Bulk booking — ${bulkForm.company_name}` : ''}
        footer={<>
          <button onClick={() => setBulkForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submitBulk} className="btn-gold">Confirm booking</button>
        </>}>
        {bulkForm && (
          <div className="space-y-3">
            <div className="bg-slate-50 rounded p-2 text-sm">
              Available credit: <b className="text-navy">{formatSAR(bulkForm.balance, i18n.language)}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Camp</label>
                <select value={bulkForm.camp_id} onChange={(e) => setBulkForm({ ...bulkForm, camp_id: parseInt(e.target.value, 10) })} className="input">
                  {camps.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
                </select></div>
              <div><label className="label">Number of beds</label>
                <input type="number" min="1" max="500" value={bulkForm.num_beds} onChange={(e) => setBulkForm({ ...bulkForm, num_beds: parseInt(e.target.value || 1, 10) })} className="input" /></div>
              <div><label className="label">From</label>
                <input type="date" value={bulkForm.start_date} onChange={(e) => setBulkForm({ ...bulkForm, start_date: e.target.value })} className="input" /></div>
              <div className="col-span-2"><label className="label">To</label>
                <input type="date" value={bulkForm.end_date} onChange={(e) => setBulkForm({ ...bulkForm, end_date: e.target.value })} className="input" /></div>
            </div>
          </div>
        )}
      </Modal>

      {/* INVOICE GENERATE MODAL */}
      <Modal open={!!invForm} onClose={() => setInvForm(null)} size="sm"
        title={invForm ? `Generate invoice — ${invForm.company_name}` : ''}
        footer={<>
          <button onClick={() => setInvForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={generateInvoice} className="btn-primary">Generate</button>
        </>}>
        {invForm && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Month</label>
              <input type="number" min="1" max="12" value={invForm.month} onChange={(e) => setInvForm({ ...invForm, month: parseInt(e.target.value, 10) })} className="input" /></div>
            <div><label className="label">Year</label>
              <input type="number" min="2020" max="2100" value={invForm.year} onChange={(e) => setInvForm({ ...invForm, year: parseInt(e.target.value, 10) })} className="input" /></div>
          </div>
        )}
      </Modal>

      {/* SPEND REPORT MODAL */}
      <Modal open={!!spendDetail} onClose={() => setSpendDetail(null)} size="xl"
        title={spendDetail ? `Spend report — ${spendDetail.acc.company_name}` : ''}>
        {spendDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Total invoices</div><div className="font-bold text-navy">{spendDetail.invoices.total}</div></div>
              <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Paid</div><div className="font-bold text-emerald-700">{spendDetail.invoices.paid}</div></div>
              <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">Outstanding</div><div className="font-bold text-rose-600">{formatSAR(spendDetail.invoices.outstanding, i18n.language)}</div></div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-navy mb-1">By month</h4>
              <div className="space-y-1">
                {spendDetail.by_month.map((m) => (
                  <div key={m.month} className="flex justify-between text-sm border-b border-slate-100 py-1">
                    <span>{m.month}</span>
                    <span>{m.bookings} bookings · {m.beds} beds</span>
                    <span className="font-semibold text-navy">{formatSAR(m.total, i18n.language)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-navy mb-1">By camp</h4>
              <div className="space-y-1">
                {spendDetail.by_camp.map((c, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-slate-100 py-1">
                    <span>{c.camp_name || '—'} <span className="text-slate-400">{c.city}</span></span>
                    <span>{c.bookings} bookings</span>
                    <span className="font-semibold text-navy">{formatSAR(c.total, i18n.language)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
