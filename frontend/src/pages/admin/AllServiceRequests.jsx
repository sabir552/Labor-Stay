import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function AllServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.get(`/worker-requests${status ? `?status=${status}` : ''}`).then(r =>
      setRequests(r.data.requests || r.data || [])
    ).catch(() => {}).finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">All Service Requests</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['','pending','in_progress','resolved','rejected'].map(s=>(
          <button key={s} onClick={()=>setStatus(s)}
            className={`px-3 py-1.5 rounded text-sm font-semibold border ${status===s?'bg-[#0B2545] text-white':'bg-white text-gray-700 border-gray-200'}`}>
            {s||'All'}
          </button>
        ))}
      </div>
      {loading ? <Skeleton count={5} /> : requests.length === 0 ? (
        <EmptyState title="No service requests" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Worker','Camp','Type','Priority','Status','Date'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((r,i)=>(
                <tr key={r.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3">{r.worker_name||r.worker_id}</td>
                  <td className="px-4 py-3">{r.camp_name||r.camp_id}</td>
                  <td className="px-4 py-3 capitalize">{r.request_type?.replace(/_/g,' ')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${r.priority==='emergency'?'bg-red-100 text-red-700':r.priority==='high'?'bg-orange-100 text-orange-700':'bg-gray-100 text-gray-600'}`}>
                      {r.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${r.status==='resolved'?'bg-green-100 text-green-700':r.status==='pending'?'bg-yellow-100 text-yellow-700':'bg-blue-100 text-blue-700'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.created_at?new Date(r.created_at).toLocaleDateString():'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
