import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/layout/DashboardLayout';
import OwnerHome from './OwnerHome';
import MyCamps from './MyCamps';
import CampForm from './CampForm';
import CampRooms from './CampRooms';
import { OwnerBookingsList, OwnerBookingDetail } from './OwnerBookings';
import OccupancyMap from './OccupancyMap';
import OccupancyCalendar from './OccupancyCalendar';
import Earnings from './Earnings';
import OwnerProfile from './OwnerProfile';
import CateringManagement from './CateringManagement';
import TransportManagement from './TransportManagement';
import RequestsManagement from './RequestsManagement';
import HousekeepingManagement from './HousekeepingManagement';
import VisitorManagement from './VisitorManagement';
import StaffManagement from './StaffManagement';
import ShiftScheduler from './ShiftScheduler';
import PayrollManagement from './PayrollManagement';
import UtilityTracking from './UtilityTracking';
import AccessControl from './AccessControl';
import CCTVManagement from './CCTVManagement';
import MaintenanceManagement from './MaintenanceManagement';
import DocumentsVault from './DocumentsVault';
import NotificationSettings from '../common/NotificationSettings';
import Messages from '../worker/Messages';
import Notifications from '../worker/Notifications';

export default function OwnerRoutes() {
  const { t } = useTranslation();

  const items = [
    { label: t('owner.dashboard'), path: '/owner', icon: '📊' },
    { label: t('owner.myCamps'), path: '/owner/camps', icon: '🏕️' },
    { label: t('owner.bookingRequests'), path: '/owner/bookings', icon: '📅' },
    { label: 'Occupancy Map', path: '/owner/occupancy', icon: '🗺️' },
    { label: 'Occupancy Calendar', path: '/owner/occupancy-calendar', icon: '📆' },
    { label: t('owner.earnings'), path: '/owner/earnings', icon: '💰' },
    { label: 'Catering', path: '/owner/catering', icon: '🍽️' },
    { label: 'Transport', path: '/owner/transport', icon: '🚌' },
    { label: 'Housekeeping', path: '/owner/housekeeping', icon: '🧹' },
    { label: 'Maintenance', path: '/owner/maintenance', icon: '🔧' },
    { label: 'Visitors', path: '/owner/visitors', icon: '👤' },
    { label: 'Staff', path: '/owner/staff', icon: '👷' },
    { label: 'Shifts', path: '/owner/shifts', icon: '⏰' },
    { label: 'Payroll', path: '/owner/payroll', icon: '💵' },
    { label: 'Utilities', path: '/owner/utilities', icon: '⚡' },
    { label: 'Access Control', path: '/owner/access', icon: '🔐' },
    { label: 'CCTV', path: '/owner/cctv', icon: '📹' },
    { label: 'Service Requests', path: '/owner/requests', icon: '📋' },
    { label: 'Documents', path: '/owner/documents', icon: '📁' },
    { label: 'Messages', path: '/owner/messages', icon: '💬' },
    { label: 'Notifications', path: '/owner/notifications', icon: '🔔' },
    { label: 'Profile', path: '/owner/profile', icon: '👤' },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title={t('owner.dashboard')} items={items} />}>
        <Route index                            element={<OwnerHome />} />
        <Route path="camps"                     element={<MyCamps />} />
        <Route path="camps/new"                 element={<CampForm />} />
        <Route path="camps/:id/edit"            element={<CampForm />} />
        <Route path="camps/:id/rooms"           element={<CampRooms />} />
        <Route path="bookings"                  element={<OwnerBookingsList />} />
        <Route path="bookings/:id"              element={<OwnerBookingDetail />} />
        <Route path="occupancy"                 element={<OccupancyMap />} />
        <Route path="occupancy-calendar"        element={<OccupancyCalendar />} />
        <Route path="earnings"                  element={<Earnings />} />
        <Route path="catering"                  element={<CateringManagement />} />
        <Route path="transport"                 element={<TransportManagement />} />
        <Route path="housekeeping"              element={<HousekeepingManagement />} />
        <Route path="maintenance"               element={<MaintenanceManagement />} />
        <Route path="visitors"                  element={<VisitorManagement />} />
        <Route path="staff"                     element={<StaffManagement />} />
        <Route path="shifts"                    element={<ShiftScheduler />} />
        <Route path="payroll"                   element={<PayrollManagement />} />
        <Route path="utilities"                 element={<UtilityTracking />} />
        <Route path="access"                    element={<AccessControl />} />
        <Route path="cctv"                      element={<CCTVManagement />} />
        <Route path="requests"                  element={<RequestsManagement />} />
        <Route path="documents"                 element={<DocumentsVault />} />
        <Route path="notification-settings"     element={<NotificationSettings />} />
        <Route path="messages"                  element={<Messages />} />
        <Route path="messages/:conversationId"  element={<Messages />} />
        <Route path="notifications"             element={<Notifications />} />
        <Route path="profile"                   element={<OwnerProfile />} />
        <Route path="*"                         element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
}
