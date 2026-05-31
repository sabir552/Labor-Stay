import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { get, put, del } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';
import { formatDateTime } from '../../utils/formatters';
import EmptyState from '../../components/common/EmptyState';

export default function Notifications() {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);

  const load = () => get('/notifications').then(setData).catch(() => setData({ notifications: [], unread_count: 0 }));
  useEffect(load, []);

  const markRead = (id) => put(`/notifications/${id}/read`, {}).then(load);
  const remove = (id) => del(`/notifications/${id}`).then(load);
  const markAll = async () => {
    await put('/notifications/read-all', {});
    toast.success('All marked as read');
    load();
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={t('nav.notifications')}
        subtitle={data ? `${data.unread_count} unread of ${data.notifications.length}` : ''}
        action={
          data && data.unread_count > 0
            ? <button onClick={markAll} className="btn-outline btn-sm">Mark all read</button>
            : null
        }
      />

      {data === null && <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>}

      {data && data.notifications.length === 0 && (
        <EmptyState icon="🔔" title="No notifications yet" body="You'll see updates here." />
      )}

      {data && data.notifications.length > 0 && (
        <div className="card divide-y divide-slate-100">
          {data.notifications.map((n) => (
            <div key={n.id} className={`p-4 flex items-start gap-3 ${n.is_read ? '' : 'bg-navy-50/30'}`}>
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.is_read ? 'bg-transparent border border-slate-300' : 'bg-gold'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  {n.link
                    ? <Link to={n.link} onClick={() => !n.is_read && markRead(n.id)} className="font-medium text-slate-800 hover:text-navy">{n.title}</Link>
                    : <div className="font-medium text-slate-800">{n.title}</div>}
                  <div className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTime(n.created_at)}</div>
                </div>
                {n.body && <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>}
                <div className="flex items-center gap-3 mt-2 text-xs">
                  {!n.is_read && <button onClick={() => markRead(n.id)} className="link">Mark read</button>}
                  <button onClick={() => remove(n.id)} className="text-slate-400 hover:text-rose-600">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
