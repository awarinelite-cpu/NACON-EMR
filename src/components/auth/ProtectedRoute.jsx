// src/components/auth/ProtectedRoute.jsx
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth();

  // Still initialising — show spinner, never redirect yet
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        height:'100vh', background:'var(--main-bg)' }}>
        <div style={{ textAlign:'center' }}>
          <i className="ti ti-loader-2" style={{ fontSize:36, color:'var(--accent)',
            display:'block', marginBottom:12, animation:'spin 1s linear infinite' }} />
          <div style={{ fontSize:13, fontWeight:700, color:'var(--t3)' }}>
            Loading NACON MRS EMR…
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Not logged in at all
  if (!user) return <Navigate to="/login" replace />;

  // Logged in but profile not yet loaded — wait, don't redirect
  if (!profile) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        height:'100vh', background:'var(--main-bg)' }}>
        <div style={{ textAlign:'center' }}>
          <i className="ti ti-loader-2" style={{ fontSize:36, color:'var(--accent)',
            display:'block', marginBottom:12, animation:'spin 1s linear infinite' }} />
          <div style={{ fontSize:13, fontWeight:700, color:'var(--t3)' }}>
            Loading your profile…
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Profile loaded — check role access
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    const dest = {
      doctor:   '/doctor',
      nurse:    '/nurse',
      records:  '/records',
      admin:    '/admin',
      subadmin: '/admin',
    }[profile.role] || '/login';
    return <Navigate to={dest} replace />;
  }

  return children;
}
