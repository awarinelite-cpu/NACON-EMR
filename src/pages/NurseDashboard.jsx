// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue, listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,    setPatients]   = useState([]);
  const [queue,       setQueue]      = useState([]);
  const [sickReports, setSickReports]= useState([]);
  const [seenToday,   setSeenToday]  = useState([]);
  const [classFilter, setClassFilter]= useState('all');

  useEffect(() => {
    const u1 = listenPatients(setPatients);
    const u2 = listenTriageQueue(setQueue);
    const u3 = listenSickReportsToday(setSickReports);
    const u4 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  }, []);

  // ── Today boundary ────────────────────────────────────
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  // ── All unique classes across ALL patients (for the selector) ──
  const allClasses = [...new Set(patients.map(p => p.classSet).filter(Boolean))].sort();

  // ── Apply class filter ────────────────────────────────
  const byClass = (list) =>
    classFilter === 'all' ? list : list.filter(p => p.classSet === classFilter);

  // ── Derived live stats (class-filtered) ──────────────
  const filteredPatients  = byClass(patients);
  const filteredSick      = byClass(sickReports);
  const filteredSeen      = byClass(seenToday);

  const waiting      = queue.filter(q => q.status === 'waiting').length;
  const sickBay      = byClass(patients.filter(p => p.status === 'sickbay'));
  const maleAdm      = sickBay.filter(p => p.sex === 'Male').length;
  const femaleAdm    = sickBay.filter(p => p.sex === 'Female').length;

  const seenIds       = new Set(filteredSeen.map(p => p.id));
  const sickTotal     = filteredSick.length;
  const sickSeenCount = filteredSick.filter(p => seenIds.has(p.id)).length;
  const notSeenCount  = sickTotal - sickSeenCount;

  const dischargedToday = byClass(patients).filter(p => p.status === 'discharged' && isToday(p.updatedAt)).length;
  const referredToday   = byClass(patients).filter(p => p.status === 'referred'   && isToday(p.updatedAt)).length;
  const active          = byClass(patients).filter(p => p.status === 'active');

  // ── Per-class breakdown for summary bars ─────────────
  const classBreakdown = (list) => {
    const counts = {};
    list.forEach(p => {
      const c = p.classSet || '—';
      counts[c] = (counts[c] || 0) + 1;
    });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]);
  };

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  // ── Class selector pill styles ────────────────────────
  const pillStyle = (val) => ({
    padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:20,
    border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
    background: classFilter === val ? 'var(--accent)' : 'var(--card-bg2)',
    color:      classFilter === val ? '#fff'          : 'var(--t2)',
    transition: 'all 0.15s',
  });

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

        {/* ── Class filter bar ─────────────────────────── */}
        <div style={{
          display:'flex', gap:6, overflowX:'auto', paddingBottom:4,
          marginBottom:12, scrollbarWidth:'none',
        }}>
          <button style={pillStyle('all')} onClick={() => setClassFilter('all')}>
            All Classes
          </button>
          {allClasses.map(c => (
            <button key={c} style={pillStyle(c)} onClick={() => setClassFilter(c)}>
              {c}
            </button>
          ))}
        </div>

        {/* ── Active filter label ───────────────────────── */}
        {classFilter !== 'all' && (
          <div style={{
            display:'flex', alignItems:'center', gap:8,
            marginBottom:10, padding:'6px 12px',
            background:'var(--accent-bg)', borderRadius:8,
            fontSize:12, fontWeight:700, color:'var(--accent)',
          }}>
            <i className="ti ti-filter" style={{fontSize:14}} />
            Showing: {classFilter}
            <button onClick={() => setClassFilter('all')} style={{
              marginLeft:'auto', background:'none', border:'none',
              cursor:'pointer', color:'var(--accent)', fontSize:14, padding:0,
            }}>
              <i className="ti ti-x" />
            </button>
          </div>
        )}

        {/* ── Total Registered Patients ── */}
        <div className="stat-card" onClick={() => navigate('/nurse/patients')} style={{cursor:'pointer', marginBottom:12}}>
          <div className="stat-label"><i className="ti ti-users" style={{color:'#8b5cf6'}} />Total Registered Patients</div>
          <div className="stat-value" style={{color:'#8b5cf6'}}>{filteredPatients.length}</div>
          {classFilter === 'all' && classBreakdown(patients).length > 0 && (
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:6}}>
              {classBreakdown(patients).map(([cls, cnt]) => (
                <span key={cls} style={{
                  fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background:'#ede9fe', color:'#7c3aed', cursor:'pointer',
                }} onClick={e => { e.stopPropagation(); setClassFilter(cls); }}>
                  {cls}: {cnt}
                </span>
              ))}
            </div>
          )}
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

          {/* Sick Report */}
          <div className="stat-card" onClick={() => navigate('/nurse/sick-report')} style={{cursor:'pointer'}}>
            <div className="stat-label">
              <i className="ti ti-stethoscope" style={{color:'#f97316'}} /> Sick Report
            </div>
            <div className="stat-value" style={{color:'#f97316'}}>{sickTotal}</div>
            <div style={{display:'flex', gap:8, marginTop:4}}>
              <span style={{fontSize:9,fontWeight:800,color:'#10b981'}}>✓ {sickSeenCount} seen</span>
              <span style={{fontSize:9,fontWeight:800,color:'#94a3b8'}}>· {notSeenCount} pending</span>
            </div>
          </div>

          {/* On Admission */}
          <div className="stat-card" onClick={() => navigate('/nurse/on-admission')} style={{cursor:'pointer'}}>
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
          <div className="stat-card" onClick={() => navigate('/nurse/discharged-referred')} style={{cursor:'pointer'}}>
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

        {/* ── Active patients ───────────────────────── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-users" />Active patients
              {classFilter !== 'all' && (
                <span style={{
                  marginLeft:8, fontSize:10, fontWeight:700,
                  background:'var(--accent-bg)', color:'var(--accent)',
                  padding:'2px 8px', borderRadius:10,
                }}>{classFilter}</span>
              )}
            </div>
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
