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
import AllPatients      from './pages/AllPatients';
import AuditLog         from './pages/AuditLog';
import RolesAccess      from './pages/RolesAccess';
import Settings         from './pages/Settings';
import TriagePage       from './pages/TriagePage';
import MARPage          from './pages/MARPage';
import PharmacyInventory from './pages/PharmacyInventory';
import HealthStats        from './pages/HealthStats';
import SelfReport         from './pages/SelfReport';
import NursingNotesPage        from './pages/NursingNotesPage';
import MedicationLogPage       from './pages/MedicationLogPage';
import VitalSignsPage          from './pages/VitalSignsPage';
import SickReportPage          from './pages/SickReportPage';
import SeenTodayPage           from './pages/SeenTodayPage';
import DischargedReferredPage  from './pages/DischargedReferredPage';
import OnAdmissionPage         from './pages/OnAdmissionPage';
import PharmacyDashboard       from './pages/PharmacyDashboard';
import LabDashboard            from './pages/LabDashboard';

import './styles/global.css';

// ── Placeholder pages for routes not yet built ──
function ComingSoon({ title }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">{title}</div>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:12, color:'var(--t3)' }}>
        <i className="ti ti-tools" style={{ fontSize:40 }} />
        <div style={{ fontSize:16, fontWeight:700, color:'var(--t2)' }}>{title}</div>
        <div style={{ fontSize:12, fontWeight:500 }}>This section is coming soon.</div>
      </div>
    </div>
  );
}

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
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/"             element={<Navigate to="/login" replace />} />
          <Route path="/report-sick"  element={<SelfReport />} />

          {/* ── PROTECTED SHELL ── */}
          <Route element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }>

            {/* Patient profile — all roles */}
            <Route path="/patient/:emrNumber" element={
              <ProtectedRoute allowedRoles={['doctor','nurse','records','admin','subadmin','pharmacist','lab']}>
                <PatientProfile />
              </ProtectedRoute>
            } />

            {/* ── DOCTOR ── */}
            <Route path="/doctor" element={
              <ProtectedRoute allowedRoles={['doctor']}><DoctorDashboard /></ProtectedRoute>
            } />
            <Route path="/doctor/patients" element={
              <ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" /></ProtectedRoute>
            } />
            <Route path="/doctor/queue" element={
              <ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" filter="active" /></ProtectedRoute>
            } />
            <Route path="/doctor/consults" element={
              <ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" /></ProtectedRoute>
            } />
            <Route path="/doctor/rx" element={
              <ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" /></ProtectedRoute>
            } />
            <Route path="/doctor/referrals" element={
              <ProtectedRoute allowedRoles={['doctor']}><AllPatients role="doctor" /></ProtectedRoute>
            } />

            {/* ── NURSE ── */}
            <Route path="/nurse" element={
              <ProtectedRoute allowedRoles={['nurse']}><NurseDashboard /></ProtectedRoute>
            } />
            <Route path="/nurse/patients" element={
              <ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" /></ProtectedRoute>
            } />
            <Route path="/nurse/queue" element={
              <ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" filter="active" /></ProtectedRoute>
            } />
            <Route path="/nurse/sickbay" element={
              <ProtectedRoute allowedRoles={['nurse']}><AllPatients role="nurse" filter="sickbay" /></ProtectedRoute>
            } />
            <Route path="/nurse/notes" element={
              <ProtectedRoute allowedRoles={['nurse']}><NursingNotesPage /></ProtectedRoute>
            } />
            <Route path="/nurse/meds" element={
              <ProtectedRoute allowedRoles={['nurse']}><MedicationLogPage /></ProtectedRoute>
            } />
            <Route path="/nurse/vitals" element={
              <ProtectedRoute allowedRoles={['nurse']}><VitalSignsPage /></ProtectedRoute>
            } />
            <Route path="/nurse/sick-report" element={
              <ProtectedRoute allowedRoles={['nurse']}><SickReportPage /></ProtectedRoute>
            } />
            <Route path="/nurse/seen-today" element={
              <ProtectedRoute allowedRoles={['nurse']}><SeenTodayPage /></ProtectedRoute>
            } />
            <Route path="/nurse/on-admission" element={
              <ProtectedRoute allowedRoles={['nurse']}><OnAdmissionPage /></ProtectedRoute>
            } />
            <Route path="/nurse/discharged-referred" element={
              <ProtectedRoute allowedRoles={['nurse']}><DischargedReferredPage /></ProtectedRoute>
            } />

            {/* ── MAR ── */}
            <Route path="/mar" element={
              <ProtectedRoute allowedRoles={['nurse','doctor','admin','subadmin']}>
                <MARPage />
              </ProtectedRoute>
            } />

            {/* ── TRIAGE ── */}
            <Route path="/triage" element={
              <ProtectedRoute allowedRoles={['nurse','doctor','admin','subadmin']}>
                <TriagePage />
              </ProtectedRoute>
            } />

            {/* ── RECORDS ── */}
            <Route path="/records" element={
              <ProtectedRoute allowedRoles={['records']}><RecordsDashboard /></ProtectedRoute>
            } />
            <Route path="/records/register" element={
              <ProtectedRoute allowedRoles={['records']}><RegisterPatient /></ProtectedRoute>
            } />
            <Route path="/records/edit/:emrNumber" element={
              <ProtectedRoute allowedRoles={['records']}><RegisterPatient /></ProtectedRoute>
            } />
            <Route path="/records/patients" element={
              <ProtectedRoute allowedRoles={['records']}><AllPatients role="records" /></ProtectedRoute>
            } />
            <Route path="/records/folders" element={
              <ProtectedRoute allowedRoles={['records']}><AllPatients role="records" /></ProtectedRoute>
            } />
            <Route path="/records/referrals" element={
              <ProtectedRoute allowedRoles={['records']}><AllPatients role="records" /></ProtectedRoute>
            } />
            <Route path="/records/reports" element={
              <ProtectedRoute allowedRoles={['records']}><ComingSoon title="Reports" /></ProtectedRoute>
            } />

            {/* ── ADMIN ── */}
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin','subadmin']}><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <ProtectedRoute allowedRoles={['admin']}><UserManagement /></ProtectedRoute>
            } />
            <Route path="/admin/patients" element={
              <ProtectedRoute allowedRoles={['admin','subadmin']}><AllPatients role="admin" /></ProtectedRoute>
            } />
            <Route path="/admin/reports" element={
              <ProtectedRoute allowedRoles={['admin','subadmin']}><ComingSoon title="Reports" /></ProtectedRoute>
            } />
            <Route path="/admin/roles" element={
              <ProtectedRoute allowedRoles={['admin']}><RolesAccess /></ProtectedRoute>
            } />
            <Route path="/admin/audit" element={
              <ProtectedRoute allowedRoles={['admin', 'subadmin']}><AuditLog /></ProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>
            } />
            <Route path="/admin/schedule" element={
              <ProtectedRoute allowedRoles={['admin','subadmin']}><ComingSoon title="Duty Schedule" /></ProtectedRoute>
            } />
            <Route path="/admin/stats" element={
              <ProtectedRoute allowedRoles={['admin','subadmin']}><HealthStats /></ProtectedRoute>
            } />
            <Route path="/pharmacy" element={
              <ProtectedRoute allowedRoles={['admin','subadmin','nurse','doctor','pharmacist']}><PharmacyInventory /></ProtectedRoute>
            } />

            {/* ── PHARMACY DASHBOARD ── */}
            <Route path="/pharmacist" element={
              <ProtectedRoute allowedRoles={['pharmacist','admin','subadmin']}><PharmacyDashboard /></ProtectedRoute>
            } />
            <Route path="/pharmacist/queue" element={
              <ProtectedRoute allowedRoles={['pharmacist','admin','subadmin']}><PharmacyDashboard /></ProtectedRoute>
            } />

            {/* ── LABORATORY DASHBOARD ── */}
            <Route path="/lab" element={
              <ProtectedRoute allowedRoles={['lab','doctor','nurse','admin','subadmin']}><LabDashboard /></ProtectedRoute>
            } />
            <Route path="/lab/requests" element={
              <ProtectedRoute allowedRoles={['lab','doctor','nurse','admin','subadmin']}><LabDashboard /></ProtectedRoute>
            } />

          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
