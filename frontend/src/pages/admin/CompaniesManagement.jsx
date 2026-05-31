import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function CompaniesManagement() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:'', cr_number:'', email:'', phone:'', city:'' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    api.get('/companies').then(r => setCompanies(r.data.companies || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSubmit = () => {
    setSaving(true);
    api.post('/companies', form).then(() => { setMsg('Company added!'); setShowForm(false); load(); })
      .catch(e => setMsg(e.response?.data?.message || 'Error')).finally(() => setSaving(false));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#0B2545]">Companies Management</h1>
        <button onClick={() => setShowForm(s => !s)}
          className="bg-[#D4920A] text-white px-4 py-2 rounded font-semibold">
          + Add Company
        </button>
      </div>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-300 text-green-700 rounded">{msg}</div>}
      {showForm && (
        <div className="mb-6 p-4 bg-[#F0F4FA] rounded border">
          <div className="grid grid-cols-2 gap-3">
            {['name','cr_number','email','phone','city'].map(field => (
              <input key={field} className="border rounded px-3 py-2 text-sm"
                placeholder={field.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
                value={form[field]} onChange={e => setForm(p => ({...p,[field]:e.target.value}))} />
            ))}
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="mt-3 bg-[#0B2545] text-white px-5 py-2 rounded font-semibold">
            {saving ? 'Saving...' : 'Save Company'}
          </button>
        </div>
      )}
      {loading ? <Skeleton count={4} /> : companies.length === 0 ? (
        <EmptyState title="No companies yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#0B2545] text-white">
                {['Company Name','CR Number','City','Email','Phone','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map((c,i) => (
                <tr key={c.id} className={i%2===0?'bg-white':'bg-[#F0F4FA]'}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.cr_number}</td>
                  <td className="px-4 py-3">{c.city}</td>
                  <td className="px-4 py-3">{c.email}</td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${c.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                      {c.is_active?'Active':'Inactive'}
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
