import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function ShiftScheduler() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ camp_id:'', staff_id:'', shift_name:'', start_time:'08:00', end_time:'17:00', days:[] });
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get('/staff/shifts').then(r => setShifts(r.data.shifts || r.data || []))
      .catch(()=>{}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const toggleDay = (day) => {
    setForm(p => ({ ...p, days: p.days.includes(day) ? p.days.filter(d=>d!==day) : [...p.days, day] }));
  };

  const handleAdd = () => {
    api.post('/staff/shifts', form).then(() => { setMsg('Shift created!'); setShowForm(false); load(); })
      .catch(e => setMsg(e.response?.data?.message || 'Error'));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#0B2545]">Shift Scheduler</h1>
        <button onClick={()=>setShowForm(s=>!s)} className="bg-[#D4920A] text-white px-4 py-2 rounded font-semibold text-sm">+ Create Shift</button>
      </div>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {showForm && (
        <div className="mb-6 p-4 bg-[#F0F4FA] rounded border">
          <div className="grid grid-cols-2 gap-3 mb-3">
            {[['camp_id','Camp ID'],['staff_id','Staff ID (optional)'],['shift_name','Shift Name']].map(([k,pl])=>(
              <input key={k} className="border rounded px-3 py-2 text-sm" placeholder={pl}
                value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} />
            ))}
            <input type="time" className="border rounded px-3 py-2 text-sm" value={form.start_time}
              onChange={e=>setForm(p=>({...p,start_time:e.target.value}))} />
            <input type="time" className="border rounded px-3 py-2 text-sm" value={form.end_time}
              onChange={e=>setForm(p=>({...p,end_time:e.target.value}))} />
          </div>
          <div className="flex gap-2 flex-wrap mb-3">
            {DAYS.map(d=>(
              <button key={d} onClick={()=>toggleDay(d)}
                className={`px-3 py-1.5 rounded text-xs font-semibold ${form.days.includes(d)?'bg-[#0B2545] text-white':'bg-white border text-gray-700'}`}>
                {d.slice(0,3)}
              </button>
            ))}
          </div>
          <button onClick={handleAdd} className="bg-[#0B2545] text-white px-5 py-2 rounded font-semibold">Save Shift</button>
        </div>
      )}
      {loading ? <Skeleton count={4}/> : shifts.length===0 ? <EmptyState title="No shifts created yet" /> : (
        <div className="space-y-3">
          {shifts.map((s,i)=>(
            <div key={s.id||i} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-[#0B2545]">{s.shift_name}</h3>
                  <p className="text-sm text-gray-500">{s.start_time} – {s.end_time} • Camp #{s.camp_id}</p>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {(s.days||[]).map(d=>(
                    <span key={d} className="px-2 py-1 bg-[#F0F4FA] text-[#0B2545] rounded text-xs font-semibold">{d.slice(0,3)}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
