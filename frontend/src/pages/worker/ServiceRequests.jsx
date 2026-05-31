import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import { formatDate, statusBadgeClass } from '../../utils/formatters';

const PRIORITY_COLOR = {
  emergency: 'bg-rose-100 text-rose-700',
  high:      'bg-amber-100 text-amber-800',
  medium:    'bg-blue-100 text-blue-700',
  low:       'bg-slate-100 text-slate-600',
};

export default function ServiceRequests() {
  const { t } = useTranslation();
  const toast = useToast();
  const [types, setTypes] = useState([]);
  const [requests, setRequests] = useState(null);
  const [bookings, setBookings] = useState([]);

  // New-request modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = async () => {
    const [t, r, b] = await Promise.all([
      get('/worker-requests/types'),
      get('/worker-requests/mine'),
      get('/bookings/my-bookings'),
    ]);
    setTypes(t.types || []);
    setRequests(r.requests || []);
    setBookings(b.bookings || []);
  };
  useEffect(() => { reload(); }, []);

  const openNew = (type) => {
    const live = (bookings || []).filter((b) => ['confirmed', 'checked_in', 'pending'].includes(b.status));
    setForm({
      request_type: type.type,
      title: '',
      description: '',
      priority: type.type === 'emergency_support' ? 'emergency' : 'medium',
      booking_id: live[0]?.id || null,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form?.title?.trim() || !form?.description?.trim()) {
      toast.error(t('worker.requestFillRequired', 'Please fill title and description'));
      return;
    }
    setSubmitting(true);
    try {
      await post('/worker-requests', form);
      toast.success(t('worker.requestSubmitted', 'Request submitted'));
      setOpen(false);
      reload();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('worker.requestsTitle', 'Service requests')}
        subtitle={t('worker.requestsSubtitle', 'Submit and track requests to camp staff')} />

      {/* Request type tiles */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
          {t('worker.newRequest', 'New request')}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {types.map((t) => (
            <button key={t.type} onClick={() => openNew(t)}
              className="card p-3 text-start hover:shadow-lift transition flex items-center gap-2">
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm font-medium text-navy">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* My requests list */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2 mt-6">
          {t('worker.myRequests', 'My requests')}
        </h3>
        {requests === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}
        {requests && requests.length === 0 && (
          <EmptyState icon="📋" title={t('worker.noRequests', 'No requests yet')} />
        )}
        {requests && requests.length > 0 && (
          <div className="card divide-y divide-slate-100">
            {requests.map((r) => {
              const meta = types.find((tt) => tt.type === r.request_type);
              return (
                <div key={r.id} className="p-3 flex items-start gap-3">
                  <div className="text-2xl">{meta?.icon || '📋'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-navy">{r.title}</span>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>{r.status?.replace('_', ' ')}</span>
                      <span className={`badge ${PRIORITY_COLOR[r.priority]}`}>{r.priority}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{meta?.label} · {r.camp_name || '—'}</div>
                    <p className="text-sm text-slate-700 mt-1 line-clamp-2">{r.description}</p>
                    {r.response_notes && (
                      <div className="text-xs bg-emerald-50 border-s-2 border-emerald-500 p-2 mt-2 text-emerald-800">
                        <b>{t('worker.staffReply', 'Staff reply')}:</b> {r.response_notes}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1">{formatDate(r.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New-request modal */}
      <Modal open={open} onClose={() => setOpen(false)} size="lg"
        title={form ? `${types.find((t) => t.type === form.request_type)?.icon || '📋'} ${types.find((t) => t.type === form.request_type)?.label || ''}` : ''}
        footer={<>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submit} disabled={submitting} className="btn-primary">
            {submitting ? t('common.loading') : t('common.confirm')}
          </button>
        </>}>
        {form && (
          <div className="space-y-3">
            <div>
              <label className="label">{t('worker.title', 'Title')} *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input"
                placeholder={t('worker.titlePlaceholder', 'Short summary')} />
            </div>
            <div>
              <label className="label">{t('worker.description', 'Description')} *</label>
              <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input"
                placeholder={t('worker.descPlaceholder', 'Describe the issue in detail…')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{t('worker.priority', 'Priority')}</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="input">
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="emergency">emergency</option>
                </select>
              </div>
              <div>
                <label className="label">{t('worker.relatedBooking', 'Related booking')}</label>
                <select value={form.booking_id || ''} onChange={(e) => setForm({ ...form, booking_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="input">
                  <option value="">— none —</option>
                  {bookings.map((b) => (
                    <option key={b.id} value={b.id}>{b.booking_code} — {b.camp_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
