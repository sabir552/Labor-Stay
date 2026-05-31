import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function BiometricOverview() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/biometric/logs').then(r => setLogs(r.data.logs || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Biometric Access Overview</h1>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[['Total Events', logs.length],['Check-ins', logs.filter(l=>l.action==='check_in').length],['Access Denied', logs.filter(l=>l.action==='access_denied').length]].map(([label,val])=>(
          <div key={label} className="bg-[#F0F4FA] rounded-lg p-4 border">
            <div className="text-2xl font-bold text-[#0B2545]">{val}</div>
            <div className="text-sm text-gray-500 mt-1">{label}</div>
          </div>
        ))}
      </div>
      {loading ? <Skeleton count={5} /> : logs.length === 0 ? (
        <EmptyState title="No biometric logs yet" description="Biometric access events will appear here once configured." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Worker','Camp','Action','Type','Confidence','Time'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.slice(0,50).map((l,i)=>(
                <tr key={l.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3">{l.worker_name||l.user_id}</td>
                  <td className="px-4 py-3">{l.camp_name||l.camp_id}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${l.action==='check_in'?'bg-green-100 text-green-700':l.action==='access_denied'?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'}`}>{l.action}</span>
                  </td>
                  <td className="px-4 py-3">{l.type||'fingerprint'}</td>
                  <td className="px-4 py-3">{l.confidence_score ? `${(l.confidence_score*100).toFixed(0)}%` : '—'}</td>
                  <td className="px-4 py-3">{l.verified_at ? new Date(l.verified_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
