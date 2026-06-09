// src/components/layout/Sidebar.jsx
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { searchPatients } from '../../lib/emr';

const NAV = {
  doctor: [
    { grp: 'Clinical', items: [
      { icon: 'ti-layout-dashboard', label: 'Dashboard',      path: '/doctor' },
      { icon: 'ti-urgent',           label: 'Triage',         path: '/triage' },
      { icon: 'ti-clock',            label: 'Today\'s Queue',  path: '/doctor/queue',     badge: 'queue' },
      { icon: 'ti-users',            label: 'My Patients',    path: '/doctor/patients' },
      { icon: 'ti-notes-medical',    label: 'Consultations',  path: '/doctor/consults' },
      { icon: 'ti-pill',             label: 'Prescriptions',  path: '/doctor/rx' },
      { icon: 'ti-file-export',      label: 'Referrals',      path: '/doctor/referrals' },
    ]},
  ],
  nurse: [
    { grp: 'Clinical', items: [
      { icon: 'ti-layout-dashboard', label: 'Dashboard',      path: '/nurse' },
      { icon: 'ti-urgent',           label: 'Triage',         path: '/triage',           badge: 'p1' },
      { icon: 'ti-clock',            label: 'Queue',          path: '/nurse/queue',      badge: 'queue' },
      { icon: 'ti-bed',              label: 'Sick Bay',       path: '/nurse/sickbay',    badge: 'sickbay' },
      { icon: 'ti-notes-medical',    label: 'Nursing Notes',  path: '/nurse/notes' },
      { icon: 'ti-pill',             label: 'Medication Log', path: '/nurse/meds' },
      { icon: 'ti-temperature',      label: 'Vital Signs',    path: '/nurse/vitals' },
      { icon: 'ti-users',            label: 'All Patients',   path: '/nurse/patients' },
    ]},
  ],
  records: [
    { grp: 'Records', items: [
      { icon: 'ti-layout-dashboard', label: 'Dashboard',      path: '/records' },
      { icon: 'ti-user-plus',        label: 'Register Patient', path: '/records/register' },
      { icon: 'ti-users',            label: 'All Patients',   path: '/records/patients' },
      { icon: 'ti-folder',           label: 'Case Folders',   path: '/records/folders' },
      { icon: 'ti-file-export',      label: 'Referral Letters', path: '/records/referrals' },
      { icon: 'ti-chart-bar',        label: 'Reports',        path: '/records/reports' },
    ]},
  ],
  admin: [
    { grp: 'Overview', items: [
      { icon: 'ti-layout-dashboard', label: 'Dashboard',      path: '/admin' },
      { icon: 'ti-users',            label: 'All Patients',   path: '/admin/patients' },
      { icon: 'ti-chart-bar',        label: 'Reports',        path: '/admin/reports' },
    ]},
    { grp: 'System', items: [
      { icon: 'ti-user-cog',         label: 'User Management', path: '/admin/users' },
      { icon: 'ti-shield-lock',      label: 'Roles & Access', path: '/admin/roles' },
      { icon: 'ti-database',         label: 'Audit Log',      path: '/admin/audit' },
      { icon: 'ti-settings',         label: 'Settings',       path: '/admin/settings' },
    ]},
  ],
  subadmin: [
    { grp: 'Overview', items: [
      { icon: 'ti-layout-dashboard', label: 'Dashboard',      path: '/admin' },
      { icon: 'ti-users',            label: 'All Patients',   path: '/admin/patients' },
      { icon: 'ti-chart-bar',        label: 'Reports',        path: '/admin/reports' },
      { icon: 'ti-user-cog',         label: 'Staff List',     path: '/admin/users' },
      { icon: 'ti-calendar',         label: 'Duty Schedule',  path: '/admin/schedule' },
    ]},
  ],
};

