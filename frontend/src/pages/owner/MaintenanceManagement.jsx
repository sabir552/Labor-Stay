import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function MaintenanceManagement() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const load = () => {
    setLoading(true);
    api.get(`/maintenance${filter ? `?status=${filter}` : ''}`).then(r =>
      setRequests(r.data.requests || r.data || [])
    ).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [filter]);

  const updateStatus = async (id, status) => {
    await api.put(`/maintenance/${id}`, { status }).catch(() => {});
    load();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Maintenance Management</h1>
      <div className="flex gap-2 mb-4 flex-wrap">
        {['','pending','assigned','in_progress','resolved'].map(s=>(
          <button key={s} onClick={()=>setFilter(s)}
            className={`px-3 py-1.5 rounded text-sm font-semibold border ${filter===s?'bg-[#0B2545] text-white':'bg-white text-gray-700 border-gray-200'}`}>
            {s||'All'}
          </button>
        ))}
      </div>
      {loading ? <Skeleton count={5}/> : requests.length===0 ? <EmptyState title="No maintenance requests" /> : (
        <div className="space-y-3">
          {requests.map(r=>(
            <div key={r.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-semibold text-[#0B2545]">{r.title}</h3>
                  <p className="text-sm text-gray-500">Room #{r.room_id} • {r.camp_name||'Camp'}</p>
                </div>
                <div className="flex gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${r.priority==='emergency'?'bg-red-100 text-red-700':r.priority==='high'?'bg-orange-100 text-orange-700':'bg-gray-100 text-gray-600'}`}>{r.priority}</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${r.status==='resolved'?'bg-green-100 text-green-700':r.status==='in_progress'?'bg-blue-100 text-blue-700':'bg-yellow-100 text-yellow-700'}`}>{r.status}</span>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-3">{r.description}</p>
              <div className="flex gap-2">
                {r.status==='pending' && <button onClick={()=>updateStatus(r.id,'in_progress')} className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-semibold">Start</button>}
                {r.status==='in_progress' && <button onClick={()=>updateStatus(r.id,'resolved')} className="px-3 py-1 bg-green-600 text-white rounded text-xs font-semibold">Mark Resolved</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
