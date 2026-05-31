import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatSAR } from '../../utils/formatters';
import { safeImage } from '../../utils/helpers';
import RoomDetailsBlock from './RoomDetailsBlock';

export default function RoomCard({ room, onSelect, selected }) {
  const { t, i18n } = useTranslation();
  return (
    <div className={`card flex flex-col sm:flex-row overflow-hidden border-2 transition ${selected ? 'border-gold' : 'border-transparent'}`}>
      <div className="sm:w-48 h-32 sm:h-auto bg-slate-100 shrink-0">
        <img src={safeImage(room.photos?.[0])} alt={room.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 p-4 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-navy">{room.name}</h4>
            <div className="text-xs text-slate-500 capitalize mt-0.5">{room.room_type?.replace('_', ' ')} · {room.capacity} {t('common.occupants').toLowerCase()}</div>
          </div>
          <div className="text-end">
            <div className="text-lg font-bold text-navy">{formatSAR(room.price_per_day, i18n.language)}</div>
            <div className="text-[10px] text-slate-500 uppercase">{t('common.perDay')}</div>
          </div>
        </div>
        <p className="text-sm text-slate-600 mt-1 line-clamp-2">{room.description}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {(room.amenities || []).slice(0, 5).map((a) => <span key={a} className="chip">{a}</span>)}
        </div>
        <RoomDetailsBlock room={room} />
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className={`text-xs font-medium ${room.available_beds > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {room.available_beds > 0
              ? `${room.available_beds} ${t('common.available').toLowerCase()}`
              : t('common.unavailable')}
          </span>
          <button onClick={() => onSelect?.(room)} className={`${selected ? 'btn-gold' : 'btn-primary'} btn-sm`}>
            {selected ? '✓ ' + t('common.confirm') : t('common.bookNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
