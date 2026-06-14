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

  // ── Today boundary (midnight local) ──────────────────
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  // ── Derived live stats ────────────────────────────────
  const waiting   = queue.filter(q => q.status === 'waiting').length;
  const sickBay   = patients.filter(p => p.status === 'sickbay');
  const maleAdm   = sickBay.filter(p => p.sex === 'Male').length;
  const femaleAdm = sickBay.filter(p => p.sex === 'Female').length;

  // patients whose latest visit started today (visited today = registeredAt or updatedAt today)
  const reportedToday = patients.filter(p => isToday(p.updatedAt) || isToday(p.registeredAt));
  const sickReportCount = reportedToday.length;

  const dischargedToday = patients.filter(p => p.status === 'discharged' && isToday(p.updatedAt)).length;
  const referredToday   = patients.filter(p => p.status === 'referred'   && isToday(p.updatedAt)).length;

  const seenToday = patients.filter(p => p.status === 'discharged').length;
  const active    = patients.filter(p => p.status === 'active');

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  // ── Top stat cards (original 4) ──────────────────────
  const stats = [
    { label:'Waiting',    value: waiting,        icon:'ti-clock', color:'var(--accent)', route:'/nurse/queue'   },
    { label:'Sick Bay',   value: sickBay.length, icon:'ti-bed',   color:'var(--warn)',   route:'/nurse/sickbay' },
    { label:'Meds due',   value: 0,              icon:'ti-pill',  color:'var(--danger)', route:'/nurse/meds'    },
    { label:'Seen today', value: seenToday,       icon:'ti-check', color:'var(--success)',route:'/nurse/patients'},
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

        {/* ── Original 4 stat cards ─────────────────── */}
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

        {/* ── NEW: 3 additional stat cards ─────────── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

          {/* Sick Report */}
          <div className="stat-card"
            onClick={() => navigate('/nurse/sick-report')}
            style={{ cursor:'pointer' }}
          >
            <div className="stat-label">
              <i className="ti ti-stethoscope" style={{color:'#f97316'}} /> Sick Report
            </div>
            <div className="stat-value" style={{color:'#f97316'}}>{sickReportCount}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:4,fontWeight:600}}>Reported today</div>
          </div>

          {/* On Admission — Male / Female */}
          <div className="stat-card"
            onClick={() => navigate('/nurse/sickbay')}
            style={{ cursor:'pointer' }}
          >
            <div className="stat-label">
              <i className="ti ti-bed" style={{color:'#a855f7'}} /> On Admission
            </div>
            <div style={{display:'flex', gap:12, marginTop:4, alignItems:'baseline'}}>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:'#3b82f6',lineHeight:1}}>{maleAdm}</div>
                <div style={{fontSize:10,color:'var(--t3)',fontWeight:600}}>Male</div>
              </div>
              <div style={{color:'var(--border)',fontSize:18}}>|</div>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:'#ec4899',lineHeight:1}}>{femaleAdm}</div>
                <div style={{fontSize:10,color:'var(--t3)',fontWeight:600}}>Female</div>
              </div>
            </div>
          </div>

          {/* Discharged / Referred */}
          <div className="stat-card"
            onClick={() => navigate('/nurse/discharged-referred')}
            style={{ cursor:'pointer' }}
          >
            <div className="stat-label">
              <i className="ti ti-logout" style={{color:'#10b981'}} /> D/R Today
            </div>
            <div style={{display:'flex', gap:12, marginTop:4, alignItems:'baseline'}}>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:'#10b981',lineHeight:1}}>{dischargedToday}</div>
                <div style={{fontSize:10,color:'var(--t3)',fontWeight:600}}>Discharged</div>
              </div>
              <div style={{color:'var(--border)',fontSize:18}}>|</div>
              <div>
                <div style={{fontSize:22,fontWeight:800,color:'#f59e0b',lineHeight:1}}>{referredToday}</div>
                <div style={{fontSize:10,color:'var(--t3)',fontWeight:600}}>Referred</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Queue & Sick Bay panels ───────────────── */}
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
                  <div className="p-meta">{p.classSet} · {p.sex}</div>
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
