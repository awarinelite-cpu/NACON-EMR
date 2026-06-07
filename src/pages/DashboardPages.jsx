// src/pages/DashboardPages.jsx
// ─────────────────────────────────────────────
// One file exports all 5 role dashboards and
// their page wrappers with AppShell + routing.
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import PatientProfile from '../components/patients/PatientProfile';
import RegisterPatient from '../components/records/RegisterPatient';
import { useAuth } from '../lib/AuthContext';
import { getTodayStats, listenPatients, formatDateTime } from '../lib/emr';

// ── SHARED PATIENT LIST ──────────────────────
function PatientList({ onOpen }) {
  const [patients, setPatients] = useState([]);
  const [q, setQ]               = useState('');

  useEffect(() => listenPatients(setPatients), []);

  const filtered = q
    ? patients.filter(p =>
        `${p.surname} ${p.firstName} ${p.otherNames} ${p.emrNumber} ${p.classSet} ${p.matricNo}`
          .toLowerCase().includes(q.toLowerCase()))
    : patients;

  const STATUS = {
    active:     { cls:'badge-danger', label:'In clinic' },
    waiting:    { cls:'badge-warn',   label:'Waiting'   },
    discharged: { cls:'badge-ok',     label:'Discharged'},
    referred:   { cls:'badge-info',   label:'Referred'  },
    sickbay:    { cls:'badge-danger', label:'Sick bay'  },
  };
  const COLORS = [
    { bg:'#B5D4F4',tc:'#0C447C' },{ bg:'#9FE1CB',tc:'#085041' },
    { bg:'#FAEEDA',tc:'#633806' },{ bg:'#F7C1C1',tc:'#791F1F' },
    { bg:'#CECBF6',tc:'#3C3489' },{ bg:'#C0DD97',tc:'#27500A' },
  ];
  const col = (emr) => COLORS[(emr?.charCodeAt(emr.length-1)||0) % COLORS.length];

  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <div className="sb-search-box" style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:'8px 12px' }}>
          <i className="ti ti-search" style={{ color:'var(--t3)', fontSize:16 }} />
          <input
            style={{ flex:1, border:'none', outline:'none', background:'transparent',
              fontSize:13, fontWeight:700, color:'var(--t1)', fontFamily:'var(--font)' }}
            placeholder="Search by EMR number, name, class/SET…"
            value={q} onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="card">
        {filtered.length === 0
          ? <div style={{ padding:24, textAlign:'center', fontSize:13, fontWeight:700, color:'var(--t3)' }}>
              {q ? 'No patients match your search' : 'No patients registered yet'}
            </div>
          : filtered.map(p => {
              const c   = col(p.emrNumber);
              const s   = STATUS[p.status] || STATUS.active;
              const ini = `${(p.surname||'')[0]||''}${(p.firstName||'')[0]||''}`.toUpperCase();
              return (
                <div className="patient-row" key={p.emrNumber} onClick={() => onOpen(p.emrNumber)}>
                  <div className="p-avatar" style={{ background:c.bg, color:c.tc }}>{ini}</div>
                  <div className="p-info">
                    <div className="p-name">{p.surname} {p.firstName} {p.otherNames}</div>
                    <div className="p-meta">{p.classSet} · {p.matricNo} · {p.folderNumber}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                    <span className="emr-tag">{p.emrNumber}</span>
                    <span className={`badge ${s.cls}`}>{s.label}</span>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ── SHARED STATS ─────────────────────────────
function StatsRow() {
  const [stats, setStats] = useState({ totalPatients:0, visitsToday:0, waiting:0, referred:0 });
  useEffect(() => { getTodayStats().then(setStats); }, []);
  const items = [
    { label:'Waiting',       value: stats.waiting,       icon:'ti-clock',        color:'var(--accent)' },
    { label:'Seen today',    value: stats.visitsToday,   icon:'ti-check',        color:'var(--success)' },
    { label:'Referred',      value: stats.referred,      icon:'ti-file-export',  color:'var(--warn)' },
    { label:'Total patients',value: stats.totalPatients, icon:'ti-users',        color:'var(--info)' },
  ];
  return (
    <div className="stats-grid">
      {items.map(s => (
        <div className="stat-card" key={s.label}>
          <div className="stat-label"><i className={`ti ${s.icon}`} style={{ color:s.color }} />{s.label}</div>
          <div className="stat-value">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════
   DOCTOR PAGES
═══════════════════════════════════ */
export function DoctorPages() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route index element={
        <AppShell title="Dashboard — Doctor"
          actions={<button className="btn btn-primary" onClick={() => navigate('/doctor/patients')}>
            <i className="ti ti-stethoscope" /> New consultation
          </button>}>
          <StatsRow />
          <PatientList onOpen={emr => navigate(`/doctor/patient/${emr}`)} />
        </AppShell>
      }/>
      <Route path="patients"  element={<AppShell title="My Patients"><PatientList onOpen={emr=>navigate(`/doctor/patient/${emr}`)}/></AppShell>}/>
      <Route path="queue"     element={<AppShell title="Today's Queue"><PatientList onOpen={emr=>navigate(`/doctor/patient/${emr}`)}/></AppShell>}/>
      <Route path="patient/:emr" element={
        <AppShell title="Patient Profile">
          <PatientProfile backPath="/doctor" />
        </AppShell>
      }/>
      <Route path="*" element={<AppShell title="Dashboard — Doctor"><StatsRow /><PatientList onOpen={emr=>navigate(`/doctor/patient/${emr}`)}/></AppShell>}/>
    </Routes>
  );
}

/* ═══════════════════════════════════
   NURSE PAGES
═══════════════════════════════════ */
export function NursePages() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route index element={
        <AppShell title="Dashboard — Nurse"
          actions={<button className="btn btn-primary" onClick={() => navigate('/nurse/patients')}>
            <i className="ti ti-notes-medical" /> Add nursing note
          </button>}>
          <StatsRow />
          <PatientList onOpen={emr => navigate(`/nurse/patient/${emr}`)} />
        </AppShell>
      }/>
      <Route path="patients"  element={<AppShell title="All Patients"><PatientList onOpen={emr=>navigate(`/nurse/patient/${emr}`)}/></AppShell>}/>
      <Route path="queue"     element={<AppShell title="Queue"><PatientList onOpen={emr=>navigate(`/nurse/patient/${emr}`)}/></AppShell>}/>
      <Route path="sickbay"   element={<AppShell title="Sick Bay"><PatientList onOpen={emr=>navigate(`/nurse/patient/${emr}`)}/></AppShell>}/>
      <Route path="patient/:emr" element={
        <AppShell title="Patient Profile">
          <PatientProfile backPath="/nurse" />
        </AppShell>
      }/>
      <Route path="*" element={<AppShell title="Dashboard — Nurse"><StatsRow /><PatientList onOpen={emr=>navigate(`/nurse/patient/${emr}`)}/></AppShell>}/>
    </Routes>
  );
}

/* ═══════════════════════════════════
   RECORDS PAGES
═══════════════════════════════════ */
export function RecordsPages() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route index element={
        <AppShell title="Dashboard — Records"
          actions={<button className="btn btn-primary" onClick={() => navigate('/records/register')}>
            <i className="ti ti-user-plus" /> Register patient
          </button>}>
          <StatsRow />
          <PatientList onOpen={emr => navigate(`/records/patient/${emr}`)} />
        </AppShell>
      }/>
      <Route path="register" element={
        <AppShell title="Register New Patient"
          actions={<button className="btn" onClick={() => navigate('/records')}>← Back</button>}>
          <RegisterPatient />
        </AppShell>
      }/>
      <Route path="patients"  element={<AppShell title="All Patients"><PatientList onOpen={emr=>navigate(`/records/patient/${emr}`)}/></AppShell>}/>
      <Route path="patient/:emr" element={
        <AppShell title="Patient Folder">
          <PatientProfile backPath="/records" />
        </AppShell>
      }/>
      <Route path="*" element={<AppShell title="Dashboard — Records"><StatsRow /><PatientList onOpen={emr=>navigate(`/records/patient/${emr}`)}/></AppShell>}/>
    </Routes>
  );
}

/* ═══════════════════════════════════
   ADMIN PAGES
═══════════════════════════════════ */
function UserManagement() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    import('../lib/emr').then(({ getAllUsers }) => getAllUsers().then(setUsers));
  }, []);

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-user-cog" />Staff accounts</div>
          <button className="btn btn-primary btn-sm">
            <i className="ti ti-user-plus" /> Add user
          </button>
        </div>
        {users.length === 0
          ? <div style={{ padding:24, textAlign:'center', fontSize:13, fontWeight:700, color:'var(--t3)' }}>
              No users yet — add staff via Firebase Auth + set role in Firestore
            </div>
          : users.map(u => (
              <div className="patient-row" key={u.uid}>
                <div className="p-avatar" style={{ background:'#B5D4F4', color:'#0C447C' }}>
                  {(u.displayName||u.email||'?')[0].toUpperCase()}
                </div>
                <div className="p-info">
                  <div className="p-name">{u.displayName || u.email}</div>
                  <div className="p-meta">{u.email} · Registered {formatDateTime(u.createdAt)}</div>
                </div>
                <span className="badge badge-info" style={{ textTransform:'capitalize' }}>{u.role}</span>
                <span className={`badge ${u.active ? 'badge-ok' : 'badge-danger'}`} style={{ marginLeft:4 }}>
                  {u.active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

export function AdminPages() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route index element={
        <AppShell title="Dashboard — Admin"
          actions={<button className="btn" onClick={() => navigate('/admin/users')}>
            <i className="ti ti-user-cog" /> Manage users
          </button>}>
          <StatsRow />
          <PatientList onOpen={emr => navigate(`/admin/patient/${emr}`)} />
        </AppShell>
      }/>
      <Route path="users"    element={<AppShell title="User Management"><UserManagement /></AppShell>}/>
      <Route path="patients" element={<AppShell title="All Patients"><PatientList onOpen={emr=>navigate(`/admin/patient/${emr}`)}/></AppShell>}/>
      <Route path="patient/:emr" element={<AppShell title="Patient Folder"><PatientProfile backPath="/admin" /></AppShell>}/>
      <Route path="*" element={<AppShell title="Dashboard — Admin"><StatsRow /></AppShell>}/>
    </Routes>
  );
}

/* ═══════════════════════════════════
   SUB-ADMIN PAGES
═══════════════════════════════════ */
export function SubAdminPages() {
  const navigate = useNavigate();
  return (
    <Routes>
      <Route index element={
        <AppShell title="Dashboard — Sub-Admin">
          <StatsRow />
          <PatientList onOpen={emr => navigate(`/subadmin/patient/${emr}`)} />
        </AppShell>
      }/>
      <Route path="patients" element={<AppShell title="All Patients"><PatientList onOpen={emr=>navigate(`/subadmin/patient/${emr}`)}/></AppShell>}/>
      <Route path="patient/:emr" element={<AppShell title="Patient Folder"><PatientProfile backPath="/subadmin" /></AppShell>}/>
      <Route path="*" element={<AppShell title="Dashboard — Sub-Admin"><StatsRow /></AppShell>}/>
    </Routes>
  );
}