export default function Sidebar({ stats = {} }) {
  const { profile, logout, toggleTheme, theme } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const role   = profile?.role || 'nurse';
  const groups = NAV[role] || NAV.nurse;

  // Debounced search
  let searchTimer = null;
  const handleSearch = (val) => {
    setQuery(val);
    clearTimeout(searchTimer);
    if (!val.trim()) { setResults([]); return; }
    searchTimer = setTimeout(async () => {
      setSearching(true);
      const res = await searchPatients(val);
      setResults(res.slice(0, 6));
      setSearching(false);
    }, 300);
  };

  const openPatient = (emr) => {
    setQuery('');
    setResults([]);
    navigate(`/patient/${emr}`);
  };

  const getInitials = (p) => {
    const s = p.surname?.[0] || '';
    const f = p.firstName?.[0] || '';
    return (s + f).toUpperCase();
  };

  // Badge counts from stats
  const getBadge = (key) => {
    if (key === 'queue')   return stats.waiting  > 0 ? stats.waiting  : null;
    if (key === 'sickbay') return stats.sickBay  > 0 ? stats.sickBay  : null;
    return null;
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-icon"><i className="ti ti-heart-rate-monitor" aria-hidden="true" /></div>
        <div className="sb-brand-text">
          <div className="sb-name">NACON MRS</div>
          <div className="sb-loc">Yaba · Lagos</div>
        </div>
      </div>

      {/* Search — shown for doctor, nurse, records */}
      {['doctor','nurse','records'].includes(role) && (
        <div className="sb-search" style={{ position: 'relative' }}>
          <div className="sb-search-box">
            <i className={`ti ${searching ? 'ti-loader-2' : 'ti-search'}`}
              style={searching ? { animation: 'spin 1s linear infinite' } : {}}
              aria-hidden="true" />
            <input
              type="search"
              placeholder="EMR number, name, SET…"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              aria-label="Search patients"
            />
            {query && (
              <i className="ti ti-x" style={{ cursor:'pointer', fontSize:13 }}
                onClick={() => { setQuery(''); setResults([]); }} aria-label="Clear search" />
            )}
          </div>

          {/* Dropdown results */}
          {results.length > 0 && (
            <div style={{
              position:'absolute', top:'100%', left:12, right:12, zIndex:200,
              background:'var(--card-bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', boxShadow:'var(--shadow-md)',
              overflow:'hidden',
            }}>
              {results.map(p => (
                <div key={p.id} onClick={() => openPatient(p.emrNumber)}
                  style={{
                    display:'flex', alignItems:'center', gap:8,
                    padding:'8px 10px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                  }}
                  onMouseOver={e=>e.currentTarget.style.background='var(--card-bg2)'}
                  onMouseOut={e=>e.currentTarget.style.background=''}
                >
                  <div style={{
                    width:28,height:28,borderRadius:'50%',background:'var(--accent-bg)',
                    color:'var(--accent)',display:'flex',alignItems:'center',
                    justifyContent:'center',fontSize:10,fontWeight:700,flexShrink:0,
                  }}>{getInitials(p)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--t1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                      {p.surname} {p.firstName}
                    </div>
                    <div style={{fontSize:10,color:'var(--t3)',fontWeight:500}}>{p.classSet}</div>
                  </div>
                  <span className="emr-tag" style={{fontSize:9}}>{p.emrNumber}</span>
                </div>
              ))}
              <div style={{padding:'6px 10px',fontSize:10,color:'var(--t3)',fontWeight:500,textAlign:'center'}}>
                Click to open patient profile
              </div>
            </div>
          )}

          {query && results.length === 0 && !searching && (
            <div style={{
              position:'absolute', top:'100%', left:12, right:12, zIndex:200,
              background:'var(--card-bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'12px 10px',
              textAlign:'center', fontSize:11, color:'var(--t3)', fontWeight:500,
            }}>
              No patient found for "{query}"
            </div>
          )}
        </div>
      )}

      {/* Nav items */}
      <div className="sb-nav">
        {groups.map((grp, gi) => (
          <div key={gi} className="nav-group">
            <div className="nav-label">{grp.grp}</div>
            {grp.items.map((item, ii) => {
              const isActive = location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path) && item.path.length > 7);
              const badge = item.badge ? getBadge(item.badge) : null;
              return (
                <div key={ii}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  role="button" tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && navigate(item.path)}
                >
                  <i className={`ti ${item.icon}`} aria-hidden="true" />
                  <span>{item.label}</span>
                  {badge && (
                    <span className={`nav-badge ${badge > 0 ? 'nb-red' : 'nb-blue'}`}>
                      {badge}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="sb-footer">
        <div className="sb-user">
          <div className="sb-avatar">{(profile?.displayName || 'U').slice(0,2).toUpperCase()}</div>
          <div style={{flex:1, overflow:'hidden'}}>
            <div className="sb-uname" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {profile?.displayName || 'User'}
            </div>
            <div className="sb-urole" style={{textTransform:'capitalize'}}>{profile?.role}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <button onClick={toggleTheme} aria-label="Toggle theme"
              style={{background:'none',border:'none',cursor:'pointer',color:'var(--sb-text3)',fontSize:16,padding:2}}>
              <i className={`ti ${theme==='light'?'ti-moon':'ti-sun'}`} />
            </button>
            <button onClick={handleLogout} aria-label="Logout"
              style={{background:'none',border:'none',cursor:'pointer',color:'var(--sb-text3)',fontSize:16,padding:2}}>
              <i className="ti ti-logout" />
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </nav>
  );
}
