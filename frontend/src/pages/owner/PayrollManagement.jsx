import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function PayrollManagement() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staff_id:'', camp_id:'', basic_salary:'', allowances:'', deductions:'', accommodation_deduction:'' });
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/payroll/records?month=${month}&year=${year}`).then(r =>
      setRecords(r.data.records || r.data || [])
    ).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [month, year]);

  const handleAdd = () => {
    const net = (+form.basic_salary + +form.allowances) - (+form.deductions + +form.accommodation_deduction);
    api.post('/payroll/records', { ...form, month, year, net_salary: net })
      .then(() => { setMsg('Payroll record saved!'); setShowForm(false); load(); })
      .catch(e => setMsg(e.response?.data?.message || 'Error'));
  };

  const total = records.reduce((s,r)=>s+(r.net_salary||0),0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#0B2545]">Payroll Management</h1>
        <button onClick={()=>setShowForm(s=>!s)} className="bg-[#D4920A] text-white px-4 py-2 rounded font-semibold text-sm">+ Add Record</button>
      </div>
      <div className="flex gap-3 mb-4">
        <select value={month} onChange={e=>setMonth(+e.target.value)} className="border rounded px-3 py-2 text-sm">
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>(
            <option key={i+1} value={i+1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={e=>setYear(+e.target.value)} className="border rounded px-3 py-2 text-sm">
          {[2024,2025,2026].map(y=><option key={y}>{y}</option>)}
        </select>
      </div>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {showForm && (
        <div className="mb-4 p-4 bg-[#F0F4FA] rounded border grid grid-cols-2 gap-3">
          {[['staff_id','Staff ID'],['camp_id','Camp ID'],['basic_salary','Basic Salary'],['allowances','Allowances'],['deductions','Deductions'],['accommodation_deduction','Accommodation Deduction']].map(([k,pl])=>(
            <input key={k} className="border rounded px-3 py-2 text-sm" placeholder={pl}
              value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} />
          ))}
          <button onClick={handleAdd} className="col-span-2 bg-[#0B2545] text-white py-2 rounded font-semibold">Save Payroll</button>
        </div>
      )}
      <div className="mb-4 p-3 bg-[#F0F4FA] rounded border flex justify-between">
        <span className="font-semibold text-[#0B2545]">Total Net Payroll</span>
        <span className="font-bold text-green-700">SAR {total.toLocaleString('en',{minimumFractionDigits:2})}</span>
      </div>
      {loading ? <Skeleton count={4}/> : records.length===0 ? <EmptyState title="No payroll records for this month" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Staff','Basic (SAR)','Allowances','Deductions','Acc. Deduction','Net (SAR)','Status'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r,i)=>(
                <tr key={r.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3">{r.staff_name||r.staff_id}</td>
                  <td className="px-4 py-3">{r.basic_salary?.toLocaleString()}</td>
                  <td className="px-4 py-3">{r.allowances?.toLocaleString()}</td>
                  <td className="px-4 py-3">{r.deductions?.toLocaleString()}</td>
                  <td className="px-4 py-3">{r.accommodation_deduction?.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-green-700">{r.net_salary?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${r.payment_status==='paid'?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{r.payment_status||'pending'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
