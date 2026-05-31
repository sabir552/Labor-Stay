import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/formatters';

export default function NotificationBell() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = () => {
    if (!user) return;
    get('/notifications').then((r) => {
      setItems(r.notifications || []);
      setUnread(r.unread_count || 0);
    }).catch(() => {});
  };

  useEffect(() => {
    if (!user) { setItems([]); setUnread(0); return; }
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!user) return null;

  const markAll = async () => {
    await put('/notifications/read-all', {}).catch(() => {});
    load();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost relative !px-2"
        aria-label="notifications"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 ltr:-right-1 rtl:-left-1 bg-gold text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute mt-2 ltr:right-0 rtl:left-0 w-80 bg-white rounded-xl shadow-lift border border-slate-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h4 className="font-semibold text-navy">{t('nav.notifications')}</h4>
            {unread > 0 && (
              <button className="text-xs link" onClick={markAll}>Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">{t('common.noData')}</div>
            )}
            {items.map((n) => (
              <Link
                key={n.id}
                to={n.link || '#'}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${n.is_read ? '' : 'bg-navy-50/50'}`}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 w-2 h-2 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-gold'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 line-clamp-1">{n.title}</div>
                    {n.body && <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.body}</div>}
                    <div className="text-[10px] text-slate-400 mt-1">{formatDateTime(n.created_at)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
