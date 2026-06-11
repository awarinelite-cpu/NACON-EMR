// src/pages/RolesAccess.jsx
import React from 'react';

const ROLES = [
  {
    role: 'admin',
    badge: 'badge-danger',
    icon: 'ti-shield-lock',
    label: 'Administrator',
    description: 'Full system access. Can manage all users, view audit logs, change roles, and access all patient records.',
    permissions: [
      'Create, edit, deactivate and reactivate staff accounts',
      'Change any user\'s role',
      'View full audit log',
      'Access all patient records',
      'View all reports and statistics',
      'Configure system settings',
    ],
    cannot: [],
  },
  {
    role: 'subadmin',
    badge: 'badge-neutral',
    icon: 'ti-user-cog',
    label: 'Sub-Administrator',
    description: 'Read-only admin access. Can view patients, reports, and staff list but cannot manage users.',
    permissions: [
      'View all patient records',
      'View staff list (read-only)',
      'View reports and statistics',
      'View duty schedule',
    ],
    cannot: [
      'Create or modify staff accounts',
      'Change user roles',
      'View audit log',
      'Access system settings',
    ],
  },
  {
    role: 'doctor',
    badge: 'badge-ok',
    icon: 'ti-stethoscope',
    label: 'Doctor',
    description: 'Full clinical access. Can consult patients, prescribe, write notes, refer, and discharge.',
    permissions: [
      'View and search all patients',
      'Write doctor\'s consultation notes',
      'Issue prescriptions',
      'Record vitals',
      'Maintain fluid and glucose charts',
      'Upload lab results and scan reports',
      'Create referral letters',
      'Discharge patients',
    ],
    cannot: [
      'Register new patients (Records only)',
      'Manage staff accounts',
    ],
  },
  {
    role: 'nurse',
    badge: 'badge-info',
    icon: 'ti-heart-rate-monitor',
    label: 'Nurse',
    description: 'Clinical nursing access. Can record vitals, write nursing notes, and prescribe (flagged for countersign).',
    permissions: [
      'View and search all patients',
      'Record vital signs',
      'Write nursing notes',
      'Maintain fluid and glucose charts',
      'Upload results and reports',
      'Prescribe medications (requires doctor countersign)',
      'Manage sick bay patients',
    ],
    cannot: [
      'Write doctor\'s consultation notes',
      'Discharge patients independently',
      'Register new patients',
      'Manage staff accounts',
    ],
  },
  {
    role: 'records',
    badge: 'badge-warn',
    icon: 'ti-folder',
    label: 'Records Officer',
    description: 'Patient registration and records management. Cannot access clinical data.',
    permissions: [
      'Register new patients and generate EMR numbers',
      'View and search all patient folders',
      'Manage case folder numbers',
      'View referral letters',
      'Generate reports',
    ],
    cannot: [
      'Write clinical notes or prescriptions',
      'Record vitals',
      'Access fluid or glucose charts',
      'Discharge or refer patients',
      'Manage staff accounts',
    ],
  },
];

export default function RolesAccess() {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Roles &amp; Access</div>
      </div>

      <div className="page-content">
        <div className="alert alert-info" style={{ marginBottom:16 }}>
          <i className="ti ti-info-circle" />
          <div>
            Roles are assigned per user in <strong>User Management</strong>.
            This page documents what each role can and cannot do.
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {ROLES.map(r => (
            <div className="card" key={r.role}>
              <div className="card-header">
                <div className="card-title">
                  <i className={`ti ${r.icon}`} style={{ fontSize:18 }} />
                  <span className={`badge ${r.badge}`} style={{ fontSize:11, padding:'3px 10px' }}>
                    {r.role}
                  </span>
                  {r.label}
                </div>
              </div>
              <div className="card-body">
                <p style={{ marginBottom:14, fontSize:13 }}>{r.description}</p>
                <div style={{ display:'grid', gridTemplateColumns: r.cannot.length ? '1fr 1fr' : '1fr', gap:16 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--success)', textTransform:'uppercase',
                      letterSpacing:'.05em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                      <i className="ti ti-check" /> Can do
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      {r.permissions.map((p, i) => (
                        <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                          <i className="ti ti-circle-check" style={{ color:'var(--success)', fontSize:14, flexShrink:0, marginTop:1 }} />
                          <span style={{ fontSize:12, fontWeight:500, color:'var(--t2)' }}>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {r.cannot.length > 0 && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--danger)', textTransform:'uppercase',
                        letterSpacing:'.05em', marginBottom:8, display:'flex', alignItems:'center', gap:5 }}>
                        <i className="ti ti-x" /> Cannot do
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        {r.cannot.map((p, i) => (
                          <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                            <i className="ti ti-circle-x" style={{ color:'var(--danger)', fontSize:14, flexShrink:0, marginTop:1 }} />
                            <span style={{ fontSize:12, fontWeight:500, color:'var(--t3)' }}>{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
