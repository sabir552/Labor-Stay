import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function EquipmentManagement() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/equipment/search?limit=50').then(r => {
      setItems(r.data.equipment || r.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(e =>
    e.name?.toLowerCase().includes(search.toLowerCase()) ||
    e.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Equipment Management</h1>
      <input
        className="mb-4 w-full max-w-sm border rounded px-3 py-2 text-sm"
        placeholder="Search equipment..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {loading ? <Skeleton count={5} /> : filtered.length === 0 ? (
        <EmptyState title="No equipment found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Name','Category','City','Daily Rate (SAR)','Status','Owner'].map(h => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={e.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3">{e.category}</td>
                  <td className="px-4 py-3">{e.city}</td>
                  <td className="px-4 py-3">{e.daily_rate?.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      e.status === 'available' ? 'bg-green-100 text-green-700' :
                      e.status === 'rented' ? 'bg-blue-100 text-blue-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3">{e.owner_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
