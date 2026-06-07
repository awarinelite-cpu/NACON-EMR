// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, getTodayStats } from '../lib/emr';

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients, setPatients] = useState([]);
  const [stats,    setStats]    = useState({});

  useEffect(() => {
    getTodayStats().then(setStats);
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const queue   = patients.filter(p => p.status === 'active');
  const sickBay = patients.filter(p => p.status === 'sickbay');
  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Nurse {profile?.displayName}</div>
        <PatientSearch />
        <button className="btn btn-primary" onClick={() => navigate('/nurse/patients')}>
          <i className="ti ti-notes-medical" /> Add nursing note
        </button>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          {[
            { label:'Waiting',    value:stats.waiting||0,  icon:'ti-clock',   color:'var(--accent)'  },
            { label:'Sick Bay',   value:stats.sickBay||0,  icon:'ti-bed',     color:'var(--warn)'    },
            { label:'Meds due',   value:3,                 icon:'ti-pill',    color:'var(--danger)'  },
            { label:'Seen today', value:stats.discharged||0, icon:'ti-check', color:'var(--success)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-clock" />Queue</div>
            </div>
            {queue.slice(0,6).map(p => (
              <div key={p.id} className="patient-row" onClick={()=>navigate(`/patient/${p.emrNumber}`)}>
                <div className="p-avatar" style={{background:'var(--accent-bg)',color:'var(--accent)'}}>{getInitials(p)}</div>
                <div className="p-info">
                  <div className="p-name">{p.surname} {p.firstName}</div>
                  <div className="p-meta">{p.classSet} · {p.emrNumber}</div>
                </div>
                <span className="badge badge-warn">Waiting</span>
              </div>
            ))}
            {queue.length===0&&<div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>Queue is empty</div>}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-bed" />Sick Bay</div>
            </div>
            {sickBay.slice(0,6).map(p => (
              <div key={p.id} className="patient-row" onClick={()=>navigate(`/patient/${p.emrNumber}`)}>
                <div className="p-avatar" style={{background:'var(--danger-bg)',color:'var(--danger)'}}>{getInitials(p)}</div>
                <div className="p-info">
                  <div className="p-name">{p.surname} {p.firstName}</div>
                  <div className="p-meta">{p.classSet}</div>
                </div>
                <span className="badge badge-danger">Admitted</span>
              </div>
            ))}
            {sickBay.length===0&&<div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>Sick bay is empty</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
