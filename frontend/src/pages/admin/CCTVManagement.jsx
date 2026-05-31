import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

export default function CCTVManagement() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campId, setCampId] = useState('');

  const load = () => {
    setLoading(true);
    const url = campId ? `/cctv/cameras/${campId}` : '/cctv/cameras/all';
    api.get(url).then(r => setCameras(r.data.cameras || r.data || []))
      .catch(() => setCameras([])).finally(() => setLoading(false));
  };
  useEffect(load, [campId]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">CCTV Management</h1>
      <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
        CCTV integration requires external system configuration. Set CCTV_API_URL and CCTV_API_KEY in environment variables.
      </div>
      {loading ? <Skeleton count={3} /> : cameras.length === 0 ? (
        <EmptyState title="No cameras registered" description="Register CCTV cameras from the camp owner dashboard or via API." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map(cam => (
            <div key={cam.id} className="bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-[#0B2545]">{cam.camera_name}</h3>
                <span className={`px-2 py-1 rounded text-xs font-bold ${cam.is_active?'bg-green-100 text-green-700':'bg-red-100 text-red-700'}`}>
                  {cam.is_active?'Live':'Offline'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-1">📍 {cam.location_description}</p>
              <p className="text-sm text-gray-500 mb-3">🏕️ Camp #{cam.camp_id}</p>
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
