import React from 'react';

export default function StarRating({ value = 0, size = 14, showNumber = true, className = '' }) {
  const full = Math.round(value);
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="text-gold" style={{ fontSize: size }}>
        {'★★★★★'.slice(0, full)}<span className="text-slate-300">{'★★★★★'.slice(full)}</span>
      </span>
      {showNumber && <span className="text-xs text-slate-600">{Number(value || 0).toFixed(1)}</span>}
    </span>
  );
}
