import React from 'react';

// Inline SVG logo so it renders in sandboxed previews too.
export default function Logo({ size = 36, withText = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#1A3C5E" />
        <path d="M8 28L20 10L32 28H26L20 19L14 28H8Z" fill="#E8A020" />
        <rect x="18" y="24" width="4" height="4" fill="#FFFFFF" />
      </svg>
      {withText && (
        <span className="font-extrabold text-navy text-xl tracking-tight">
          Labor<span className="text-gold">Stay</span>
        </span>
      )}
    </div>
  );
}
