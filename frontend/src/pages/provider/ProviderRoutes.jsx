import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/layout/DashboardLayout';

import ProviderHome from './ProviderHome';
import MyServices from './MyServices';
import IncomingRequests from './IncomingRequests';

import OwnerProfile from '../owner/OwnerProfile';
import Messages from '../worker/Messages';
import Notifications from '../worker/Notifications';
import NotificationSettings from '../common/NotificationSettings';

export default function ProviderRoutes() {
  const { t } = useTranslation();
  const items = [
    { to: '/provider',                icon: '🏠', label: t('nav.dashboard'),    end: true },
    { to: '/provider/services',       icon: '🛠️', label: 'My services' },
    { to: '/provider/requests',       icon: '📥', label: 'Incoming RFQs' },
    { to: '/provider/messages',       icon: '💬', label: t('nav.messages') },
    { to: '/provider/notifications',  icon: '🔔', label: t('nav.notifications') },
    { to: '/provider/notification-settings', icon: '⚙️', label: t('nav.notifPrefs', 'Notifications') },
    { to: '/provider/profile',        icon: '🚛', label: t('nav.profile') },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title="Provider" items={items} />}>
        <Route index                              element={<ProviderHome />} />
        <Route path="services"                    element={<MyServices />} />
        <Route path="requests"                    element={<IncomingRequests />} />
        <Route path="messages"                    element={<Messages />} />
        <Route path="messages/:conversationId"    element={<Messages />} />
        <Route path="notifications"               element={<Notifications />} />
        <Route path="notification-settings"       element={<NotificationSettings />} />
        <Route path="profile"                     element={<OwnerProfile />} />
        <Route path="*"                           element={<Navigate to="/provider" replace />} />
      </Route>
    </Routes>
  );
}
