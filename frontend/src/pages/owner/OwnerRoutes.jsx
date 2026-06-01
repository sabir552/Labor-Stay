import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
  const items = [
    { to: '/owner', label: 'Dashboard', icon: '📊', end: true },
    { to: '/owner/camps', label: 'My Camps', icon: '🏕️' },
    { to: '/owner/bookings', label: 'Bookings', icon: '📅' },
    { to: '/owner/occupancy', label: 'Occupancy Map', icon: '🗺️' },
    { to: '/owner/occupancy-calendar', label: 'Occupancy Calendar', icon: '📆' },
    { to: '/owner/earnings', label: 'Earnings', icon: '💰' },
    { to: '/owner/catering', label: 'Catering', icon: '🍽️' },
    { to: '/owner/transport', label: 'Transport', icon: '🚌' },
    { to: '/owner/housekeeping', label: 'Housekeeping', icon: '🧹' },
    { to: '/owner/maintenance', label: 'Maintenance', icon: '🔧' },
    { to: '/owner/visitors', label: 'Visitors', icon: '👤' },
    { to: '/owner/staff', label: 'Staff', icon: '👷' },
    { to: '/owner/shifts', label: 'Shifts', icon: '⏰' },
    { to: '/owner/payroll', label: 'Payroll', icon: '💵' },
    { to: '/owner/utilities', label: 'Utilities', icon: '⚡' },
    { to: '/owner/access', label: 'Access Control', icon: '🔐' },
    { to: '/owner/cctv', label: 'CCTV', icon: '📹' },
    { to: '/owner/requests', label: 'Service Requests', icon: '📋' },
    { to: '/owner/documents', label: 'Documents', icon: '📁' },
    { to: '/owner/messages', label: 'Messages', icon: '💬' },
    { to: '/owner/notifications', label: 'Notifications', icon: '🔔' },
    { to: '/owner/profile', label: 'Profile', icon: '👤' },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title="Owner Dashboard" items={items} />}>
        <Route index element={<OwnerHome />} />
        <Route path="camps" element={<MyCamps />} />
        <Route path="camps/new" element={<CampForm />} />
        <Route path="camps/:id/edit" element={<CampForm />} />
        <Route path="camps/:id/rooms" element={<CampRooms />} />
        <Route path="bookings" element={<OwnerBookingsList />} />
        <Route path="bookings/:id" element={<OwnerBookingDetail />} />
        <Route path="occupancy" element={<OccupancyMap />} />
        <Route path="occupancy-calendar" element={<OccupancyCalendar />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="catering" element={<CateringManagement />} />
        <Route path="transport" element={<TransportManagement />} />
        <Route path="housekeeping" element={<HousekeepingManagement />} />
        <Route path="maintenance" element={<MaintenanceManagement />} />
        <Route path="visitors" element={<VisitorManagement />} />
        <Route path="staff" element={<StaffManagement />} />
        <Route path="shifts" element={<ShiftScheduler />} />
        <Route path="payroll" element={<PayrollManagement />} />
        <Route path="utilities" element={<UtilityTracking />} />
        <Route path="access" element={<AccessControl />} />
        <Route path="cctv" element={<CCTVManagement />} />
        <Route path="requests" element={<RequestsManagement />} />
        <Route path="documents" element={<DocumentsVault />} />
        <Route path="notification-settings" element={<NotificationSettings />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:conversationId" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<OwnerProfile />} />
        <Route path="*" element={<Navigate to="/owner" replace />} />
      </Route>
    </Routes>
  );
}
