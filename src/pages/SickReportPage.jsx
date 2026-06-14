// src/pages/SickReportPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function SickReportPage() {
  const navigate = useNavigate();
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);
  const [tab, setTab] = useState('all'); // 'all' | 'discharged' | 'referred'

  useEffect(() => {
    const u1 = listenSickReportsToday(setSickReports);
    const u2 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); };
  }, []);

  // Today boundary for discharged check
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  // seenIds = patients with clinical activity today (from listenSeenToday)
  const seenIds   = new Set(seenToday.map(p => p.id));
  // Discharged today / Referred today — independent of when they reported sick
  const dischargedToday = seenToday.filter(p => p.status === 'discharged' && isToday(p.updatedAt));
  const referredToday   = seenToday.filter(p => p.status === 'referred'   && isToday(p.updatedAt));
  const displayed = tab === 'discharged' ? dischargedToday : tab === 'referred' ? referredToday : sickReports;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const methodBadge = (how) => how === 'qr'
    ? { label:'QR',     bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual', bg:'#fef3c7', color:'#92400e' };

  // Status badge for a "seen" patient — discharged today gets its own badge
  const seenStatusBadge = (p) => {
    const dischargedToday = p.status === 'discharged' && isToday(p.updatedAt);
    const referredToday   = p.status === 'referred'   && isToday(p.updatedAt);
    if (dischargedToday) return (
      <span className="badge badge-info" style={{fontSize:9, padding:'3px 8px'}}>
        <i className="ti ti-door-exit" style={{marginRight:3}} />Discharged
      </span>
    );
    if (referredToday) return (
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

  const tabStyle = (id) => ({
    flex:1, padding:'9px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius:8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color:      tab===id ? '#fff'          : 'var(--t2)',
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
          <i className="ti ti-stethoscope" style={{color:'#f97316', marginRight:6}} />
          Sick Report — Today
        </div>
        <div style={{
          background:'#f97316', color:'#fff', borderRadius:20,
          padding:'3px 14px', fontSize:12, fontWeight:800, flexShrink:0,
        }}>{sickReports.length}</div>
      </div>

      <div className="page-content" style={{flex:1}}>

        {/* ── 3 summary cards ────────────────────────── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab('all')}>
            <div style={{
              fontSize:30, fontWeight:900, color:'#f97316', lineHeight:1,
              opacity: tab!=='all' ? 0.4 : 1, transition:'opacity 0.2s',
            }}>{sickReports.length}</div>
            <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-stethoscope" style={{marginRight:3}} />Reported
            </div>
          </div>

          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab('discharged')}>
            <div style={{
              fontSize:30, fontWeight:900, color:'var(--info)', lineHeight:1,
              opacity: tab!=='discharged' ? 0.4 : 1, transition:'opacity 0.2s',
            }}>{dischargedToday.length}</div>
            <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-door-exit" style={{marginRight:3}} />Discharged
            </div>
          </div>

          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab('referred')}>
            <div style={{
              fontSize:30, fontWeight:900, color:'#f59e0b', lineHeight:1,
              opacity: tab!=='referred' ? 0.4 : 1, transition:'opacity 0.2s',
            }}>{referredToday.length}</div>
            <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-transfer" style={{marginRight:3}} />Referred
            </div>
          </div>
        </div>

        {/* ── Tab filter ────────────────────────────── */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}        onClick={() => setTab('all')}>All ({sickReports.length})</button>
          <button style={tabStyle('discharged')} onClick={() => setTab('discharged')}>Discharged ({dischargedToday.length})</button>
          <button style={tabStyle('referred')}   onClick={() => setTab('referred')}>Referred ({referredToday.length})</button>
        </div>

        {/* ── Patient list ──────────────────────────── */}
        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:40, textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:13}}>
                <i className={`ti ${tab==='discharged' ? 'ti-door-exit' : tab==='referred' ? 'ti-transfer' : 'ti-stethoscope'}`}
                  style={{fontSize:32, display:'block', marginBottom:8, opacity:0.3}} />
                {tab==='discharged' ? 'No patients have been discharged today'
                : tab==='referred'  ? 'No patients have been referred today'
                :                     'No students have reported sick today'}
              </div>
            : displayed.map(p => {
                const mb      = methodBadge(p.reportedSickHow);
                const wasSeen = seenIds.has(p.id);
                return (
                  <div key={p.id} className="patient-row"
                    onClick={() => navigate(`/patient/${p.emrNumber}`)}
                    style={{cursor:'pointer'}}
                  >
                    {/* Gender-coded avatar */}
                    <div className="p-avatar" style={{
                      background: p.sex==='Female' ? '#fce7f3' : '#dbeafe',
                      color:      p.sex==='Female' ? '#db2777' : '#1d4ed8',
                      fontWeight:800,
                    }}>{getInitials(p)}</div>

                    <div className="p-info" style={{flex:1}}>
                      <div className="p-name">{p.surname} {p.firstName}</div>
                      <div className="p-meta" style={{display:'flex', gap:5, alignItems:'center', flexWrap:'wrap'}}>
                        <span>{p.classSet} · {p.sex}</span>
                        {/* QR / Manual badge */}
                        <span style={{
                          fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:4,
                          background:mb.bg, color:mb.color,
                        }}>{mb.label}</span>
                      </div>
                    </div>

                    {/* Right side: status badge + EMR */}
                    <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3}}>
                      {wasSeen
                        ? seenStatusBadge(p)
                        : <span className="badge" style={{
                            fontSize:9, padding:'3px 8px',
                            background:'var(--card-bg)', border:'1px solid var(--border)',
                            color:'var(--t3)',
                          }}>
                            <i className="ti ti-clock" style={{marginRight:3}} />Pending
                          </span>
                      }
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
