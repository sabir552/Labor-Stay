import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function StaffOverview() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/staff').then(r => setStaff(r.data.staff || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const expiringSoon = staff.filter(s => {
    if (!s.iqama_expiry) return false;
    const days = (new Date(s.iqama_expiry) - new Date()) / (1000*60*60*24);
    return days <= 30;
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Staff Overview</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[['Total Staff', staff.length, 'bg-blue-500'],['Active', staff.filter(s=>s.is_active).length, 'bg-green-500'],['Iqama Expiring Soon', expiringSoon.length, 'bg-red-500']].map(([l,v,c])=>(
          <div key={l} className="bg-white border rounded-lg p-4 shadow-sm">
            <div className={`w-8 h-8 ${c} rounded mb-2`}/>
            <div className="text-2xl font-bold text-[#0B2545]">{v}</div>
            <div className="text-sm text-gray-500">{l}</div>
          </div>
        ))}
      </div>
      {loading ? <Skeleton count={5} /> : staff.length === 0 ? (
        <EmptyState title="No staff records found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Name','Role','Camp','Nationality','Iqama Expiry','Status'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((s,i)=>(
                <tr key={s.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3 font-medium">{s.full_name}</td>
                  <td className="px-4 py-3 capitalize">{s.role}</td>
                  <td className="px-4 py-3">{s.camp_name||s.camp_id}</td>
                  <td className="px-4 py-3">{s.nationality||'—'}</td>
                  <td className={`px-4 py-3 ${expiringSoon.includes(s)?'text-red-600 font-bold':''}`}>
                    {s.iqama_expiry?new Date(s.iqama_expiry).toLocaleDateString():'—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${s.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                      {s.is_active?'Active':'Inactive'}
                    </span>
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
