// src/pages/RecordsDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, getTodayStats } from '../lib/emr';

export default function RecordsDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients, setPatients] = useState([]);
  const [stats,    setStats]    = useState({});

  useEffect(() => {
    getTodayStats().then(setStats);
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls   = s => s==='active'?'badge-danger':s==='discharged'?'badge-ok':s==='referred'?'badge-warn':'badge-info';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Records · {profile?.displayName}</div>
        <PatientSearch placeholder="Search before registering — check for duplicates…" />
        <button className="btn btn-primary" onClick={() => navigate('/records/register')}>
          <i className="ti ti-user-plus" /> Register patient
        </button>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          {[
            { label:'Total registered', value:stats.totalPatients||0, icon:'ti-users',     color:'var(--accent)'  },
            { label:'Visits today',     value:stats.visitsToday||0,   icon:'ti-stethoscope',color:'var(--success)' },
            { label:'Open folders',     value:stats.waiting||0,       icon:'ti-folder',    color:'var(--warn)'    },
            { label:'Referrals',        value:stats.referred||0,      icon:'ti-file-export',color:'var(--info)'   },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-folder" />All case folders</div>
            <span className="card-action" onClick={() => navigate('/records/patients')}>View all →</span>
          </div>
          {patients.slice(0,12).map(p => (
            <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)}>
              <div className="p-avatar" style={{background:'var(--accent-bg)',color:'var(--accent)'}}>{getInitials(p)}</div>
              <div className="p-info">
                <div className="p-name">{p.surname} {p.firstName} {p.otherNames}</div>
                <div className="p-meta">{p.classSet} · {p.folderNumber} · {p.matricNo}</div>
              </div>
              <span className="emr-tag">{p.emrNumber}</span>
              <span className={`badge ${statusCls(p.status)}`}>{p.status}</span>
            </div>
          ))}
          {patients.length===0&&<div style={{padding:20,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No patients registered yet</div>}
        </div>
      </div>
    </div>
  );
}
