// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './lib/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppShell from './components/layout/AppShell';

// Pages
import LoginPage        from './pages/LoginPage';
import DoctorDashboard  from './pages/DoctorDashboard';
import NurseDashboard   from './pages/NurseDashboard';
import RecordsDashboard from './pages/RecordsDashboard';
import AdminDashboard   from './pages/AdminDashboard';
import RegisterPatient  from './pages/RegisterPatient';
import PatientProfile   from './pages/PatientProfile';
import UserManagement   from './pages/UserManagement';

// Lazy patient list (shared across roles)
import AllPatients from './pages/AllPatients';

import './styles/global.css';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--font)',
              fontWeight: 700,
              fontSize: 13,
              background: 'var(--card-bg)',
              color: 'var(--t1)',
              border: '1px solid var(--border)',
            },
            success: { iconTheme: { primary: 'var(--success)', secondary: 'var(--success-bg)' } },
            error:   { iconTheme: { primary: 'var(--danger)',  secondary: 'var(--danger-bg)'  } },
          }}
        />

        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Protected — all authenticated users */}
          <Route element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>
            {/* Patient profile — all clinical roles */}
            <Route path="/patient/:emrNumber" element={
              <ProtectedRoute allowedRoles={['doctor','nurse','records','admin','subadmin']}>
                <PatientProfile />
              </ProtectedRoute>
            } />

            {/* Doctor routes */}
            <Route path="/doctor"           element={<ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>} />
            <Route path="/doctor/patients"  element={<ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" /></ProtectedRoute>} />
            <Route path="/doctor/queue"     element={<ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" filter="active" /></ProtectedRoute>} />

            {/* Nurse routes */}
            <Route path="/nurse"            element={<ProtectedRoute allowedRoles={['nurse']}><NurseDashboard /></ProtectedRoute>} />
            <Route path="/nurse/patients"   element={<ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" /></ProtectedRoute>} />
            <Route path="/nurse/queue"      element={<ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" filter="active" /></ProtectedRoute>} />
            <Route path="/nurse/sickbay"    element={<ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" filter="sickbay" /></ProtectedRoute>} />

            {/* Records routes */}
            <Route path="/records"          element={<ProtectedRoute allowedRoles={['records']}><RecordsDashboard /></ProtectedRoute>} />
            <Route path="/records/register" element={<ProtectedRoute allowedRoles={['records']}><RegisterPatient /></ProtectedRoute>} />
            <Route path="/records/patients" element={<ProtectedRoute allowedRoles={['records']}><AllPatients role="records" /></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin"            element={<ProtectedRoute allowedRoles={['admin','subadmin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users"      element={<ProtectedRoute allowedRoles={['admin']}><UserManagement /></ProtectedRoute>} />
            <Route path="/admin/patients"   element={<ProtectedRoute allowedRoles={['admin','subadmin']}><AllPatients role="admin" /></ProtectedRoute>} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
