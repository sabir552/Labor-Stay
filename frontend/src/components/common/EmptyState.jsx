import React from 'react';

export default function EmptyState({ title, body, icon = '📭', action }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="text-5xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-navy mb-1">{title}</h3>
      {body && <p className="text-slate-500 text-sm max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
