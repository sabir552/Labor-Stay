import React, { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((toast) => {
    const id = nextId++;
    const t = { id, type: 'info', duration: 4000, ...toast };
    setToasts((cur) => [...cur, t]);
    if (t.duration > 0) setTimeout(() => remove(id), t.duration);
    return id;
  }, [remove]);

  const api = {
    success: (msg, opts) => push({ type: 'success', message: msg, ...opts }),
    error:   (msg, opts) => push({ type: 'error', message: msg, ...opts }),
    info:    (msg, opts) => push({ type: 'info', message: msg, ...opts }),
    warn:    (msg, opts) => push({ type: 'warn', message: msg, ...opts }),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 ltr:right-4 rtl:left-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={
              'rounded-lg shadow-lift px-4 py-3 flex items-start gap-3 text-sm bg-white border-l-4 animate-[slideIn_.2s_ease] ' +
              (t.type === 'success' ? 'border-emerald-500'
                : t.type === 'error' ? 'border-rose-500'
                : t.type === 'warn'  ? 'border-amber-500'
                : 'border-navy')
            }
            role="alert"
          >
            <div className="flex-1 text-slate-800">{t.message}</div>
            <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
