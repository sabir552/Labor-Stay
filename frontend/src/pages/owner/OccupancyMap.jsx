import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get } from '../../api/client';
import { SectionHeader } from '../../components/layout/DashboardLayout';

export default function OccupancyMap() {
  const { t } = useTranslation();
  const [camps, setCamps] = useState(null);
  const [selectedCamp, setSelectedCamp] = useState(null);
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    get('/camps/owner/my-camps').then((r) => {
      setCamps(r.camps || []);
      if (r.camps?.length) setSelectedCamp(r.camps[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedCamp) return;
    get(`/camps/${selectedCamp}`).then((r) => setRooms(r.rooms || []));
  }, [selectedCamp]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Occupancy map" subtitle="Visual bed allocation per room" />

      {camps === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}

      {camps && camps.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {camps.map((c) => (
              <button key={c.id} onClick={() => setSelectedCamp(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${selectedCamp === c.id ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}>
                {c.name} <span className="opacity-75 ms-1">{c.occupancy_pct}%</span>
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((r) => {
              const occupied = (r.capacity || 0) - (r.available_beds || 0);
              const beds = Array.from({ length: r.capacity || 0 });
              return (
                <div key={r.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-navy">{r.name}</h4>
                      <div className="text-[10px] text-slate-500 uppercase">{r.room_type?.replace('_', ' ')}</div>
                    </div>
                    <div className="text-end text-sm">
                      <div className="font-bold text-navy">{occupied}/{r.capacity}</div>
                      <div className="text-[10px] text-slate-500">occupied</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 mt-3">
                    {beds.map((_, i) => {
                      const isOcc = i < occupied;
                      return (
                        <div key={i}
                          className={`aspect-square rounded-md flex items-center justify-center text-base ${isOcc ? 'bg-rose-100 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}
                          title={isOcc ? 'Occupied' : 'Available'}>
                          🛏️
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex justify-between text-xs">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /> Occupied {occupied}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Free {r.available_beds}</span>
                  </div>
                </div>
              );
            })}
            {rooms.length === 0 && <div className="md:col-span-2 lg:col-span-3 text-center text-slate-500 py-10">No rooms for this camp.</div>}
          </div>
        </>
      )}
    </div>
  );
}
