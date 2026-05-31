import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/layout/DashboardLayout';

import WorkerHome from './WorkerHome';
import MyBookings from './MyBookings';
import BookingDetail from './BookingDetail';
import WorkerProfile from './WorkerProfile';
import Messages from './Messages';
import Notifications from './Notifications';
import WaitingList from './WaitingList';
import MyEquipmentBookings from './MyEquipmentBookings';
import MyServiceRequests from './MyServiceRequests';
import MealPlan from './MealPlan';
import TransportBooking from './TransportBooking';
import ServiceRequests from './ServiceRequests';
import SurveyPage from './SurveyPage';
import NotificationSettings from '../common/NotificationSettings';
import LoyaltyAndReferrals from './LoyaltyAndReferrals';
import PriceAlerts from './PriceAlerts';
import BookingCalendar from './BookingCalendar';
import DocumentsWallet from './DocumentsWallet';

export default function WorkerRoutes() {
  const { t } = useTranslation();
  const items = [
    { to: '/worker',                       icon: '🏠', label: t('nav.dashboard'),    end: true },
    { to: '/worker/bookings',              icon: '📋', label: t('booking.myBookings') },
    { to: '/worker/equipment-bookings',    icon: '🚜', label: 'Equipment' },
    { to: '/worker/service-requests',      icon: '🛠️', label: 'Service RFQs' },
    { to: '/worker/meal-plan',             icon: '🍽️', label: t('nav.mealPlan', 'Meal plan') },
    { to: '/worker/transport',             icon: '🚌', label: t('nav.transport', 'Transport') },
    { to: '/worker/requests',              icon: '📋', label: t('nav.requests', 'Requests') },
    { to: '/worker/surveys',               icon: '📊', label: t('nav.surveys', 'Surveys') },
    { to: '/worker/loyalty',               icon: '🏆', label: t('nav.loyalty', 'Loyalty') },
    { to: '/worker/calendar',              icon: '📅', label: t('nav.calendar', 'Calendar') },
    { to: '/worker/documents', icon: '📁', label: 'Documents' },
    { to: '/worker/price-alerts',          icon: '🔔', label: t('nav.priceAlerts', 'Price alerts') },
    { to: '/worker/notification-settings', icon: '⚙️', label: t('nav.notifPrefs', 'Notifications') },
    { to: '/worker/waiting-list',          icon: '⏳', label: t('nav.waitingList') },
    { to: '/worker/messages',              icon: '💬', label: t('nav.messages') },
    { to: '/worker/notifications',         icon: '🔔', label: t('nav.notifications') },
    { to: '/worker/profile',               icon: '👤', label: t('nav.profile') },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title={t('nav.dashboard')} items={items} />}>
        <Route index                                element={<WorkerHome />} />
        <Route path="bookings"                      element={<MyBookings />} />
        <Route path="bookings/:id"                  element={<BookingDetail />} />
        <Route path="equipment-bookings"            element={<MyEquipmentBookings />} />
        <Route path="service-requests"              element={<MyServiceRequests />} />
        <Route path="meal-plan"                     element={<MealPlan />} />
        <Route path="transport"                     element={<TransportBooking />} />
        <Route path="requests"                      element={<ServiceRequests />} />
        <Route path="surveys"                       element={<SurveyPage />} />
        <Route path="loyalty"                       element={<LoyaltyAndReferrals />} />
        <Route path="calendar"                      element={<BookingCalendar />} />
        <Route path="documents"                      element={<DocumentsWallet />} />
        <Route path="price-alerts"                  element={<PriceAlerts />} />
        <Route path="notification-settings"         element={<NotificationSettings />} />
        <Route path="waiting-list"                  element={<WaitingList />} />
        <Route path="messages"                      element={<Messages />} />
        <Route path="messages/:conversationId"      element={<Messages />} />
        <Route path="notifications"                 element={<Notifications />} />
        <Route path="profile"                       element={<WorkerProfile />} />
        <Route path="*"                             element={<Navigate to="/worker" replace />} />
      </Route>
    </Routes>
  );
}
