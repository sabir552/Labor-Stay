import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, post, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader, StatCard } from '../../components/layout/DashboardLayout';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { formatDate, formatSAR } from '../../utils/formatters';

const ROLES = ['cleaner', 'security', 'maintenance', 'driver', 'cook', 'supervisor', 'other'];
const ROLE_ICON = {
  cleaner: '🧹', security: '🛡️', maintenance: '🔧', driver: '🚗',
  cook: '👨‍🍳', supervisor: '👔', other: '👤',
};
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function StaffManagement() {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [camps, setCamps] = useState([]);
  const [campId, setCampId] = useState(null);
  const [tab, setTab] = useState('staff');
  const [staff, setStaff] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [payroll, setPayroll] = useState({ records: [], totals: {} });

  // modals
  const [sForm, setSForm] = useState(null);
  const [sDel, setSDel] = useState(null);
  const [attForm, setAttForm] = useState(null);
  const [shForm, setShForm] = useState(null);
  const [payForm, setPayForm] = useState(null);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setCampId(r.camps[0].id);
    });
  }, []);

  const reload = async () => {
    if (!campId) return;
    const [s, a, sh, p] = await Promise.all([
      get(`/staff/camp/${campId}?active=true`),
      get(`/staff/attendance/camp/${campId}`),
      get(`/staff/shifts/camp/${campId}`),
      get(`/payroll/records/camp/${campId}`),
    ]);
    setStaff(s.staff || []);
    setAttendance(a.attendance || []);
    setShifts(sh.shifts || []);
    setPayroll({ records: p.records || [], totals: p.totals || {} });
  };
  useEffect(() => { reload(); }, [campId]);

  // ─── STAFF ───
  const openStaff = (s) => setSForm(s ? { ...s } : {
    camp_id: campId, full_name: '', role: 'cleaner',
    phone: '', email: '', nationality: '',
    iqama_number: '', iqama_expiry: '',
    passport_number: '', passport_expiry: '',
    salary: 2000, hire_date: new Date().toISOString().slice(0, 10), is_active: true,
  });

  const saveStaff = async () => {
    try {
      if (sForm.id) await put(`/staff/${sForm.id}`, sForm);
      else          await post('/staff', sForm);
      toast.success(t('staff.saved', 'Staff saved'));
      setSForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const removeStaff = async () => {
    try {
      const r = await del(`/staff/${sDel.id}`);
      if (r.soft) toast.warn(t('staff.softDeleted', 'Marked inactive (has records)'));
      else        toast.success(t('staff.deleted', 'Staff removed'));
      reload();
    } catch (e) { toast.error(e.message); }
  };

  // ─── ATTENDANCE ───
  const openAttendance = (s) => setAttForm({
    staff_id: s.id, staff_name: s.full_name,
    date: new Date().toISOString().slice(0, 10),
    check_in_time: '08:00', check_out_time: '17:00',
    hours_worked: 9, status: 'present', notes: '',
  });

  const saveAttendance = async () => {
    try {
      await post('/staff/attendance', attForm);
      toast.success(t('staff.attendanceRecorded', 'Attendance recorded'));
      setAttForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  // ─── SHIFTS ───
  const openShift = (s) => setShForm(s ? { ...s } : {
    camp_id: campId, staff_id: staff[0]?.id || null,
    shift_name: 'Morning', start_time: '06:00', end_time: '14:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  });

  const saveShift = async () => {
    try {
      if (shForm.id) await put(`/staff/shifts/${shForm.id}`, shForm);
      else           await post('/staff/shifts', shForm);
      toast.success(t('staff.shiftSaved', 'Shift saved'));
      setShForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const toggleDay = (d) => {
    if (!shForm) return;
    const cur = new Set(shForm.days || []);
    cur.has(d) ? cur.delete(d) : cur.add(d);
    setShForm({ ...shForm, days: Array.from(cur) });
  };

  // ─── PAYROLL ───
  const openPayroll = (s) => {
    const now = new Date();
    setPayForm({
      staff_id: s.id, staff_name: s.full_name,
      month: now.getMonth() + 1, year: now.getFullYear(),
      basic_salary: s.salary || 0,
      allowances: 0, deductions: 0, accommodation_deduction: 0, notes: '',
    });
  };

  const savePayroll = async () => {
    try {
      await post('/payroll/records', payForm);
      toast.success(t('staff.payrollAdded', 'Payroll record created'));
      setPayForm(null);
      reload();
    } catch (e) { toast.error(e.message); }
  };

  const markPaid = async (id) => {
    try {
      await put(`/payroll/records/${id}/pay`, {});
      toast.success(t('staff.payrollPaid', 'Marked paid'));
      reload();
    } catch (e) { toast.error(e.message); }
  };

  // Stats
  const stats = {
    total: staff.length,
    expiry: staff.filter((s) => (s.expiry_alerts || []).length > 0).length,
    attendanceToday: attendance.filter((a) => a.date === new Date().toISOString().slice(0, 10) && a.status === 'present').length,
    payrollPending: payroll.records.filter((r) => r.payment_status === 'pending').length,
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={t('staff.title', 'Staff management')}
        subtitle={t('staff.subtitle', 'Staff, attendance, shifts, payroll')}
        action={
          <select value={campId || ''} onChange={(e) => setCampId(parseInt(e.target.value, 10))}
            className="input !py-2 max-w-[200px]">
            {camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={t('staff.totalActive', 'Active staff')} value={stats.total} icon="👥" />
        <StatCard label={t('staff.expiryAlerts', 'Doc expiry alerts')} value={stats.expiry} icon="⚠️" accent="rose" />
        <StatCard label={t('staff.attendanceToday', 'Present today')} value={stats.attendanceToday} icon="✓" accent="emerald" />
        <StatCard label={t('staff.payrollPending', 'Payroll pending')} value={stats.payrollPending} icon="💰" accent="gold" />
      </div>

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          ['staff',      '👥 ' + t('staff.tabStaff', 'Staff')],
          ['attendance', '✓ ' + t('staff.tabAttendance', 'Attendance')],
          ['shifts',     '⏰ ' + t('staff.tabShifts', 'Shifts')],
          ['payroll',    '💰 ' + t('staff.tabPayroll', 'Payroll')],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 -mb-px text-sm whitespace-nowrap border-b-2 ${
              tab === k ? 'border-navy text-navy font-semibold' : 'border-transparent text-slate-500'
            }`}>{l}</button>
        ))}
      </div>

      {/* STAFF */}
      {tab === 'staff' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openStaff(null)} className="btn-primary btn-sm">+ {t('staff.add', 'Add staff')}</button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {staff.length === 0 && <div className="card p-8 text-center text-slate-500 text-sm col-span-full">{t('common.noData')}</div>}
            {staff.map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex items-start gap-3">
                  {s.photo_url
                    ? <img src={s.photo_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                    : <div className="w-12 h-12 rounded-full bg-navy text-white flex items-center justify-center text-xl">{ROLE_ICON[s.role]}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-navy">{s.full_name}</div>
                    <div className="text-xs text-slate-500 capitalize">{s.role}{s.nationality && ` · ${s.nationality}`}</div>
                    {s.phone && <div className="text-xs text-slate-500">📞 {s.phone}</div>}
                  </div>
                </div>
                {s.expiry_alerts?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {s.expiry_alerts.map((a, i) => (
                      <div key={i} className={`text-[10px] px-2 py-1 rounded ${
                        a.status === 'expired' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        ⚠️ {a.field} {a.status === 'expired' ? `expired ${a.days_overdue}d ago` : `expires in ${a.days_remaining}d`}
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-slate-500 mt-2">
                  💵 {formatSAR(s.salary, i18n.language)}/mo
                </div>
                <div className="flex gap-1 mt-3 flex-wrap">
                  <button onClick={() => openAttendance(s)} className="btn-outline btn-sm">✓ attend</button>
                  <button onClick={() => openPayroll(s)} className="btn-outline btn-sm">💰 pay</button>
                  <button onClick={() => openStaff(s)} className="btn-ghost btn-sm">✎</button>
                  <button onClick={() => setSDel(s)} className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ATTENDANCE */}
      {tab === 'attendance' && (
        <div className="card divide-y divide-slate-100">
          {attendance.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
          {attendance.map((a) => (
            <div key={a.id} className="p-3 flex items-center gap-3">
              <div className="text-xl">{a.status === 'present' ? '✓' : a.status === 'late' ? '⏰' : a.status === 'absent' ? '✕' : '½'}</div>
              <div className="flex-1">
                <div className="font-medium text-navy">{a.staff_name}</div>
                <div className="text-xs text-slate-500 capitalize">{a.role} · {formatDate(a.date)}</div>
                {a.check_in_time && (
                  <div className="text-xs text-slate-500">in {a.check_in_time}{a.check_out_time && ` · out ${a.check_out_time}`} · {a.hours_worked}h</div>
                )}
              </div>
              <span className={`badge capitalize ${
                a.status === 'present' ? 'bg-emerald-100 text-emerald-800'
                : a.status === 'late' ? 'bg-amber-100 text-amber-800'
                : a.status === 'absent' ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-600'
              }`}>{a.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* SHIFTS */}
      {tab === 'shifts' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => openShift(null)} className="btn-primary btn-sm">+ {t('staff.addShift', 'Add shift')}</button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {shifts.length === 0 && <div className="card p-8 text-center text-slate-500 text-sm col-span-full">{t('common.noData')}</div>}
            {shifts.map((sh) => (
              <div key={sh.id} className="card p-4">
                <div className="font-semibold text-navy">⏰ {sh.shift_name}</div>
                <div className="text-xs text-slate-500">{sh.start_time} → {sh.end_time}</div>
                {sh.staff_name && <div className="text-xs text-slate-500">👤 {sh.staff_name}</div>}
                <div className="flex gap-1 mt-2 flex-wrap">
                  {(sh.days || []).map((d) => <span key={d} className="chip text-[10px] uppercase">{d}</span>)}
                </div>
                <button onClick={() => openShift(sh)} className="btn-outline btn-sm mt-3">edit</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYROLL */}
      {tab === 'payroll' && (
        <div className="space-y-3">
          <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div><div className="text-xs text-slate-500">Basic</div><div className="font-semibold text-navy">{formatSAR(payroll.totals.basic || 0, i18n.language)}</div></div>
            <div><div className="text-xs text-slate-500">Allowances</div><div className="font-semibold text-navy">{formatSAR(payroll.totals.allowances || 0, i18n.language)}</div></div>
            <div><div className="text-xs text-slate-500">Deductions</div><div className="font-semibold text-rose-600">−{formatSAR(payroll.totals.deductions || 0, i18n.language)}</div></div>
            <div><div className="text-xs text-slate-500">Accommodation</div><div className="font-semibold text-rose-600">−{formatSAR(payroll.totals.accommodation || 0, i18n.language)}</div></div>
            <div><div className="text-xs text-slate-500">Total Net</div><div className="font-bold text-navy">{formatSAR(payroll.totals.net || 0, i18n.language)}</div></div>
          </div>
          <div className="card divide-y divide-slate-100">
            {payroll.records.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">{t('common.noData')}</div>}
            {payroll.records.map((r) => (
              <div key={r.id} className="p-3 flex items-center gap-3">
                <div className="text-xl">💰</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-navy">{r.staff_name} <span className="text-xs text-slate-500 capitalize">({r.staff_role})</span></div>
                  <div className="text-xs text-slate-500">{r.month}/{r.year} · basic {formatSAR(r.basic_salary, i18n.language)} + allow {formatSAR(r.allowances, i18n.language)} − ded {formatSAR(r.deductions, i18n.language)} − accom {formatSAR(r.accommodation_deduction, i18n.language)}</div>
                </div>
                <div className="text-end">
                  <div className="font-bold text-navy">{formatSAR(r.net_salary, i18n.language)}</div>
                  {r.payment_status === 'paid'
                    ? <span className="badge bg-emerald-100 text-emerald-800">paid {r.payment_date && `· ${formatDate(r.payment_date)}`}</span>
                    : <button onClick={() => markPaid(r.id)} className="btn-gold btn-sm mt-1">Mark paid</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STAFF MODAL */}
      <Modal open={!!sForm} onClose={() => setSForm(null)} size="lg"
        title={sForm?.id ? `Edit: ${sForm.full_name}` : t('staff.addNew', 'Add new staff')}
        footer={<>
          <button onClick={() => setSForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveStaff} className="btn-primary">{t('common.save')}</button>
        </>}>
        {sForm && (
          <div className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className="label">{t('staff.fullName', 'Full name')} *</label>
                <input value={sForm.full_name} onChange={(e) => setSForm({ ...sForm, full_name: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.role', 'Role')} *</label>
                <select value={sForm.role} onChange={(e) => setSForm({ ...sForm, role: e.target.value })} className="input">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_ICON[r]} {r}</option>)}
                </select></div>
              <div><label className="label">{t('staff.phone', 'Phone')}</label>
                <input value={sForm.phone || ''} onChange={(e) => setSForm({ ...sForm, phone: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.email', 'Email')}</label>
                <input type="email" value={sForm.email || ''} onChange={(e) => setSForm({ ...sForm, email: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.nationality', 'Nationality')}</label>
                <input value={sForm.nationality || ''} onChange={(e) => setSForm({ ...sForm, nationality: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.salary', 'Salary (SAR/mo)')}</label>
                <input type="number" min="0" step="50" value={sForm.salary || 0} onChange={(e) => setSForm({ ...sForm, salary: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">{t('staff.iqamaNumber', 'Iqama number')}</label>
                <input value={sForm.iqama_number || ''} onChange={(e) => setSForm({ ...sForm, iqama_number: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.iqamaExpiry', 'Iqama expiry')}</label>
                <input type="date" value={sForm.iqama_expiry || ''} onChange={(e) => setSForm({ ...sForm, iqama_expiry: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.passportNumber', 'Passport number')}</label>
                <input value={sForm.passport_number || ''} onChange={(e) => setSForm({ ...sForm, passport_number: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.passportExpiry', 'Passport expiry')}</label>
                <input type="date" value={sForm.passport_expiry || ''} onChange={(e) => setSForm({ ...sForm, passport_expiry: e.target.value })} className="input" /></div>
              <div><label className="label">{t('staff.hireDate', 'Hire date')}</label>
                <input type="date" value={sForm.hire_date || ''} onChange={(e) => setSForm({ ...sForm, hire_date: e.target.value })} className="input" /></div>
            </div>
          </div>
        )}
      </Modal>

      {/* ATTENDANCE MODAL */}
      <Modal open={!!attForm} onClose={() => setAttForm(null)} size="md"
        title={attForm ? `Attendance: ${attForm.staff_name}` : ''}
        footer={<>
          <button onClick={() => setAttForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveAttendance} className="btn-primary">{t('common.save')}</button>
        </>}>
        {attForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Date</label>
                <input type="date" value={attForm.date} onChange={(e) => setAttForm({ ...attForm, date: e.target.value })} className="input" /></div>
              <div><label className="label">Status</label>
                <select value={attForm.status} onChange={(e) => setAttForm({ ...attForm, status: e.target.value })} className="input">
                  {['present', 'absent', 'late', 'half_day'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select></div>
              <div><label className="label">Check in</label>
                <input type="time" value={attForm.check_in_time || ''} onChange={(e) => setAttForm({ ...attForm, check_in_time: e.target.value })} className="input" /></div>
              <div><label className="label">Check out</label>
                <input type="time" value={attForm.check_out_time || ''} onChange={(e) => setAttForm({ ...attForm, check_out_time: e.target.value })} className="input" /></div>
              <div className="col-span-2"><label className="label">Hours worked</label>
                <input type="number" min="0" max="24" step="0.5" value={attForm.hours_worked || 0} onChange={(e) => setAttForm({ ...attForm, hours_worked: parseFloat(e.target.value || 0) })} className="input" /></div>
            </div>
          </div>
        )}
      </Modal>

      {/* SHIFT MODAL */}
      <Modal open={!!shForm} onClose={() => setShForm(null)} size="md"
        title={shForm?.id ? 'Edit shift' : 'Add shift'}
        footer={<>
          <button onClick={() => setShForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={saveShift} className="btn-primary">{t('common.save')}</button>
        </>}>
        {shForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Shift name</label>
                <input value={shForm.shift_name} onChange={(e) => setShForm({ ...shForm, shift_name: e.target.value })} className="input" /></div>
              <div><label className="label">Start time</label>
                <input type="time" value={shForm.start_time} onChange={(e) => setShForm({ ...shForm, start_time: e.target.value })} className="input" /></div>
              <div><label className="label">End time</label>
                <input type="time" value={shForm.end_time} onChange={(e) => setShForm({ ...shForm, end_time: e.target.value })} className="input" /></div>
              <div className="col-span-2"><label className="label">Assign to staff (optional)</label>
                <select value={shForm.staff_id || ''} onChange={(e) => setShForm({ ...shForm, staff_id: e.target.value ? parseInt(e.target.value, 10) : null })} className="input">
                  <option value="">— unassigned —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select></div>
            </div>
            <div>
              <label className="label">Days</label>
              <div className="flex gap-1 flex-wrap">
                {DAYS.map((d) => (
                  <button type="button" key={d} onClick={() => toggleDay(d)}
                    className={`px-3 py-1 rounded-full text-xs uppercase border ${
                      (shForm.days || []).includes(d) ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'
                    }`}>{d}</button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* PAYROLL MODAL */}
      <Modal open={!!payForm} onClose={() => setPayForm(null)} size="md"
        title={payForm ? `Payroll: ${payForm.staff_name}` : ''}
        footer={<>
          <button onClick={() => setPayForm(null)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={savePayroll} className="btn-primary">{t('common.save')}</button>
        </>}>
        {payForm && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Month</label>
                <input type="number" min="1" max="12" value={payForm.month} onChange={(e) => setPayForm({ ...payForm, month: parseInt(e.target.value, 10) })} className="input" /></div>
              <div><label className="label">Year</label>
                <input type="number" min="2020" max="2100" value={payForm.year} onChange={(e) => setPayForm({ ...payForm, year: parseInt(e.target.value, 10) })} className="input" /></div>
              <div><label className="label">Basic salary</label>
                <input type="number" min="0" value={payForm.basic_salary} onChange={(e) => setPayForm({ ...payForm, basic_salary: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">Allowances</label>
                <input type="number" min="0" value={payForm.allowances} onChange={(e) => setPayForm({ ...payForm, allowances: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">Deductions</label>
                <input type="number" min="0" value={payForm.deductions} onChange={(e) => setPayForm({ ...payForm, deductions: parseFloat(e.target.value || 0) })} className="input" /></div>
              <div><label className="label">Accommodation deduction</label>
                <input type="number" min="0" value={payForm.accommodation_deduction} onChange={(e) => setPayForm({ ...payForm, accommodation_deduction: parseFloat(e.target.value || 0) })} className="input" /></div>
            </div>
            <div className="bg-slate-50 rounded p-2 text-sm">
              Net: <b className="text-navy">{formatSAR((payForm.basic_salary || 0) + (payForm.allowances || 0) - (payForm.deductions || 0) - (payForm.accommodation_deduction || 0), i18n.language)}</b>
            </div>
            <div><label className="label">Notes</label>
              <textarea rows={2} value={payForm.notes || ''} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input" /></div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!sDel} onClose={() => setSDel(null)} onConfirm={removeStaff}
        title={t('staff.deleteTitle', 'Remove staff')}
        message={`${t('staff.deleteConfirm', 'Remove')} "${sDel?.full_name}"? ${t('staff.deleteNote', 'If they have attendance or payroll records they will be marked inactive instead.')}`}
        danger />
    </div>
  );
}
