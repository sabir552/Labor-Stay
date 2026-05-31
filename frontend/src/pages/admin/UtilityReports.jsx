import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function UtilityReports() {
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');

  useEffect(() => {
    api.get('/utilities/readings/all').then(r => setReadings(r.data.readings || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = type ? readings.filter(r => r.utility_type === type) : readings;
  const total = filtered.reduce((s, r) => s + (r.total_cost || 0), 0);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Utility Reports</h1>
      <div className="flex gap-3 mb-6">
        {['','electricity','water','gas','diesel'].map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${type===t?'bg-[#0B2545] text-white border-[#0B2545]':'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
            {t||'All Types'}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-[#F0F4FA] rounded-lg p-4 border">
          <div className="text-2xl font-bold text-[#0B2545]">SAR {total.toLocaleString('en', {minimumFractionDigits:2})}</div>
          <div className="text-sm text-gray-500 mt-1">Total Utility Cost</div>
        </div>
        <div className="bg-[#F0F4FA] rounded-lg p-4 border">
          <div className="text-2xl font-bold text-[#0B2545]">{filtered.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Readings</div>
        </div>
      </div>
      {loading ? <Skeleton count={5} /> : filtered.length === 0 ? (
        <EmptyState title="No utility readings found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Camp','Type','Consumption','Unit','Rate','Total Cost (SAR)','Date'].map(h=>(
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r,i) => (
                <tr key={r.id||i} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3">{r.camp_name||r.camp_id}</td>
                  <td className="px-4 py-3 capitalize">{r.utility_type}</td>
                  <td className="px-4 py-3">{r.consumption}</td>
                  <td className="px-4 py-3">{r.unit}</td>
                  <td className="px-4 py-3">{r.rate_per_unit}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{r.total_cost?.toLocaleString()}</td>
                  <td className="px-4 py-3">{r.reading_date ? new Date(r.reading_date).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
