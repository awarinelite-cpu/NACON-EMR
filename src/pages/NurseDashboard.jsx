// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue } from '../lib/emr';

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,  setPatients] = useState([]);
  const [queue,     setQueue]    = useState([]);

  useEffect(() => {
    const u1 = listenPatients(setPatients);
    const u2 = listenTriageQueue(setQueue);
    return () => { u1 && u1(); u2 && u2(); };
  }, []);

  // Stats derived from live data
  const waiting   = queue.filter(q => q.status === 'waiting').length;
  const sickBay   = patients.filter(p => p.status === 'sickbay');
  const seenToday = patients.filter(p => p.status === 'discharged').length;
  const active    = patients.filter(p => p.status === 'active');

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const stats = [
    { label:'Waiting',    value: waiting,         icon:'ti-clock',  color:'var(--accent)', route:'/nurse/queue'   },
    { label:'Sick Bay',   value: sickBay.length,  icon:'ti-bed',    color:'var(--warn)',   route:'/nurse/sickbay' },
    { label:'Meds due',   value: 0,               icon:'ti-pill',   color:'var(--danger)', route:'/nurse/meds'    },
    { label:'Seen today', value: seenToday,        icon:'ti-check',  color:'var(--success)',route:'/nurse/patients'},
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Nurse {profile?.displayName}</div>
        <PatientSearch />
        <button className="btn btn-primary" onClick={() => navigate('/nurse/patients')}>
          <i className="ti ti-notes-medical" /> Add nursing note
        </button>
      </div>
      <div className="page-content" style={{ flex:1 }}>
        <div className="stats-grid">
          {stats.map(s => (
            <div key={s.label} className="stat-card"
              onClick={() => navigate(s.route)}
              style={{ cursor:'pointer' }}
            >
              <div className="stat-label">
                <i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}
              </div>
              <div className="stat-value" style={{color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
          {/* Queue */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-clock" />Queue</div>
              <span className="card-action" onClick={() => navigate('/nurse/queue')}>All →</span>
            </div>
            {queue.filter(q=>q.status==='waiting').slice(0,6).map(q => (
              <div key={q.id} className="patient-row"
                onClick={() => navigate(`/patient/${q.emrNumber}`)}
                style={{ cursor:'pointer' }}
              >
                <div style={{
                  width:28, height:28, borderRadius:6,
                  background: q.priority==='P1'?'var(--danger-bg)':q.priority==='P2'?'var(--warn-bg)':'var(--accent-bg)',
                  color: q.priority==='P1'?'var(--danger)':q.priority==='P2'?'var(--warn)':'var(--accent)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:10, fontWeight:700, flexShrink:0,
                }}>{q.priority}</div>
                <div className="p-info">
                  <div className="p-name">{q.surname} {q.firstName}</div>
                  <div className="p-meta">{q.classSet}</div>
                </div>
                <span className="badge badge-warn">Waiting</span>
              </div>
            ))}
            {waiting===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>Queue is empty</div>}
          </div>

          {/* Sick Bay */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-bed" />Sick Bay</div>
              <span className="card-action" onClick={() => navigate('/nurse/sickbay')}>All →</span>
            </div>
            {sickBay.slice(0,6).map(p => (
              <div key={p.id} className="patient-row"
                onClick={() => navigate(`/patient/${p.emrNumber}`)}
                style={{ cursor:'pointer' }}
              >
                <div className="p-avatar" style={{background:'var(--danger-bg)',color:'var(--danger)'}}>{getInitials(p)}</div>
                <div className="p-info">
                  <div className="p-name">{p.surname} {p.firstName}</div>
                  <div className="p-meta">{p.classSet}</div>
                </div>
                <span className="badge badge-danger">Admitted</span>
              </div>
            ))}
            {sickBay.length===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>Sick bay is empty</div>}
          </div>
        </div>

        {/* Active patients */}
        <div className="card" style={{marginTop:12}}>
          <div className="card-header">
            <div className="card-title"><i className="ti ti-users" />Active patients</div>
            <span className="card-action" onClick={() => navigate('/nurse/patients')}>View all →</span>
          </div>
          {active.slice(0,8).map(p => (
            <div key={p.id} className="patient-row"
              onClick={() => navigate(`/patient/${p.emrNumber}`)}
              style={{ cursor:'pointer' }}
            >
              <div className="p-avatar" style={{background:'var(--accent-bg)',color:'var(--accent)'}}>{getInitials(p)}</div>
              <div className="p-info">
                <div className="p-name">{p.surname} {p.firstName}</div>
                <div className="p-meta">{p.classSet} · {p.folderNumber}</div>
              </div>
              <span className="emr-tag">{p.emrNumber}</span>
            </div>
          ))}
          {active.length===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No active patients</div>}
        </div>
      </div>
    </div>
  );
}
