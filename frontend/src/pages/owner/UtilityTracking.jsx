import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import { formatSAR, formatDate } from '../../utils/formatters';

const TYPES = [
  { v: 'electricity', l: 'Electricity', icon: '⚡', unit: 'kWh' },
  { v: 'water',       l: 'Water',       icon: '💧', unit: 'm³' },
  { v: 'gas',         l: 'Gas',         icon: '🔥', unit: 'm³' },
  { v: 'diesel',      l: 'Diesel',      icon: '🛢️', unit: 'L' },
];

export default function UtilityTracking() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState([]);
  const [campId, setCampId] = useState(null);
  const [tab, setTab] = useState('readings');

  const [readings, setReadings] = useState([]);
  const [report, setReport] = useState({ by_type: [], by_month: [] });
  const [cost, setCost] = useState(null);
  const [alerts, setAlerts] = useState([]);

  const [readForm, setReadForm] = useState(null);
  const [alertForm, setAlertForm] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
  }, []);

  const reload = async () => {
    if (!campId) return;
    const [r, rep, c, a] = await Promise.all([
      get(`/utilities/readings/camp/${campId}`),
      get(`/utilities/reports/camp/${campId}`),
      get(`/utilities/cost/camp/${campId}`),
      get(`/utilities/alerts/camp/${campId}`),
    ]);
    setReadings(r.readings || []);
    setReport(rep);
    setCost(c);
    setAlerts(a.alerts || []);
  };
  useEffect(() => { reload(); }, [campId]);

  const openReading = () => setReadForm({
    camp_id: campId, utility_type: 'electricity', meter_number: '',
    current_reading: 0, rate_per_unit: 0.18,
    reading_date: new Date().toISOString().slice(0, 10), notes: '',
  });

  const saveReading = async () => {
    try {
      await post('/utilities/readings', readForm);
      toast.success(t('utilities.readingSaved', 'Reading recorded'));
      setReadForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const deleteReading = async (id) => {
    if (!confirm(t('utilities.confirmDeleteReading', 'Delete this reading?'))) return;
    await del(`/utilities/readings/${id}`);
    toast.success(t('utilities.readingDeleted', 'Reading deleted'));
    reload();
  };

  const openAlert = () => setAlertForm({
    camp_id: campId, utility_type: 'electricity', threshold_value: 1000, alert_email: '',
  });

  const saveAlert = async () => {
    try {
      await post('/utilities/alerts', alertForm);
      toast.success(t('utilities.alertSaved', 'Alert created'));
      setAlertForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const deleteAlert = async (id) => {
    if (!confirm(t('utilities.confirmDeleteAlert', 'Delete this alert?'))) return;
    await del(`/utilities/alerts/${id}`);
    toast.success(t('utilities.alertDeleted', 'Alert deleted'));
    reload();
  };

  if (!camps.length) {
    return <div className="card p-8 text-center text-slate-500">{t('utilities.noCamps', 'No camps yet. Add a camp first.')}</div>;
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('utilities.title', 'Utility tracking')}
        subtitle={t('utilities.subtitle', 'Log meter readings, track consumption, set alerts')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(report.by_type || []).slice(0, 4).map((r) => {
          const meta = TYPES.find((t) => t.v === r.utility_type);
          return (
            <StatCard key={r.utility_type}
              label={`${meta?.icon} ${meta?.l || r.utility_type}`}
              value={`${Math.round(parseFloat(r.consumption || 0))} ${meta?.unit || ''}`}
              icon=""
              accent="navy" />
          );
        })}
        {cost && (
          <StatCard label={t('utilities.costPerWorker', 'Cost / worker')}
            value={formatSAR(cost.cost_per_worker, i18n.language)}
            icon="💰" accent="gold" />
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['readings', '📊 ' + t('utilities.tabReadings', 'Readings')],
          ['report',   '📈 ' + t('utilities.tabReport', 'Reports')],
          ['alerts',   '🔔 ' + t('utilities.tabAlerts', 'Alerts')],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500'
            }`}>{l}</button>
        ))}
      </div>

      {tab === 'readings' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openReading} className="btn-primary btn-sm">+ {t('utilities.newReading', 'New reading')}</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {readings.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
            {readings.map((r) => {
              const meta = TYPES.find((t) => t.v === r.utility_type);
              return (
                <div key={r.id} className="p-3 flex items-center gap-3">
                  <div className="text-2xl">{meta?.icon || '📊'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-navy capitalize">{r.utility_type}{r.meter_number && ` · ${r.meter_number}`}</div>
                    <div className="text-xs text-slate-500">
                      {r.previous_reading} → {r.current_reading} = <b>{r.consumption} {r.unit}</b> · {formatDate(r.reading_date)}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-semibold text-navy">{formatSAR(r.total_cost, i18n.language)}</div>
                    <div className="text-[10px] text-slate-500">@ {r.rate_per_unit}/unit</div>
                  </div>
                  <button onClick={() => deleteReading(r.id)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-3">
          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-3">{t('utilities.byType', 'By utility type')}</h3>
            <div className="space-y-2">
              {(report.by_type || []).map((r) => {
                const meta = TYPES.find((t) => t.v === r.utility_type);
                return (
                  <div key={r.utility_type} className="flex items-center gap-3">
                    <span className="text-xl">{meta?.icon}</span>
                    <div className="flex-1">
                      <div className="font-medium text-navy capitalize">{r.utility_type}</div>
                      <div className="text-xs text-slate-500">{r.readings} readings · {Math.round(r.consumption)} {meta?.unit}</div>
                    </div>
                    <div className="font-bold text-navy">{formatSAR(r.total_cost, i18n.language)}</div>
                  </div>
                );
              })}
              {(report.by_type || []).length === 0 && (
                <div className="text-sm text-slate-500 text-center py-4">{t('common.noData')}</div>
              )}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-navy mb-3">{t('utilities.byMonth', 'By month')}</h3>
            <div className="space-y-1">
              {(report.by_month || []).map((m, i) => {
                const meta = TYPES.find((t) => t.v === m.utility_type);
                return (
                  <div key={i} className="flex items-center gap-3 text-sm py-1 border-b border-slate-100">
                    <span className="text-slate-500 font-mono w-20">{m.month}</span>
                    <span className="text-xl">{meta?.icon}</span>
                    <span className="capitalize flex-1">{m.utility_type}</span>
                    <span>{Math.round(m.consumption)} {meta?.unit}</span>
                    <b className="text-navy">{formatSAR(m.total_cost, i18n.language)}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'alerts' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openAlert} className="btn-primary btn-sm">+ {t('utilities.newAlert', 'New alert')}</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {alerts.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
            {alerts.map((a) => {
              const meta = TYPES.find((t) => t.v === a.utility_type);
              return (
                <div key={a.id} className="p-3 flex items-center gap-3">
                  <div className="text-2xl">{meta?.icon}</div>
                  <div className="flex-1">
                    <div className="font-medium text-navy capitalize">{a.utility_type} {t('utilities.threshold', 'threshold')}: {a.threshold_value} {meta?.unit}</div>
                    {a.alert_email && <div className="text-xs text-slate-500">📧 {a.alert_email}</div>}
                    {a.last_triggered && <div className="text-[10px] text-rose-600">⚠ Last triggered: {formatDate(a.last_triggered)}</div>}
                  </div>
                  <span className={`badge ${a.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {a.is_active ? 'active' : 'paused'}
                  </span>
                  <button onClick={() => deleteAlert(a.id)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal open={!!readForm} onClose={() => setReadForm(null)} size="md"
        title={t('utilities.newReading', 'New reading')}
        footer={<>
          <button onClick={() => setReadForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveReading} className="btn-primary">{t('common.save')}</button>
        </>}>
        {readForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('utilities.utilityType', 'Utility')}</label>
                <select value={readForm.utility_type} onChange={(e) => setReadForm({ ...readForm, utility_type: e.target.value })} className="input">
                  {TYPES.map((t) => <option key={t.v} value={t.v}>{t.icon} {t.l}</option>)}
                </select></div>
              <div><label className="label">{t('utilities.meter', 'Meter #')}</label>
                <input value={readForm.meter_number} onChange={(e) => setReadForm({ ...readForm, meter_number: e.target.value })} className="input" placeholder="M-001" /></div>
              <div><label className="label">{t('utilities.currentReading', 'Current reading')}</label>
                <input type="number" min="0" step="0.01" value={readForm.current_reading} onChange={(e) => setReadForm({ ...readForm, current_reading: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">{t('utilities.rate', 'Rate/unit (SAR)')}</label>
                <input type="number" min="0" step="0.01" value={readForm.rate_per_unit} onChange={(e) => setReadForm({ ...readForm, rate_per_unit: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div className="col-span-2"><label className="label">{t('utilities.date', 'Reading date')}</label>
                <input type="date" value={readForm.reading_date} onChange={(e) => setReadForm({ ...readForm, reading_date: e.target.value })} className="input" /></div>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!alertForm} onClose={() => setAlertForm(null)} size="sm"
        title={t('utilities.newAlert', 'New alert')}
        footer={<>
          <button onClick={() => setAlertForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveAlert} className="btn-primary">{t('common.save')}</button>
        </>}>
        {alertForm && (
          <div className="space-y-3">
            <div><label className="label">{t('utilities.utilityType', 'Utility')}</label>
              <select value={alertForm.utility_type} onChange={(e) => setAlertForm({ ...alertForm, utility_type: e.target.value })} className="input">
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.icon} {t.l}</option>)}
              </select></div>
            <div><label className="label">{t('utilities.thresholdLabel', 'Threshold value')}</label>
              <input type="number" min="0" value={alertForm.threshold_value} onChange={(e) => setAlertForm({ ...alertForm, threshold_value: parseFloat(e.target.value || 0) })} className="input" /></div>
            <div><label className="label">{t('utilities.alertEmail', 'Alert email (optional)')}</label>
              <input type="email" value={alertForm.alert_email} onChange={(e) => setAlertForm({ ...alertForm, alert_email: e.target.value })} className="input" placeholder="ops@..." /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
