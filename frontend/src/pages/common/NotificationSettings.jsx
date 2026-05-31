import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { get, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { SectionHeader } from '../../components/layout/DashboardLayout';

const CHANNEL_ICONS = { in_app: '🔔', email: '📧', sms: '📱', whatsapp: '💬' };

const CATEGORY_LABEL = {
  booking: 'Booking updates',
  payment: 'Payments & receipts',
  promotion: 'Promotions & offers',
  reminder: 'Reminders',
  survey: 'Surveys',
  system: 'System / security',
};

export default function NotificationSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    get('/notifications/preferences').then(setData).catch(() => setData({ preferences: [], categories: [], channels: [] }));
  }, []);

  const toggle = (cat, ch) => {
    if (!data) return;
    const next = data.preferences.map((p) => {
      if (p.category === cat && p.channel === ch) return { ...p, is_enabled: !p.is_enabled };
      return p;
    });
    setData({ ...data, preferences: next });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await put('/notifications/preferences', { preferences: data.preferences });
      toast.success(t('notifPrefs.saved', 'Notification preferences saved'));
      setDirty(false);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  if (!data) return <div className="card p-8 text-center text-slate-500">{t('common.loading')}</div>;

  // Group by category
  const byCategory = {};
  for (const p of data.preferences) {
    if (!byCategory[p.category]) byCategory[p.category] = {};
    byCategory[p.category][p.channel] = p.is_enabled;
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <SectionHeader title={t('notifPrefs.title', 'Notification preferences')}
        subtitle={t('notifPrefs.subtitle', 'Choose how you receive each kind of update')}
        action={dirty && (
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        )} />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="text-start px-4 py-3">{t('notifPrefs.category', 'Category')}</th>
              {(data.channels || []).map((ch) => (
                <th key={ch} className="text-center px-4 py-3">
                  {CHANNEL_ICONS[ch] || ''} {ch.replace('_', ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data.categories || []).map((cat) => (
              <tr key={cat} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-navy">
                  {t(`notifPrefs.cat.${cat}`, CATEGORY_LABEL[cat] || cat)}
                </td>
                {(data.channels || []).map((ch) => (
                  <td key={ch} className="px-4 py-3 text-center">
                    <button onClick={() => toggle(cat, ch)}
                      className={`w-11 h-6 rounded-full relative transition ${
                        byCategory[cat]?.[ch] ? 'bg-navy' : 'bg-slate-300'
                      }`}>
                      <span className={`absolute top-0.5 ${byCategory[cat]?.[ch] ? 'ltr:right-0.5 rtl:left-0.5' : 'ltr:left-0.5 rtl:right-0.5'} w-5 h-5 bg-white rounded-full transition`} />
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        📌 {t('notifPrefs.note', 'Important booking and security notifications cannot be fully disabled — your account always receives critical alerts via at least one channel.')}
      </p>

      {dirty && (
        <div className="fixed bottom-4 ltr:right-4 rtl:left-4 bg-navy text-white rounded-lg shadow-lift px-4 py-3 flex items-center gap-3">
          <span className="text-sm">{t('notifPrefs.unsaved', 'Unsaved changes')}</span>
          <button onClick={save} disabled={saving} className="btn-gold btn-sm">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}
