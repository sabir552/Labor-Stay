import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../../components/layout/DashboardLayout';
import AdminHome from './AdminHome';
import Users from './Users';
import CampsVerification from './CampsVerification';
import AllBookings from './AllBookings';
import Revenue from './Revenue';
import FeaturedListings from './FeaturedListings';
import Disputes from './Disputes';
import AuditLogs from './AuditLogs';
import Announcements from './Announcements';
import CateringReports from './CateringReports';
import TransportOverview from './TransportOverview';
import ExpiryAlerts from './ExpiryAlerts';
import CorporateAccounts from './CorporateAccounts';
import FinancialReports from './FinancialReports';
import PayoutRequests from './PayoutRequests';
import ERPSettings from './ERPSettings';
import EquipmentManagement from './EquipmentManagement';
import ServicesManagement from './ServicesManagement';
import CompaniesManagement from './CompaniesManagement';
import BiometricOverview from './BiometricOverview';
import CCTVManagement from './CCTVManagement';
import UtilityReports from './UtilityReports';
import PlatformAnalytics from './PlatformAnalytics';
import SecuritySettings from './SecuritySettings';
import StaffOverview from './StaffOverview';
import VATReport from './VATReport';
import AllServiceRequests from './AllServiceRequests';
import NotificationSettings from '../common/NotificationSettings';
import Messages from '../worker/Messages';
import Notifications from '../worker/Notifications';

export default function AdminRoutes() {
  const { t } = useTranslation();

  const items = [
    { to: '/admin', label: 'Dashboard', icon: '📊', end: true },
    { to: '/admin/analytics', label: 'Analytics', icon: '📈' },
    { to: '/admin/users', label: 'Users', icon: '👥' },
    { to: '/admin/camps', label: 'Camps', icon: '🏕️' },
    { to: '/admin/bookings', label: 'Bookings', icon: '📅' },
    { to: '/admin/revenue', label: 'Revenue', icon: '💰' },
    { to: '/admin/finance', label: 'Finance', icon: '📑' },
    { to: '/admin/vat', label: 'VAT Report', icon: '🧾' },
    { to: '/admin/payouts', label: 'Payouts', icon: '💸' },
    { to: '/admin/corporate', label: 'Corporate', icon: '🏢' },
    { to: '/admin/companies', label: 'Companies', icon: '🏗️' },
    { to: '/admin/equipment', label: 'Equipment', icon: '⚙️' },
    { to: '/admin/services', label: 'Services', icon: '🛠️' },
    { to: '/admin/service-requests', label: 'Service Requests', icon: '📋' },
    { to: '/admin/featured', label: 'Featured', icon: '⭐' },
    { to: '/admin/disputes', label: 'Disputes', icon: '⚖️' },
    { to: '/admin/transport', label: 'Transport', icon: '🚌' },
    { to: '/admin/catering', label: 'Catering', icon: '🍽️' },
    { to: '/admin/utilities', label: 'Utilities', icon: '⚡' },
    { to: '/admin/staff', label: 'Staff', icon: '👷' },
    { to: '/admin/biometric', label: 'Biometric', icon: '🔐' },
    { to: '/admin/cctv', label: 'CCTV', icon: '📹' },
    { to: '/admin/erp', label: 'ERP', icon: '🔗' },
    { to: '/admin/expiry-alerts', label: 'Expiry Alerts', icon: '⚠️' },
    { to: '/admin/audit-logs', label: 'Audit Logs', icon: '📝' },
    { to: '/admin/security', label: 'Security', icon: '🔒' },
    { to: '/admin/announcements', label: 'Announcements', icon: '📢' },
    { to: '/admin/messages', label: 'Messages', icon: '💬' },
    { to: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title="Admin Dashboard" items={items} />}>
        <Route index element={<AdminHome />} />
        <Route path="analytics" element={<PlatformAnalytics />} />
        <Route path="users" element={<Users />} />
        <Route path="camps" element={<CampsVerification />} />
        <Route path="bookings" element={<AllBookings />} />
        <Route path="revenue" element={<Revenue />} />
        <Route path="finance" element={<FinancialReports />} />
        <Route path="vat" element={<VATReport />} />
        <Route path="payouts" element={<PayoutRequests />} />
        <Route path="corporate" element={<CorporateAccounts />} />
        <Route path="companies" element={<CompaniesManagement />} />
        <Route path="equipment" element={<EquipmentManagement />} />
        <Route path="services" element={<ServicesManagement />} />
        <Route path="service-requests" element={<AllServiceRequests />} />
        <Route path="featured" element={<FeaturedListings />} />
        <Route path="disputes" element={<Disputes />} />
        <Route path="transport" element={<TransportOverview />} />
        <Route path="catering" element={<CateringReports />} />
        <Route path="utilities" element={<UtilityReports />} />
        <Route path="staff" element={<StaffOverview />} />
        <Route path="biometric" element={<BiometricOverview />} />
        <Route path="cctv" element={<CCTVManagement />} />
        <Route path="erp" element={<ERPSettings />} />
        <Route path="expiry-alerts" element={<ExpiryAlerts />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="security" element={<SecuritySettings />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="notification-settings" element={<NotificationSettings />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:conversationId" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
