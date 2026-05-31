import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * B2 — Display new room dimensions / details fields when available.
 * Gracefully renders nothing if no v2 data is present (back-compat).
 */
export default function RoomDetailsBlock({ room }) {
  const { t } = useTranslation();
  if (!room) return null;

  const hasDims = room.length_m || room.width_m || room.height_m || room.num_windows;
  const hasFeatures =
    room.floor_type || room.has_attached_bathroom != null ||
    room.num_bathrooms || room.ac_type || room.internet_type;

  if (!hasDims && !hasFeatures) return null;

  const Pill = ({ icon, label, value }) => (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 rounded text-xs">
      <span>{icon}</span>
      <span className="text-slate-500">{label}:</span>
      <span className="text-slate-800 font-medium">{value}</span>
    </div>
  );

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <h5 className="text-xs font-semibold text-navy uppercase tracking-wider mb-2">
        {t('room.details', 'Room details')}
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {room.length_m && room.width_m && (
          <Pill icon="📐" label={t('room.size', 'Size')}
            value={`${room.length_m}m × ${room.width_m}m${room.height_m ? ` × ${room.height_m}m` : ''}`} />
        )}
        {room.num_windows != null && (
          <Pill icon="🪟" label={t('room.windows', 'Windows')} value={room.num_windows} />
        )}
        {room.floor_type && (
          <Pill icon="🟫" label={t('room.floor', 'Floor')} value={room.floor_type} />
        )}
        {room.has_attached_bathroom ? (
          <Pill icon="🚿" label={t('room.bathroom', 'Bathroom')}
            value={`${t('room.attached', 'Attached')}${room.num_bathrooms > 1 ? ` × ${room.num_bathrooms}` : ''}`} />
        ) : (room.num_bathrooms ? (
          <Pill icon="🚿" label={t('room.bathroom', 'Bathroom')} value={`${t('room.shared', 'Shared')} × ${room.num_bathrooms}`} />
        ) : null)}
        {room.ac_type && room.ac_type !== 'none' && (
          <Pill icon="❄️" label={t('room.ac', 'AC')} value={room.ac_type} />
        )}
        {room.internet_type && room.internet_type !== 'none' && (
          <Pill icon="📶" label={t('room.internet', 'Internet')}
            value={`${room.internet_type}${room.internet_speed ? ` (${room.internet_speed})` : ''}`} />
        )}
      </div>
    </div>
  );
}
