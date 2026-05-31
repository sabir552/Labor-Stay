import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function AccessControl() {
  const [cards, setCards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cards');

  useEffect(() => {
    Promise.all([
      api.get('/access/cards').catch(() => ({ data: [] })),
      api.get('/access/logs').catch(() => ({ data: [] })),
    ]).then(([c, l]) => {
      setCards(c.data.cards || c.data || []);
      setLogs(l.data.logs || l.data || []);
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Access Control</h1>
      <div className="flex gap-2 mb-6">
        {['cards','logs'].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm capitalize ${tab===t?'bg-[#0B2545] text-white':'bg-[#F0F4FA] text-gray-700'}`}>
            {t==='cards'?'Access Cards':'Entry/Exit Logs'}
          </button>
        ))}
      </div>
      {loading ? <Skeleton count={5}/> : tab==='cards' ? (
        cards.length===0 ? <EmptyState title="No access cards issued" description="Cards are auto-issued on booking confirmation." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  {['Worker','Card Number','Status','Issued','Expires'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cards.map((c,i)=>(
                  <tr key={c.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                    <td className="px-4 py-3">{c.worker_name||c.user_id}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.card_number}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${c.status==='active'?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3">{c.issued_at?new Date(c.issued_at).toLocaleDateString():'—'}</td>
                    <td className="px-4 py-3">{c.expires_at?new Date(c.expires_at).toLocaleDateString():'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        logs.length===0 ? <EmptyState title="No access logs yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0B2545] text-white">
                  {['Worker','Action','Gate','Time'].map(h=>(
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l,i)=>(
                  <tr key={l.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                    <td className="px-4 py-3">{l.worker_name||l.user_id}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${l.action==='entry'?'bg-green-100 text-green-700':l.action==='exit'?'bg-blue-100 text-blue-700':'bg-red-100 text-red-700'}`}>{l.action}</span>
                    </td>
                    <td className="px-4 py-3">{l.gate_name||'—'}</td>
                    <td className="px-4 py-3">{l.timestamp?new Date(l.timestamp).toLocaleString():'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
