import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Spinner from '../common/Spinner';

export default function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <div className="text-5xl mb-3">🔒</div>
        <h2 className="text-xl font-semibold text-navy">Access denied</h2>
        <p className="text-slate-500 text-sm mt-2">This area requires {roles.join(' or ')} role.</p>
      </div>
    );
  }
  return children;
}
