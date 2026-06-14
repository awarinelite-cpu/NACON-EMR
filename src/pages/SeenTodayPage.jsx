// src/pages/SeenTodayPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function SeenTodayPage() {
  const navigate = useNavigate();
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    const u1 = listenSickReportsToday(setSickReports);
    const u2 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); };
  }, []);

  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  // Seen = reported sick today AND in seenToday set
  const seenIds   = new Set(seenToday.map(p => p.id));
  const allSeen   = sickReports.filter(p => seenIds.has(p.id));

  // ── Unique classes from seen patients ─────────────────
  const allClasses = [...new Set(allSeen.map(p => p.classSet).filter(Boolean))].sort();

  // ── Apply class filter ────────────────────────────────
  const seen = classFilter === 'all'
    ? allSeen
    : allSeen.filter(p => p.classSet === classFilter);

  // ── Per-class counts for the breakdown bar ────────────
  const classCounts = {};
  allSeen.forEach(p => {
    const c = p.classSet || '—';
    classCounts[c] = (classCounts[c] || 0) + 1;
  });

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const methodBadge = (how) => how === 'qr'
    ? { label:'QR',     bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual', bg:'#fef3c7', color:'#92400e' };

  const seenStatusBadge = (p) => {
    if (p.status === 'discharged' && isToday(p.updatedAt)) return (
      <span className="badge badge-info" style={{fontSize:9, padding:'3px 8px'}}>
        <i className="ti ti-door-exit" style={{marginRight:3}} />Discharged
      </span>
    );
    if (p.status === 'referred' && isToday(p.updatedAt)) return (
      <span className="badge badge-warn" style={{fontSize:9, padding:'3px 8px'}}>
        <i className="ti ti-transfer" style={{marginRight:3}} />Referred
      </span>
    );
    return (
      <span className="badge badge-ok" style={{fontSize:9, padding:'3px 8px'}}>
        <i className="ti ti-check" style={{marginRight:3}} />Seen
      </span>
    );
  };

  const pillStyle = (val) => ({
    padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:20,
    border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
    background: classFilter === val ? 'var(--success)' : 'var(--card-bg2)',
    color:      classFilter === val ? '#fff'           : 'var(--t2)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      {/* ── Top bar ──────────────────────────────────── */}
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')}
          style={{padding:'6px 10px', flexShrink:0}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-check" style={{color:'var(--success)', marginRight:6}} />
          Seen Today
        </div>
        <div style={{
          background:'var(--success)', color:'#fff', borderRadius:20,
          padding:'3px 14px', fontSize:12, fontWeight:800, flexShrink:0,
        }}>{seen.length}</div>
      </div>

      <div className="page-content" style={{flex:1}}>

        {/* ── Class filter bar ─────────────────────────── */}
        {allClasses.length > 0 && (
          <div style={{
            display:'flex', gap:6, overflowX:'auto', paddingBottom:4,
            marginBottom:12, scrollbarWidth:'none',
          }}>
            <button style={pillStyle('all')} onClick={() => setClassFilter('all')}>
              All Classes
            </button>
            {allClasses.map(c => (
              <button key={c} style={pillStyle(c)} onClick={() => setClassFilter(c)}>
                {c} ({classCounts[c] || 0})
              </button>
            ))}
          </div>
        )}

        {/* ── Summary card ──────────────────────────────── */}
        <div className="stat-card" style={{textAlign:'center', marginBottom:12}}>
          <div style={{fontSize:30, fontWeight:900, color:'var(--success)', lineHeight:1}}>{seen.length}</div>
          <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
            <i className="ti ti-check" style={{marginRight:3}} />
            {classFilter === 'all' ? 'Seen Today' : `Seen Today — ${classFilter}`}
          </div>
        </div>

        {/* ── Per-class breakdown (shown when viewing all) ── */}
        {classFilter === 'all' && allClasses.length > 1 && (
          <div style={{
            background:'var(--card-bg)', border:'1px solid var(--border)',
            borderRadius:10, padding:'10px 14px', marginBottom:12,
          }}>
            <div style={{fontSize:10, fontWeight:700, color:'var(--t3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em'}}>
              <i className="ti ti-chart-bar" style={{marginRight:4}} />Seen by Class
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).map(([cls, cnt]) => (
                <button key={cls} onClick={() => setClassFilter(cls)} style={{
                  padding:'4px 12px', fontSize:11, fontWeight:700, borderRadius:20,
                  border:'none', cursor:'pointer',
                  background:'var(--success-bg)', color:'var(--success)',
                }}>
                  {cls}: {cnt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Patient list ──────────────────────────── */}
        <div className="card">
          {seen.length === 0
            ? <div style={{padding:40, textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:13}}>
                <i className="ti ti-check"
                  style={{fontSize:32, display:'block', marginBottom:8, opacity:0.3}} />
                {classFilter !== 'all'
                  ? `No patients from ${classFilter} have been seen yet today`
                  : 'No patients have been seen yet today'}
              </div>
            : seen.map(p => {
                const mb = methodBadge(p.reportedSickHow);
                return (
                  <div key={p.id} className="patient-row"
                    onClick={() => navigate(`/patient/${p.emrNumber}`)}
                    style={{cursor:'pointer'}}
                  >
                    <div className="p-avatar" style={{
                      background: p.sex==='Female' ? '#fce7f3' : '#dbeafe',
                      color:      p.sex==='Female' ? '#db2777' : '#1d4ed8',
                      fontWeight:800,
                    }}>{getInitials(p)}</div>

                    <div className="p-info" style={{flex:1}}>
                      <div className="p-name">{p.surname} {p.firstName}</div>
                      <div className="p-meta" style={{display:'flex', gap:5, alignItems:'center', flexWrap:'wrap'}}>
                        <span>{p.classSet} · {p.sex}</span>
                        <span style={{
                          fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:4,
                          background:mb.bg, color:mb.color,
                        }}>{mb.label}</span>
                      </div>
                    </div>

                    <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3}}>
                      {seenStatusBadge(p)}
                      <span className="emr-tag" style={{fontSize:9}}>{p.emrNumber}</span>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
