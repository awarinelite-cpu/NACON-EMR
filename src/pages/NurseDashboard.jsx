// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue, listenSickReportsToday, listenSeenToday } from '../lib/emr';

// ── Reusable inline class-filter toggle ──────────────────────
// Renders a tiny funnel icon; on tap opens an inline pill row
function CardFilter({ allClasses, value, onChange }) {
  const [open, setOpen] = useState(false);
  if (allClasses.length === 0) return null;
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="Filter by class"
        style={{
          background: value !== 'all' ? 'var(--accent)' : 'var(--card-bg2)',
          color:      value !== 'all' ? '#fff'          : 'var(--t3)',
          border: 'none', borderRadius: 8, padding: '3px 7px',
          fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
          transition: 'all 0.15s',
        }}
      >
        <i className="ti ti-filter" style={{ fontSize: 11 }} />
        {value !== 'all' && <span style={{ fontSize: 9, fontWeight: 800 }}>{value}</span>}
      </button>
      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '110%', right: 0, zIndex: 99,
            background: 'var(--card-bg)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '6px 8px',
            display: 'flex', flexDirection: 'column', gap: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 110,
          }}
        >
          {['all', ...allClasses].map(cls => (
            <button key={cls} onClick={() => { onChange(cls); setOpen(false); }} style={{
              background: value === cls ? 'var(--accent)' : 'transparent',
              color:      value === cls ? '#fff'          : 'var(--t2)',
              border: 'none', borderRadius: 6, padding: '4px 8px',
              fontSize: 10, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.12s',
            }}>
              {cls === 'all' ? 'All Classes' : cls}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [queue,       setQueue]       = useState([]);
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);

  // ── Per-card independent filters ─────────────────────────
  const [fTotal,    setFTotal]    = useState('all');
  const [fWaiting,  setFWaiting]  = useState('all');
  const [fSeen,     setFSeen]     = useState('all');
  const [fSick,     setFSick]     = useState('all');
  const [fAdm,      setFAdm]      = useState('all');
  const [fDR,       setFDR]       = useState('all');

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

  const allClasses = [...new Set(patients.map(p => p.classSet).filter(Boolean))].sort();

  const byClass = (list, f) => f === 'all' ? list : list.filter(p => p.classSet === f);

  // ── Total Registered ──────────────────────────────────────
  const filteredPatients = byClass(patients, fTotal);
  const classBreakdown   = (list) => {
    const counts = {};
    list.forEach(p => { const c = p.classSet||'—'; counts[c]=(counts[c]||0)+1; });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  };

  // ── Waiting ───────────────────────────────────────────────
  const filteredQueue  = fWaiting === 'all'
    ? queue
    : queue.filter(q => {
        const pt = patients.find(p => p.emrNumber === q.emrNumber || p.id === q.patientId);
        return pt?.classSet === fWaiting;
      });
  const waiting = filteredQueue.filter(q => q.status === 'waiting').length;

  // ── Seen Today ────────────────────────────────────────────
  const filteredSeen      = byClass(seenToday, fSeen);
  const filteredSick4seen = byClass(sickReports, fSeen);
  const seenIds           = new Set(filteredSeen.map(p => p.id));
  const sickSeenCount     = filteredSick4seen.filter(p => seenIds.has(p.id)).length;

  // ── Sick Report ───────────────────────────────────────────
  const filteredSick  = byClass(sickReports, fSick);
  const filteredSeen2 = byClass(seenToday,   fSick);
  const seenIds2      = new Set(filteredSeen2.map(p => p.id));
  const sickTotal     = filteredSick.length;
  const sickSeen      = filteredSick.filter(p => seenIds2.has(p.id)).length;
  const notSeen       = sickTotal - sickSeen;

  // ── On Admission ─────────────────────────────────────────
  const sickBay   = byClass(patients.filter(p => p.status === 'sickbay'), fAdm);
  const maleAdm   = sickBay.filter(p => p.sex === 'Male').length;
  const femaleAdm = sickBay.filter(p => p.sex === 'Female').length;

  // ── D/R Today ─────────────────────────────────────────────
  const dischargedToday = byClass(patients, fDR).filter(p => p.status==='discharged' && isToday(p.updatedAt)).length;
  const referredToday   = byClass(patients, fDR).filter(p => p.status==='referred'   && isToday(p.updatedAt)).length;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

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

        {/* ── Total Registered Patients ── */}
        <div className="stat-card" onClick={() => navigate('/nurse/patients')} style={{cursor:'pointer', marginBottom:12}}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
            <div className="stat-label" style={{margin:0}}>
              <i className="ti ti-users" style={{color:'#8b5cf6'}} />Total Registered Patients
            </div>
            <CardFilter allClasses={allClasses} value={fTotal} onChange={setFTotal} />
          </div>
          <div className="stat-value" style={{color:'#8b5cf6'}}>{filteredPatients.length}</div>
          {fTotal === 'all' && classBreakdown(patients).length > 0 && (
            <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:6}}>
              {classBreakdown(patients).map(([cls, cnt]) => (
                <span key={cls} style={{
                  fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background:'#ede9fe', color:'#7c3aed',
                }}>
                  {cls}: {cnt}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Row 1: Waiting · Meds Due · Seen Today ── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

          {/* Waiting */}
          <div className="stat-card" onClick={() => navigate('/nurse/queue')} style={{cursor:'pointer'}}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:2 }}>
              <div className="stat-label" style={{margin:0, fontSize:9}}>
                <i className="ti ti-clock" style={{color:'var(--accent)'}} />Waiting
              </div>
              <CardFilter allClasses={allClasses} value={fWaiting} onChange={setFWaiting} />
            </div>
            <div className="stat-value" style={{color:'var(--accent)'}}>{waiting}</div>
          </div>

          {/* Meds Due — no class filter (not patient-specific) */}
          <div className="stat-card" onClick={() => navigate('/nurse/meds')} style={{cursor:'pointer'}}>
            <div className="stat-label"><i className="ti ti-pill" style={{color:'var(--danger)'}} />Meds due</div>
            <div className="stat-value" style={{color:'var(--danger)'}}>0</div>
          </div>

          {/* Seen Today */}
          <div className="stat-card" onClick={() => navigate('/nurse/seen-today')} style={{cursor:'pointer'}}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:2 }}>
              <div className="stat-label" style={{margin:0, fontSize:9}}>
                <i className="ti ti-check" style={{color:'var(--success)'}} />Seen today
              </div>
              <CardFilter allClasses={allClasses} value={fSeen} onChange={setFSeen} />
            </div>
            <div className="stat-value" style={{color:'var(--success)'}}>{sickSeenCount}</div>
          </div>
        </div>

        {/* ── Row 2: Sick Report · On Admission · D/R ── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>

          {/* Sick Report */}
          <div className="stat-card" onClick={() => navigate('/nurse/sick-report')} style={{cursor:'pointer'}}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:2 }}>
              <div className="stat-label" style={{margin:0, fontSize:9}}>
                <i className="ti ti-stethoscope" style={{color:'#f97316'}} />Sick Report
              </div>
              <CardFilter allClasses={allClasses} value={fSick} onChange={setFSick} />
            </div>
            <div className="stat-value" style={{color:'#f97316'}}>{sickTotal}</div>
            <div style={{display:'flex', gap:6, marginTop:4, flexWrap:'wrap'}}>
              <span style={{fontSize:9,fontWeight:800,color:'#10b981'}}>✓ {sickSeen}</span>
              <span style={{fontSize:9,fontWeight:800,color:'#94a3b8'}}>· {notSeen} pend</span>
            </div>
          </div>

          {/* On Admission */}
          <div className="stat-card" onClick={() => navigate('/nurse/on-admission')} style={{cursor:'pointer'}}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:2 }}>
              <div className="stat-label" style={{margin:0, fontSize:9}}>
                <i className="ti ti-bed" style={{color:'#a855f7'}} />On Admission
              </div>
              <CardFilter allClasses={allClasses} value={fAdm} onChange={setFAdm} />
            </div>
            <div style={{display:'flex', gap:8, marginTop:2, alignItems:'baseline'}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:'#3b82f6',lineHeight:1}}>{maleAdm}</div>
                <div style={{fontSize:9,color:'var(--t3)',fontWeight:600}}>Male</div>
              </div>
              <div style={{color:'var(--border)',fontSize:16}}>|</div>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:'#ec4899',lineHeight:1}}>{femaleAdm}</div>
                <div style={{fontSize:9,color:'var(--t3)',fontWeight:600}}>Female</div>
              </div>
            </div>
          </div>

          {/* Discharged / Referred */}
          <div className="stat-card" onClick={() => navigate('/nurse/discharged-referred')} style={{cursor:'pointer'}}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:2 }}>
              <div className="stat-label" style={{margin:0, fontSize:9}}>
                <i className="ti ti-logout" style={{color:'#10b981'}} />D/R Today
              </div>
              <CardFilter allClasses={allClasses} value={fDR} onChange={setFDR} />
            </div>
            <div style={{display:'flex', gap:8, marginTop:2, alignItems:'baseline'}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:'#10b981',lineHeight:1}}>{dischargedToday}</div>
                <div style={{fontSize:9,color:'var(--t3)',fontWeight:600}}>Discharged</div>
              </div>
              <div style={{color:'var(--border)',fontSize:16}}>|</div>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:'#f59e0b',lineHeight:1}}>{referredToday}</div>
                <div style={{fontSize:9,color:'var(--t3)',fontWeight:600}}>Referred</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
