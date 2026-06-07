// src/pages/DoctorDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, getTodayStats, formatTime } from '../lib/emr';

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients, setPatients] = useState([]);
  const [stats,    setStats]    = useState({});

  useEffect(() => {
    getTodayStats().then(setStats);
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const active = patients.filter(p => p.status === 'active');

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls   = s => s==='active'?'badge-danger':s==='discharged'?'badge-ok':s==='referred'?'badge-warn':'badge-info';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Dr. {profile?.displayName}</div>
        <PatientSearch />
        <button className="btn btn-primary" onClick={() => navigate('/doctor/patients')}>
          <i className="ti ti-stethoscope" /> New consultation
        </button>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          {[
            { label:'Waiting',      value:stats.waiting||0,       icon:'ti-clock',        color:'var(--accent)' },
            { label:'Seen today',   value:stats.discharged||0,    icon:'ti-check',        color:'var(--success)' },
            { label:'Referred',     value:stats.referred||0,      icon:'ti-file-export',  color:'var(--warn)' },
            { label:'Total Patients', value:stats.totalPatients||0, icon:'ti-users',     color:'var(--info)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-clock" />Active patients — in clinic today</div>
            <span className="card-action" onClick={()=>navigate('/doctor/patients')}>View all →</span>
          </div>
          {active.slice(0,10).map(p => (
            <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)}>
              <div className="p-avatar" style={{background:'var(--accent-bg)',color:'var(--accent)'}}>{getInitials(p)}</div>
              <div className="p-info">
                <div className="p-name">{p.surname} {p.firstName}</div>
                <div className="p-meta">{p.classSet} · {p.folderNumber}</div>
              </div>
              <span className="emr-tag">{p.emrNumber}</span>
              <span className={`badge ${statusCls(p.status)}`}>{p.status}</span>
            </div>
          ))}
          {active.length===0 && (
            <div style={{padding:20,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
              No active patients in clinic today
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
