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
    { label: t('admin.dashboard'), path: '/admin', icon: '📊' },
    { label: 'Analytics', path: '/admin/analytics', icon: '📈' },
    { label: t('admin.users'), path: '/admin/users', icon: '👥' },
    { label: t('admin.camps'), path: '/admin/camps', icon: '🏕️' },
    { label: t('admin.bookings'), path: '/admin/bookings', icon: '📅' },
    { label: 'Revenue', path: '/admin/revenue', icon: '💰' },
    { label: 'Finance', path: '/admin/finance', icon: '📑' },
    { label: 'VAT Report', path: '/admin/vat', icon: '🧾' },
    { label: 'Payouts', path: '/admin/payouts', icon: '💸' },
    { label: 'Corporate', path: '/admin/corporate', icon: '🏢' },
    { label: 'Companies', path: '/admin/companies', icon: '🏗️' },
    { label: 'Equipment', path: '/admin/equipment', icon: '🏗️' },
    { label: 'Services', path: '/admin/services', icon: '🛠️' },
    { label: 'Service Requests', path: '/admin/service-requests', icon: '📋' },
    { label: 'Featured', path: '/admin/featured', icon: '⭐' },
    { label: 'Disputes', path: '/admin/disputes', icon: '⚖️' },
    { label: 'Transport', path: '/admin/transport', icon: '🚌' },
    { label: 'Catering', path: '/admin/catering', icon: '🍽️' },
    { label: 'Utilities', path: '/admin/utilities', icon: '⚡' },
    { label: 'Staff', path: '/admin/staff', icon: '👷' },
    { label: 'Biometric', path: '/admin/biometric', icon: '🔐' },
    { label: 'CCTV', path: '/admin/cctv', icon: '📹' },
    { label: 'ERP', path: '/admin/erp', icon: '🔗' },
    { label: 'Expiry Alerts', path: '/admin/expiry-alerts', icon: '⚠️' },
    { label: 'Audit Logs', path: '/admin/audit-logs', icon: '📝' },
    { label: 'Security', path: '/admin/security', icon: '🔒' },
    { label: 'Announcements', path: '/admin/announcements', icon: '📢' },
    { label: 'Messages', path: '/admin/messages', icon: '💬' },
    { label: 'Notifications', path: '/admin/notifications', icon: '🔔' },
  ];

  return (
    <Routes>
      <Route element={<DashboardLayout title={t('admin.dashboard')} items={items} />}>
        <Route index                            element={<AdminHome />} />
        <Route path="analytics"                 element={<PlatformAnalytics />} />
        <Route path="users"                     element={<Users />} />
        <Route path="camps"                     element={<CampsVerification />} />
        <Route path="bookings"                  element={<AllBookings />} />
        <Route path="revenue"                   element={<Revenue />} />
        <Route path="finance"                   element={<FinancialReports />} />
        <Route path="vat"                       element={<VATReport />} />
        <Route path="payouts"                   element={<PayoutRequests />} />
        <Route path="corporate"                 element={<CorporateAccounts />} />
        <Route path="companies"                 element={<CompaniesManagement />} />
        <Route path="equipment"                 element={<EquipmentManagement />} />
        <Route path="services"                  element={<ServicesManagement />} />
        <Route path="service-requests"          element={<AllServiceRequests />} />
        <Route path="featured"                  element={<FeaturedListings />} />
        <Route path="disputes"                  element={<Disputes />} />
        <Route path="transport"                 element={<TransportOverview />} />
        <Route path="catering"                  element={<CateringReports />} />
        <Route path="utilities"                 element={<UtilityReports />} />
        <Route path="staff"                     element={<StaffOverview />} />
        <Route path="biometric"                 element={<BiometricOverview />} />
        <Route path="cctv"                      element={<CCTVManagement />} />
        <Route path="erp"                       element={<ERPSettings />} />
        <Route path="expiry-alerts"             element={<ExpiryAlerts />} />
        <Route path="audit-logs"                element={<AuditLogs />} />
        <Route path="security"                  element={<SecuritySettings />} />
        <Route path="announcements"             element={<Announcements />} />
        <Route path="notification-settings"     element={<NotificationSettings />} />
        <Route path="messages"                  element={<Messages />} />
        <Route path="messages/:conversationId"  element={<Messages />} />
        <Route path="notifications"             element={<Notifications />} />
        <Route path="*"                         element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
