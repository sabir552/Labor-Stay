import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import RequireAuth from './components/layout/RequireAuth';

import Home from './pages/public/Home';
import SearchResults from './pages/public/SearchResults';
import CampDetail from './pages/public/CampDetail';
import EquipmentList from './pages/public/EquipmentList';
import EquipmentDetail from './pages/public/EquipmentDetail';
import ServicesList from './pages/public/ServicesList';
import ServiceDetail from './pages/public/ServiceDetail';
import ComparePage from './pages/public/ComparePage';
import ChatbotWidget from './components/common/ChatbotWidget';
import CompareBar from './components/camp/CompareBar';
import Login from './pages/public/Login';
import Register from './pages/public/Register';
import About from './pages/public/About';
import HowItWorks from './pages/public/HowItWorks';
import Contact from './pages/public/Contact';
import Legal, { TermsSections, PrivacySections } from './pages/public/Legal';
import Placeholder from './pages/public/Placeholder';

import WorkerRoutes   from './pages/worker/WorkerRoutes';
import OwnerRoutes    from './pages/owner/OwnerRoutes';
import AdminRoutes    from './pages/admin/AdminRoutes';
import ProviderRoutes from './pages/provider/ProviderRoutes';

import { useAuth } from './context/AuthContext';

function RoleHomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const home = user.role === 'admin' ? '/admin'
            : user.role === 'owner' ? '/owner'
            : user.role === 'provider' ? '/provider'
            : '/worker';
  return <Navigate to={home} replace />;
}

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          {/* Public */}
          <Route path="/"               element={<Home />} />
          <Route path="/search"         element={<SearchResults />} />
          <Route path="/camps/:id"      element={<CampDetail />} />
          <Route path="/equipment"      element={<EquipmentList />} />
          <Route path="/equipment/:id"  element={<EquipmentDetail />} />
          <Route path="/services"       element={<ServicesList />} />
          <Route path="/services/:id"   element={<ServiceDetail />} />
          <Route path="/compare"        element={<ComparePage />} />
          <Route path="/about"          element={<About />} />
          <Route path="/how-it-works"    element={<HowItWorks />} />
          <Route path="/contact"        element={<Contact />} />
          <Route path="/login"          element={<Login />} />
          <Route path="/register"       element={<Register />} />
          <Route path="/terms"          element={<Legal title="Terms of Service" sections={TermsSections} />} />
          <Route path="/privacy"        element={<Legal title="Privacy Policy (PDPL)" sections={PrivacySections} />} />

          {/* Global shortcuts */}
          <Route path="/profile"  element={<RequireAuth><RoleHomeRedirect /></RequireAuth>} />
          <Route path="/messages" element={<RequireAuth><RoleHomeRedirect /></RequireAuth>} />

          {/* Dashboards */}
          <Route path="/worker/*"   element={<RequireAuth roles={['worker']}><WorkerRoutes /></RequireAuth>} />
          <Route path="/owner/*"    element={<RequireAuth roles={['owner']}><OwnerRoutes /></RequireAuth>} />
          <Route path="/provider/*" element={<RequireAuth roles={['provider']}><ProviderRoutes /></RequireAuth>} />
          <Route path="/admin/*"    element={<RequireAuth roles={['admin']}><AdminRoutes /></RequireAuth>} />

          <Route path="*" element={<Placeholder title="404" subtitle="Page not found" icon="🧭" />} />
        </Routes>
      </main>
      <Footer />
      <ChatbotWidget />
      <CompareBar />
    </div>
  );
}
