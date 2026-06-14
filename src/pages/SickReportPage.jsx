// src/pages/SickReportPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function SickReportPage() {
  const navigate = useNavigate();
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);
  const [tab, setTab] = useState('all'); // 'all' | 'seen' | 'pending'

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

  // seenIds = patients who reported sick AND were seen today
  const seenIds   = new Set(seenToday.map(p => p.id));
  const seen      = sickReports.filter(p => seenIds.has(p.id));
  const notSeen   = sickReports.filter(p => !seenIds.has(p.id));
  const displayed = tab === 'seen' ? seen : tab === 'pending' ? notSeen : sickReports;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const methodBadge = (how) => how === 'qr'
    ? { label:'QR',     bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual', bg:'#fef3c7', color:'#92400e' };

  // Status badge for a "seen" patient — discharged today gets its own badge
  const seenStatusBadge = (p) => {
    const dischargedToday = p.status === 'discharged' && isToday(p.updatedAt);
    const referredToday   = p.status === 'referred'   && isToday(p.updatedAt);
    if (dischargedToday) return (
      <span className="badge badge-ok" style={{fontSize:9, padding:'3px 8px', background:'#d1fae5', color:'#065f46', border:'1px solid #6ee7b7'}}>
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
            onClick={() => setTab('seen')}>
            <div style={{
              fontSize:30, fontWeight:900, color:'#10b981', lineHeight:1,
              opacity: tab!=='seen' ? 0.4 : 1, transition:'opacity 0.2s',
            }}>{seen.length}</div>
            <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-check" style={{marginRight:3}} />Seen at MRS
            </div>
          </div>

          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab('pending')}>
            <div style={{
              fontSize:30, fontWeight:900, color:'#94a3b8', lineHeight:1,
              opacity: tab!=='pending' ? 0.4 : 1, transition:'opacity 0.2s',
            }}>{notSeen.length}</div>
            <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-clock" style={{marginRight:3}} />Not Yet Seen
            </div>
          </div>
        </div>

        {/* ── Tab filter ────────────────────────────── */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}     onClick={() => setTab('all')}>All ({sickReports.length})</button>
          <button style={tabStyle('seen')}    onClick={() => setTab('seen')}>Seen ({seen.length})</button>
          <button style={tabStyle('pending')} onClick={() => setTab('pending')}>Not Seen ({notSeen.length})</button>
        </div>

        {/* ── Patient list ──────────────────────────── */}
        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:40, textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:13}}>
                <i className={`ti ${tab==='seen' ? 'ti-check' : 'ti-stethoscope'}`}
                  style={{fontSize:32, display:'block', marginBottom:8, opacity:0.3}} />
                {tab==='seen'     ? 'No patients have been seen yet today'
                : tab==='pending' ? 'All reported patients have been attended to'
                :                  'No students have reported sick today'}
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
