// src/pages/SeenTodayPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function SeenTodayPage() {
  const navigate = useNavigate();
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);

  useEffect(() => {
    const u1 = listenSickReportsToday(setSickReports);
    const u2 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); };
  }, []);

  // Today boundary for discharged/referred check
  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  // Seen today = reported sick today AND seen today
  const seenIds = new Set(seenToday.map(p => p.id));
  const seen    = sickReports.filter(p => seenIds.has(p.id));

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const methodBadge = (how) => how === 'qr'
    ? { label:'QR',     bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual', bg:'#fef3c7', color:'#92400e' };

  // Status badge — discharged/referred today gets its own badge, else "Seen"
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

        {/* ── Summary card ───────────────────────────── */}
        <div className="stat-card" style={{textAlign:'center', marginBottom:12}}>
          <div style={{fontSize:30, fontWeight:900, color:'var(--success)', lineHeight:1}}>{seen.length}</div>
          <div style={{fontSize:10, color:'var(--t3)', fontWeight:700, marginTop:6}}>
            <i className="ti ti-check" style={{marginRight:3}} />Seen Today
          </div>
        </div>

        {/* ── Patient list ──────────────────────────── */}
        <div className="card">
          {seen.length === 0
            ? <div style={{padding:40, textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:13}}>
                <i className="ti ti-check"
                  style={{fontSize:32, display:'block', marginBottom:8, opacity:0.3}} />
                No patients have been seen yet today
              </div>
            : seen.map(p => {
                const mb = methodBadge(p.reportedSickHow);
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
