// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue, listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [queue,       setQueue]       = useState([]);
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);

  useEffect(() => {
    const u1 = listenPatients(setPatients);
    const u2 = listenTriageQueue(setQueue);
    const u3 = listenSickReportsToday(setSickReports);
    const u4 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  }, []);

  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = ts => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  const waiting       = queue.filter(q => q.status === 'waiting').length;
  const sickBay       = patients.filter(p => p.status === 'sickbay');
  const maleAdm       = sickBay.filter(p => p.sex === 'Male').length;
  const femaleAdm     = sickBay.filter(p => p.sex === 'Female').length;
  const seenIds       = new Set(seenToday.map(p => p.id));
  const sickSeenCount = sickReports.filter(p => seenIds.has(p.id)).length;
  const sickTotal     = sickReports.length;
  const notSeen       = sickTotal - sickSeenCount;
  const dischargedToday = patients.filter(p => p.status === 'discharged' && isToday(p.updatedAt)).length;
  const referredToday   = patients.filter(p => p.status === 'referred'   && isToday(p.updatedAt)).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Nurse {profile?.displayName}</div>
        <PatientSearch />
      </div>
      <div className="page-content" style={{ flex:1 }}>

        {/* ── Total Registered Patients ── */}
        <div className="stat-card" onClick={() => navigate('/nurse/patients')} style={{cursor:'pointer', marginBottom:12}}>
          <div className="stat-label"><i className="ti ti-users" style={{color:'#8b5cf6'}} />Total Registered Patients</div>
          <div className="stat-value" style={{color:'#8b5cf6'}}>{patients.length}</div>
        </div>

        {/* ── Row 1: Waiting · Meds Due · Seen Today ── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" onClick={() => navigate('/nurse/queue')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-clock" style={{color:'var(--accent)'}} />Waiting</div>
            <div className="stat-value" style={{color:'var(--accent)'}}>{waiting}</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/nurse/meds')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-pill" style={{color:'var(--danger)'}} />Meds due</div>
            <div className="stat-value" style={{color:'var(--danger)'}}>0</div>
          </div>
          <div className="stat-card" onClick={() => navigate('/nurse/seen-today')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-check" style={{color:'var(--success)'}} />Seen today</div>
            <div className="stat-value" style={{color:'var(--success)'}}>{sickSeenCount}</div>
          </div>
        </div>

        {/* ── Row 2: Sick Report · On Admission · D/R ── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

          <div className="stat-card" onClick={() => navigate('/nurse/sick-report')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-stethoscope" style={{color:'#f97316'}} />Sick Report</div>
            <div className="stat-value" style={{color:'#f97316'}}>{sickTotal}</div>
            <div style={{display:'flex', gap:6, marginTop:4}}>
              <span style={{fontSize:9,fontWeight:800,color:'#10b981'}}>✓ {sickSeenCount} seen</span>
              <span style={{fontSize:9,fontWeight:800,color:'#94a3b8'}}>· {notSeen} pending</span>
            </div>
          </div>

          <div className="stat-card" onClick={() => navigate('/nurse/on-admission')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-bed" style={{color:'#a855f7'}} />On Admission</div>
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

          <div className="stat-card" onClick={() => navigate('/nurse/discharged-referred')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-logout" style={{color:'#10b981'}} />D/R Today</div>
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

      </div>
    </div>
  );
}
