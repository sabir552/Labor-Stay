import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';

export default function PlatformAnalytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard').then(r => setStats(r.data))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6"><Skeleton count={6} /></div>;

  const cards = [
    { label: 'Total Bookings', value: stats?.total_bookings || 0, color: 'bg-blue-500' },
    { label: 'Total Revenue (SAR)', value: (stats?.total_revenue || 0).toLocaleString(), color: 'bg-green-500' },
    { label: 'Total Users', value: stats?.total_users || 0, color: 'bg-purple-500' },
    { label: 'Active Camps', value: stats?.total_camps || 0, color: 'bg-[#D4920A]' },
    { label: 'Commission Earned (SAR)', value: (stats?.total_commission || 0).toLocaleString(), color: 'bg-teal-500' },
    { label: 'Pending Verifications', value: stats?.pending_camps || 0, color: 'bg-red-500' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Platform Analytics</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-lg border shadow-sm p-5">
            <div className={`w-10 h-10 ${card.color} rounded-lg mb-3`} />
            <div className="text-2xl font-bold text-[#0B2545]">{card.value}</div>
            <div className="text-sm text-gray-500 mt-1">{card.label}</div>
          </div>
        ))}
      </div>
      {stats?.recent_bookings?.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-[#0B2545] mb-4">Recent Bookings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  {['Booking ID','Worker','Camp','Amount (SAR)','Status','Date'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recent_bookings.slice(0,10).map((b,i)=>(
                  <tr key={b.id} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                    <td className="px-4 py-3 font-mono text-xs">{b.id}</td>
                    <td className="px-4 py-3">{b.worker_name||'—'}</td>
                    <td className="px-4 py-3">{b.camp_name||'—'}</td>
                    <td className="px-4 py-3 font-semibold">{b.total_amount?.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        b.status==='confirmed'?'bg-green-100 text-green-700':
                        b.status==='pending'?'bg-yellow-100 text-yellow-700':
                        b.status==='cancelled'?'bg-red-100 text-red-700':'bg-blue-100 text-blue-700'
                      }`}>{b.status}</span>
                    </td>
                    <td className="px-4 py-3">{b.created_at?new Date(b.created_at).toLocaleDateString():'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
