import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function OwnerCCTVManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campId, setCampId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ camp_id:'', camera_name:'', location_description:'', stream_url:'', camera_type:'ip' });
  const [msg, setMsg] = useState('');

  const load = (id) => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    api.get(`/cctv/cameras/${id}`).then(r => setCameras(r.data.cameras || r.data || []))
      .catch(() => {}).finally(() => setLoading(false));
  };

  const handleAdd = () => {
    api.post('/cctv/cameras', form).then(() => { setMsg('Camera added!'); setShowForm(false); load(form.camp_id); })
      .catch(e => setMsg(e.response?.data?.message || 'Error'));
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#0B2545]">CCTV Management</h1>
        <button onClick={() => setShowForm(s=>!s)} className="bg-[#D4920A] text-white px-4 py-2 rounded font-semibold text-sm">+ Add Camera</button>
      </div>
      <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
        Requires CCTV system integration. Configure CCTV_API_URL in server environment.
      </div>
      {msg && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{msg}</div>}
      {showForm && (
        <div className="mb-4 p-4 bg-[#F0F4FA] rounded border grid grid-cols-2 gap-3">
          {Object.keys(form).map(k => (
            <input key={k} className="border rounded px-3 py-2 text-sm" placeholder={k.replace(/_/g,' ')}
              value={form[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))} />
          ))}
          <button onClick={handleAdd} className="col-span-2 bg-[#0B2545] text-white py-2 rounded font-semibold">Save Camera</button>
        </div>
      )}
      {cameras.length === 0 ? <EmptyState title="No cameras registered" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cameras.map(cam=>(
            <div key={cam.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-[#0B2545]">{cam.camera_name}</h3>
                <span className={`px-2 py-1 rounded text-xs font-bold ${cam.is_active?'bg-green-100 text-green-700':'bg-gray-100 text-gray-500'}`}>{cam.is_active?'Live':'Offline'}</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">📍 {cam.location_description}</p>
              {cam.stream_url && (
                <a href={cam.stream_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center bg-[#0B2545] text-white py-2 rounded text-sm font-semibold">
                  View Stream
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
