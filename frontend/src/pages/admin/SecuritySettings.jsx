import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function SecuritySettings() {
  const [blocked, setBlocked] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/admin/security/blocked-ips').catch(() => ({ data: { blocked_ips: [] } })),
      api.get('/auth/sessions').catch(() => ({ data: { sessions: [] } })),
    ]).then(([b, s]) => {
      setBlocked(b.data.blocked_ips || []);
      setSessions(s.data.sessions || []);
    }).finally(() => setLoading(false));
  }, []);

  const unblock = async (ip) => {
    await api.delete(`/admin/security/blocked-ips/${ip}`).catch(() => {});
    setBlocked(prev => prev.filter(b => b.ip_address !== ip));
    setMsg(`IP ${ip} unblocked.`);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Security Settings</h1>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {loading ? <Skeleton count={4} /> : (
        <>
          <h2 className="text-lg font-semibold text-[#0B2545] mb-3">Blocked IPs ({blocked.length})</h2>
          {blocked.length === 0 ? (
            <div className="mb-6 p-4 bg-[#F0F4FA] rounded text-sm text-gray-500">No IPs currently blocked.</div>
          ) : (
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-red-600 text-white">
                    {['IP Address','Attempts','Blocked Until','Action'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {blocked.map((b,i)=>(
                    <tr key={b.ip_address||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                      <td className="px-4 py-3 font-mono">{b.ip_address}</td>
                      <td className="px-4 py-3">{b.attempts}</td>
                      <td className="px-4 py-3">{b.blocked_until?new Date(b.blocked_until).toLocaleString():'—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={()=>unblock(b.ip_address)} className="text-red-600 hover:underline text-xs font-semibold">Unblock</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="text-lg font-semibold text-[#0B2545] mb-3">Active Sessions ({sessions.length})</h2>
          {sessions.length === 0 ? (
            <div className="p-4 bg-[#F0F4FA] rounded text-sm text-gray-500">No active sessions.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#0B2545] text-white">
                    {['User','IP Address','Device','Last Used','Created'].map(h=>(
                      <th key={h} className="px-4 py-3 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s,i)=>(
                    <tr key={s.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                      <td className="px-4 py-3">{s.user_name||s.user_id}</td>
                      <td className="px-4 py-3 font-mono text-xs">{s.ip_address||'—'}</td>
                      <td className="px-4 py-3 text-xs">{s.device_info||'—'}</td>
                      <td className="px-4 py-3">{s.last_used_at?new Date(s.last_used_at).toLocaleString():'—'}</td>
                      <td className="px-4 py-3">{s.created_at?new Date(s.created_at).toLocaleDateString():'—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
