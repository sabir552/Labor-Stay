import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDate } from '../../utils/formatters';

const TASK_TYPES = ['cleaning', 'laundry', 'linen_change', 'inspection'];
const TASK_ICONS = { cleaning: '🧹', laundry: '👕', linen_change: '🛏️', inspection: '🔍' };
const STATUS_COLOR = {
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-emerald-100 text-emerald-800',
  skipped: 'bg-slate-100 text-slate-600',
};
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FREQUENCIES = ['daily', 'weekly', 'monthly'];

export default function HousekeepingManagement() {
  const { t } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState([]);
  const [campId, setCampId] = useState(null);
  const [tab, setTab] = useState('tasks');
  const [tasks, setTasks] = useState({ tasks: [], summary: { total: 0, by_status: {}, completion_pct: 0 } });
  const [schedules, setSchedules] = useState([]);
  const [rooms, setRooms] = useState([]);

  // task editor
  const [tForm, setTForm] = useState(null);
  const [tDel, setTDel] = useState(null);
  // schedule editor
  const [sForm, setSForm] = useState(null);
  const [sDel, setSDel] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
  }, []);

  const reload = async () => {
    if (!campId) return;
    const [t, s, r] = await Promise.all([
      get(`/housekeeping/tasks/camp/${campId}`),
      get(`/housekeeping/schedules/camp/${campId}`),
      get(`/rooms/camp/${campId}`).catch(() => ({ rooms: [] })),
    ]);
    setTasks({ tasks: t.tasks || [], summary: t.summary || {} });
    setSchedules(s.schedules || []);
    setRooms(r.rooms || []);
  };
  useEffect(() => { reload(); }, [campId]);

  const openTask = (task) => setTForm(task || {
    camp_id: campId, room_id: rooms[0]?.id || null, task_type: 'cleaning',
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: '10:00', notes: '',
  });

  const saveTask = async () => {
    try {
      if (tForm.id) await put(`/housekeeping/tasks/${tForm.id}`, tForm);
      else          await post('/housekeeping/tasks', tForm);
      toast.success(t('housekeeping.taskSaved', 'Task saved'));
      setTForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const updateStatus = async (id, status) => {
    try {
      await put(`/housekeeping/tasks/${id}`, { status });
      toast.success(t('housekeeping.statusUpdated', 'Status updated'));
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const removeTask = async () => {
    await del(`/housekeeping/tasks/${tDel.id}`);
    toast.success(t('housekeeping.taskDeleted', 'Task removed'));
    reload();
  };

  // Schedules
  const openSchedule = (s) => setSForm(s ? { ...s } : {
    camp_id: campId, room_id: rooms[0]?.id || null, task_type: 'cleaning',
    frequency: 'daily', days_of_week: [], time_of_day: '09:00', is_active: true,
  });

  const saveSchedule = async () => {
    try {
      if (sForm.id) await put(`/housekeeping/schedules/${sForm.id}`, sForm);
      else          await post('/housekeeping/schedules', sForm);
      toast.success(t('housekeeping.scheduleSaved', 'Schedule saved'));
      setSForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const generateTasks = async (id) => {
    try {
      const r = await post(`/housekeeping/schedules/${id}/generate`, { horizon_days: 14 });
      toast.success(t('housekeeping.generated', { count: r.created }) || `Generated ${r.created} tasks`);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const removeSchedule = async () => {
    await del(`/housekeeping/schedules/${sDel.id}`);
    toast.success(t('housekeeping.scheduleDeleted', 'Schedule removed'));
    reload();
  };

  const toggleDay = (d) => {
    if (!sForm) return;
    const cur = new Set(sForm.days_of_week || []);
    cur.has(d) ? cur.delete(d) : cur.add(d);
    setSForm({ ...sForm, days_of_week: Array.from(cur) });
  };

  const stats = useMemo(() => ({
    pending: tasks.summary?.by_status?.pending || 0,
    in_progress: tasks.summary?.by_status?.in_progress || 0,
    done: tasks.summary?.by_status?.done || 0,
    completion: tasks.summary?.completion_pct || 0,
  }), [tasks]);

  return (
    <div className="space-y-4">
      <SectionHeader title={t('housekeeping.title', 'Housekeeping')}
        subtitle={t('housekeeping.subtitle', 'Schedule cleaning, laundry, and inspection tasks')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('housekeeping.pending', 'Pending')}        value={stats.pending}     icon="⏳" accent="gold" />
        <StatCard label={t('housekeeping.inProgress', 'In progress')} value={stats.in_progress} icon="🔧" accent="blue" />
        <StatCard label={t('housekeeping.done', 'Done')}              value={stats.done}        icon="✓"  accent="emerald" />
        <StatCard label={t('housekeeping.completionPct', 'Completion')} value={`${stats.completion}%`} icon="📊" accent="navy" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ['tasks',     '📋 ' + t('housekeeping.tabTasks', 'Tasks')],
          ['schedules', '🔁 ' + t('housekeeping.tabSchedules', 'Schedules')],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm border-b-2 transition ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500 hover:text-navy'
            }`}>{label}</button>
        ))}
      </div>

      {/* TASKS */}
      {tab === 'tasks' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openTask(null)} className="btn-primary btn-sm">+ {t('housekeeping.newTask', 'New task')}</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {tasks.tasks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>
            ) : tasks.tasks.map((t_) => (
              <div key={t_.id} className="p-3 flex items-center gap-3">
                <div className="text-2xl">{TASK_ICONS[t_.task_type]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-navy capitalize">{t_.task_type.replace('_', ' ')}</span>
                    <span className={`badge ${STATUS_COLOR[t_.status]}`}>{t_.status.replace('_', ' ')}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    📅 {formatDate(t_.scheduled_date)}{t_.scheduled_time && ` · ${t_.scheduled_time}`}
                    {t_.room_name && ` · 🚪 ${t_.room_name}`}
                    {t_.assigned_name && ` · 👤 ${t_.assigned_name}`}
                  </div>
                  {t_.notes && <div className="text-xs text-slate-400 italic mt-1">"{t_.notes}"</div>}
                </div>
                <div className="flex gap-1">
                  {t_.status !== 'done' && (
                    <button onClick={() => updateStatus(t_.id, 'done')} className="btn-primary btn-sm">✓</button>
                  )}
                  {t_.status === 'pending' && (
                    <button onClick={() => updateStatus(t_.id, 'in_progress')} className="btn-outline btn-sm">→</button>
                  )}
                  <button onClick={() => openTask(t_)} className="btn-ghost btn-sm">✎</button>
                  <button onClick={() => setTDel(t_)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCHEDULES */}
      {tab === 'schedules' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openSchedule(null)} className="btn-primary btn-sm">+ {t('housekeeping.newSchedule', 'New schedule')}</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {schedules.length === 0 && (
              <div className="card p-8 text-center text-slate-500 text-sm col-span-full">{t('common.noData')}</div>
            )}
            {schedules.map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-2xl">{TASK_ICONS[s.task_type]}</div>
                    <div className="font-semibold text-navy capitalize mt-1">{s.task_type.replace('_', ' ')}</div>
                    <div className="text-xs text-slate-500 capitalize">{s.frequency}{s.time_of_day && ` @ ${s.time_of_day}`}</div>
                    {s.room_name && <div className="text-xs text-slate-500">🚪 {s.room_name}</div>}
                  </div>
                  {s.is_active
                    ? <span className="badge bg-emerald-100 text-emerald-800">active</span>
                    : <span className="badge bg-slate-100 text-slate-600">inactive</span>}
                </div>
                {(s.days_of_week || []).length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {(s.days_of_week || []).map((d) => <span key={d} className="chip text-[10px] uppercase">{d}</span>)}
                  </div>
                )}
                <div className="flex gap-1 mt-3">
                  <button onClick={() => generateTasks(s.id)} className="btn-gold btn-sm">⚡ Generate</button>
                  <button onClick={() => openSchedule(s)} className="btn-outline btn-sm">edit</button>
                  <button onClick={() => setSDel(s)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TASK MODAL */}
      <Modal open={!!tForm} onClose={() => setTForm(null)} size="md"
        title={tForm?.id ? t('housekeeping.editTask', 'Edit task') : t('housekeeping.newTask', 'New task')}
        footer={<>
          <button onClick={() => setTForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveTask} className="btn-primary">{t('common.save')}</button>
        </>}>
        {tForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('housekeeping.type', 'Type')}</label>
                <select value={tForm.task_type} onChange={(e) => setTForm({ ...tForm, task_type: e.target.value })} className="input">
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_ICONS[t]} {t.replace('_', ' ')}</option>)}
                </select></div>
              <div><label className="label">{t('housekeeping.room', 'Room')}</label>
                <select value={tForm.room_id || ''} onChange={(e) => setTForm({ ...tForm, room_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="input">
                  <option value="">— camp-wide —</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
              <div><label className="label">{t('housekeeping.date', 'Date')} *</label>
                <input type="date" value={tForm.scheduled_date} onChange={(e) => setTForm({ ...tForm, scheduled_date: e.target.value })} className="input" /></div>
              <div><label className="label">{t('housekeeping.time', 'Time')}</label>
                <input type="time" value={tForm.scheduled_time || ''} onChange={(e) => setTForm({ ...tForm, scheduled_time: e.target.value })} className="input" /></div>
            </div>
            <div><label className="label">{t('housekeeping.notes', 'Notes')}</label>
              <textarea rows={2} value={tForm.notes || ''} onChange={(e) => setTForm({ ...tForm, notes: e.target.value })} className="input" /></div>
          </div>
        )}
      </Modal>

      {/* SCHEDULE MODAL */}
      <Modal open={!!sForm} onClose={() => setSForm(null)} size="md"
        title={sForm?.id ? t('housekeeping.editSchedule', 'Edit schedule') : t('housekeeping.newSchedule', 'New schedule')}
        footer={<>
          <button onClick={() => setSForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveSchedule} className="btn-primary">{t('common.save')}</button>
        </>}>
        {sForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('housekeeping.type', 'Type')}</label>
                <select value={sForm.task_type} onChange={(e) => setSForm({ ...sForm, task_type: e.target.value })} className="input">
                  {TASK_TYPES.map((t) => <option key={t} value={t}>{TASK_ICONS[t]} {t.replace('_', ' ')}</option>)}
                </select></div>
              <div><label className="label">{t('housekeeping.frequency', 'Frequency')}</label>
                <select value={sForm.frequency} onChange={(e) => setSForm({ ...sForm, frequency: e.target.value })} className="input">
                  {FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                </select></div>
              <div><label className="label">{t('housekeeping.room', 'Room')}</label>
                <select value={sForm.room_id || ''} onChange={(e) => setSForm({ ...sForm, room_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="input">
                  <option value="">— camp-wide —</option>
                  {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
              <div><label className="label">{t('housekeeping.time', 'Time')}</label>
                <input type="time" value={sForm.time_of_day || ''} onChange={(e) => setSForm({ ...sForm, time_of_day: e.target.value })} className="input" /></div>
            </div>
            {sForm.frequency === 'weekly' && (
              <div>
                <label className="label">{t('housekeeping.days', 'Days')}</label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS.map((d) => (
                    <button type="button" key={d} onClick={() => toggleDay(d)}
                      className={`px-3 py-1 rounded-full text-xs uppercase border ${
                        (sForm.days_of_week || []).includes(d) ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={!!sForm.is_active} onChange={(e) => setSForm({ ...sForm, is_active: e.target.checked })} className="rounded text-navy" />
              {t('housekeeping.activeSchedule', 'Active')}
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!tDel} onClose={() => setTDel(null)} onConfirm={removeTask}
        title={t('housekeeping.deleteTask', 'Delete task')} message={t('housekeeping.deleteTaskConfirm', 'Remove this task?')} danger />
      <ConfirmDialog open={!!sDel} onClose={() => setSDel(null)} onConfirm={removeSchedule}
        title={t('housekeeping.deleteSchedule', 'Delete schedule')}
        message={t('housekeeping.deleteScheduleConfirm', 'Remove this recurring schedule? Existing tasks remain.')} danger />
    </div>
  );
}
