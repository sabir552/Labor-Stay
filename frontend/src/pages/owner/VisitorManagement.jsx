import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatDateTime } from '../../utils/formatters';
import { debounce } from '../../utils/helpers';

export default function VisitorManagement() {
  const { t } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState([]);
  const [campId, setCampId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeCount, setActiveCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
  }, []);

  const reload = async () => {
    if (!campId) return;
    const qs = new URLSearchParams();
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (search) qs.set('q', search);
    const [logsR, activeR] = await Promise.all([
      get(`/visitors/log/camp/${campId}?` + qs.toString()),
      get(`/visitors/active/camp/${campId}`),
    ]);
    setLogs(logsR.logs || []);
    setActiveCount(activeR.count || 0);
  };
  useEffect(() => { reload(); }, [campId, statusFilter, search]);

  const debouncedSearch = React.useMemo(() => debounce((v) => setSearch(v), 300), []);

  const openNew = () => { setForm({
    camp_id: campId, visitor_name: '', visitor_id_number: '', visitor_phone: '',
    host_worker_id: null, host_room: '', purpose: '', vehicle_plate: '',
  }); setOpen(true); };

  const submit = async () => {
    if (!form?.visitor_name?.trim()) {
      toast.error(t('visitors.nameRequired', 'Visitor name is required'));
      return;
    }
    try {
      await post('/visitors/log', form);
      toast.success(t('visitors.entryLogged', 'Visitor logged in'));
      setOpen(false);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const markExit = async (id) => {
    try {
      await put(`/visitors/log/${id}/exit`, {});
      toast.success(t('visitors.exited', 'Visitor marked as exited'));
      reload();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('visitors.title', 'Visitor management')}
        subtitle={t('visitors.subtitle', 'Log entries, exits, and visitor history')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('visitors.activeNow', 'Active now')} value={activeCount} icon="🚪" accent="emerald" />
        <StatCard label={t('visitors.totalLogged', 'Total logged')} value={logs.length} icon="📋" />
        <StatCard label={t('visitors.exited', 'Exited')} value={logs.filter((l) => l.exit_time).length} icon="👋" accent="navy" />
        <StatCard label={t('visitors.withVehicles', 'With vehicles')} value={logs.filter((l) => l.vehicle_plate).length} icon="🚗" accent="gold" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={openNew} className="btn-gold btn-sm">+ {t('visitors.logEntry', 'Log visitor entry')}</button>
        <div className="flex gap-2 ms-auto">
          <input type="search" defaultValue={search} onChange={(e) => debouncedSearch(e.target.value)}
            placeholder={t('visitors.searchPlaceholder', '🔍 Search name or ID…')} className="input !py-2 max-w-xs" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input !py-2 max-w-[140px]">
            <option value="all">{t('common.all')}</option>
            <option value="active">{t('visitors.activeOnly', 'Active only')}</option>
            <option value="exited">{t('visitors.exitedOnly', 'Exited only')}</option>
          </select>
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
        ) : logs.map((l) => (
          <div key={l.id} className="p-3 flex items-start gap-3">
            <div className="text-2xl">{l.exit_time ? '👋' : '🚪'}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-navy">{l.visitor_name}</span>
                {l.exit_time
                  ? <span className="badge bg-slate-100 text-slate-600">exited</span>
                  : <span className="badge bg-emerald-100 text-emerald-800 animate-pulse">inside</span>}
                {l.visitor_id_number && <span className="text-[10px] text-slate-400 font-mono">ID: {l.visitor_id_number}</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {l.purpose && `📝 ${l.purpose} · `}
                {l.host_name && `host: ${l.host_name} · `}
                {l.host_room && `room: ${l.host_room} · `}
                {l.visitor_phone && `📞 ${l.visitor_phone}`}
              </div>
              {l.vehicle_plate && <div className="text-xs text-slate-500">🚗 {l.vehicle_plate}</div>}
              <div className="text-[10px] text-slate-400 mt-1">
                In: {formatDateTime(l.entry_time)}
                {l.exit_time && ` · Out: ${formatDateTime(l.exit_time)}`}
                {l.approved_by_name && ` · by ${l.approved_by_name}`}
              </div>
            </div>
            {!l.exit_time && (
              <button onClick={() => markExit(l.id)} className="btn-outline btn-sm">
                👋 {t('visitors.markExit', 'Mark exit')}
              </button>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} size="md"
        title={`🚪 ${t('visitors.logNew', 'Log new visitor')}`}
        footer={<>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submit} className="btn-primary">{t('common.save')}</button>
        </>}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">{t('visitors.visitorName', 'Visitor name')} *</label>
                <input value={form.visitor_name} onChange={(e) => setForm({ ...form, visitor_name: e.target.value })} className="input" /></div>
              <div><label className="label">{t('visitors.idNumber', 'ID number')}</label>
                <input value={form.visitor_id_number} onChange={(e) => setForm({ ...form, visitor_id_number: e.target.value })} className="input" /></div>
              <div><label className="label">{t('visitors.phone', 'Phone')}</label>
                <input value={form.visitor_phone} onChange={(e) => setForm({ ...form, visitor_phone: e.target.value })} className="input" placeholder="+9665..." /></div>
              <div><label className="label">{t('visitors.hostRoom', 'Host room')}</label>
                <input value={form.host_room} onChange={(e) => setForm({ ...form, host_room: e.target.value })} className="input" placeholder="e.g. A12" /></div>
              <div><label className="label">{t('visitors.vehiclePlate', 'Vehicle plate')}</label>
                <input value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} className="input" /></div>
              <div className="col-span-2"><label className="label">{t('visitors.purpose', 'Purpose of visit')}</label>
                <input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="input" placeholder={t('visitors.purposePlaceholder', 'e.g. Family visit, business meeting')} /></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
