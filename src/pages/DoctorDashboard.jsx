// src/pages/DoctorDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue, formatTs } from '../lib/emr';

export default function DoctorDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,  setPatients]  = useState([]);
  const [queue,     setQueue]     = useState([]);

  useEffect(() => {
    const u1 = listenPatients(setPatients);
    const u2 = listenTriageQueue(setQueue);
    return () => { u1 && u1(); u2 && u2(); };
  }, []);

  // Stats derived from live data
  const waiting       = queue.filter(q => q.status === 'waiting').length;
  const seenToday     = patients.filter(p => p.status === 'discharged').length;
  const referred      = patients.filter(p => p.status === 'referred').length;
  const totalPatients = patients.length;
  const active        = patients.filter(p => p.status === 'active');

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls   = s => s==='active'?'badge-danger':s==='discharged'?'badge-ok':s==='referred'?'badge-warn':'badge-info';

  const stats = [
    { label:'Waiting',        value: waiting,       icon:'ti-clock',       color:'var(--accent)',  route:'/doctor/queue'     },
    { label:'Seen today',     value: seenToday,     icon:'ti-check',       color:'var(--success)', route:'/doctor/patients'  },
    { label:'Referred',       value: referred,      icon:'ti-file-export', color:'var(--warn)',    route:'/doctor/referrals' },
    { label:'Total Patients', value: totalPatients, icon:'ti-users',       color:'var(--info)',    route:'/doctor/patients'  },
  ];

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

        {/* Triage Queue — patients waiting to see doctor */}
        {waiting > 0 && (
          <div className="card" style={{marginBottom:12}}>
            <div className="card-header">
              <div className="card-title"><i className="ti ti-clock" />Triage Queue — Waiting</div>
              <span className="card-action" onClick={() => navigate('/doctor/queue')}>View all →</span>
            </div>
            {queue.filter(q => q.status==='waiting').slice(0,5).map(q => (
              <div key={q.id} className="patient-row"
                onClick={() => navigate(`/patient/${q.emrNumber}`)}
                style={{ cursor:'pointer' }}
              >
                <div style={{
                  width:32, height:32, borderRadius:8,
                  background: q.priority==='P1'?'var(--danger-bg)':q.priority==='P2'?'var(--warn-bg)':'var(--accent-bg)',
                  color: q.priority==='P1'?'var(--danger)':q.priority==='P2'?'var(--warn)':'var(--accent)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:700, flexShrink:0,
                }}>{q.priority}</div>
                <div className="p-info">
                  <div className="p-name">{q.surname} {q.firstName}</div>
                  <div className="p-meta">{q.classSet} · {q.chiefComplaint}</div>
                </div>
                <span className="badge badge-warn">Waiting</span>
              </div>
            ))}
          </div>
        )}

        {/* Active patients list */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-clock" />Active patients — in clinic today</div>
            <span className="card-action" onClick={() => navigate('/doctor/patients')}>View all →</span>
          </div>
          {active.slice(0,10).map(p => (
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
