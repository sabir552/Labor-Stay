import React, { useState, useEffect } from 'react';
import api from '../../api/client';
import Skeleton from '../../components/common/Skeleton';

export default function OccupancyCalendar() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  useEffect(() => {
    api.get('/bookings/owner-bookings?limit=100').then(r => setBookings(r.data.bookings || r.data || []))
      .catch(()=>{}).finally(() => setLoading(false));
  }, []);

  const getDaysInMonth = (y, m) => new Date(y, m+1, 0).getDate();
  const days = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  const getBookingsForDay = (day) => {
    const d = new Date(year, month, day);
    return bookings.filter(b => {
      const start = new Date(b.start_date);
      const end = new Date(b.end_date);
      return d >= start && d <= end && (b.status === 'confirmed' || b.status === 'checked_in');
    });
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-[#0B2545] mb-6">Occupancy Calendar</h1>
      <div className="flex items-center justify-between mb-4">
        <button onClick={()=>{ if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }}
          className="px-3 py-2 bg-[#F0F4FA] rounded font-semibold">◀</button>
        <span className="text-lg font-bold text-[#0B2545]">{MONTHS[month]} {year}</span>
        <button onClick={()=>{ if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }}
          className="px-3 py-2 bg-[#F0F4FA] rounded font-semibold">▶</button>
      </div>
      {loading ? <Skeleton count={5}/> : (
        <div className="grid grid-cols-7 gap-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>(
            <div key={d} className="text-center text-xs font-bold text-gray-500 py-2">{d}</div>
          ))}
          {Array.from({length: firstDay}).map((_,i)=>(
            <div key={`e${i}`} className="h-14 rounded"/>
          ))}
          {Array.from({length: days}).map((_,i)=>{
            const day = i+1;
            const dayBookings = getBookingsForDay(day);
            const isToday = year===today.getFullYear() && month===today.getMonth() && day===today.getDate();
            return (
              <div key={day} className={`h-14 rounded-lg border p-1 ${isToday?'border-[#D4920A] bg-yellow-50':'border-gray-100 bg-white'} ${dayBookings.length>0?'bg-blue-50':''}`}>
                <div className={`text-xs font-bold mb-0.5 ${isToday?'text-[#D4920A]':'text-gray-700'}`}>{day}</div>
                {dayBookings.length>0 && (
                  <div className="text-xs bg-[#0B2545] text-white rounded px-1 truncate">{dayBookings.length} booking{dayBookings.length>1?'s':''}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
