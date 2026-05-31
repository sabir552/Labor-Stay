import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDateTime } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

const AUDIENCES = [
  { v: 'all',      l: 'Everyone' },
  { v: 'worker',   l: 'Workers only' },
  { v: 'owner',    l: 'Camp owners only' },
  { v: 'provider', l: 'Service providers only' },
];

export default function Announcements() {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', audience: 'all' });
  const [sending, setSending] = useState(false);

  const load = () => get('/admin/announcements').then((r) => setItems(r.announcements || [])).catch(() => setItems([]));
  useEffect(load, []);

  const send = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    setSending(true);
    try {
      const r = await post('/admin/announcements', form);
      toast.success(`Sent to ${r.recipients} recipients`);
      setOpen(false);
      setForm({ title: '', body: '', audience: 'all' });
      load();
    } catch (e) { toast.error(e.message); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('admin.announcements')}
        subtitle={items ? `${items.length} sent` : ''}
        action={<button onClick={() => setOpen(true)} className="btn-primary btn-sm">+ Broadcast new</button>}
      />

      {items === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
      {items && items.length === 0 && (
        <EmptyState icon="📣" title="No announcements yet" body="Send your first one to all platform users."
          action={<button onClick={() => setOpen(true)} className="btn-primary">+ Broadcast</button>} />
      )}

      {items && items.length > 0 && (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-navy">{a.title}</h4>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{a.body}</p>
                </div>
                <span className="badge bg-navy-50 text-navy capitalize">{a.audience}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-2">{formatDateTime(a.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Broadcast announcement"
        footer={<>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={send} disabled={sending} className="btn-primary">{sending ? t('common.loading') : 'Send'}</button>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="label">Audience</label>
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="input">
              {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder="e.g. Scheduled maintenance" />
          </div>
          <div>
            <label className="label">Message *</label>
            <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="input" placeholder="Body of the announcement…" />
          </div>
          <p className="text-xs text-slate-500">In-app notifications are sent to all selected users. Emails go to the first 50 (dev cap).</p>
        </div>
      </Modal>
    </div>
  );
}
