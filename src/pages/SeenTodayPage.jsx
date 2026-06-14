// src/pages/SeenTodayPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday, listenSeenToday } from '../lib/emr';

function FilterDropdown({ allClasses, value, onChange, accentColor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  if (allClasses.length === 0) return null;
  return (
    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: value !== 'all' ? accentColor : 'rgba(255,255,255,0.15)',
        color: '#fff', border: 'none', borderRadius: 16,
        padding: '3px 10px', fontSize: 11, fontWeight: 800,
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <i className="ti ti-filter" style={{ fontSize: 12 }} />
        {value !== 'all' ? value : 'All'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '110%', right: 0, zIndex: 200,
          background: 'var(--card-bg)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '6px', minWidth: 130,
          boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          {['all', ...allClasses].map(cls => (
            <button key={cls} onClick={() => { onChange(cls); setOpen(false); }} style={{
              background: value === cls ? accentColor : 'transparent',
              color: value === cls ? '#fff' : 'var(--t2)',
              border: 'none', borderRadius: 7, padding: '5px 10px',
              fontSize: 11, fontWeight: 800, cursor: 'pointer', textAlign: 'left',
            }}>
              {cls === 'all' ? 'All Classes' : cls}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const seenIds    = new Set(seenToday.map(p => p.id));
  const allSeen    = sickReports.filter(p => seenIds.has(p.id));
  const allClasses = [...new Set(allSeen.map(p => p.classSet).filter(Boolean))].sort();
  const seen       = classFilter === 'all' ? allSeen : allSeen.filter(p => p.classSet === classFilter);

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const methodBadge = (how) => how === 'qr'
    ? { label:'QR',     bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual', bg:'#fef3c7', color:'#92400e' };

  const seenStatusBadge = (p) => {
    if (p.status === 'discharged' && isToday(p.updatedAt))
      return <span className="badge badge-info" style={{fontSize:9,padding:'3px 8px'}}><i className="ti ti-door-exit" style={{marginRight:3}}/>Discharged</span>;
    if (p.status === 'referred' && isToday(p.updatedAt))
      return <span className="badge badge-warn" style={{fontSize:9,padding:'3px 8px'}}><i className="ti ti-transfer" style={{marginRight:3}}/>Referred</span>;
    return <span className="badge badge-ok" style={{fontSize:9,padding:'3px 8px'}}><i className="ti ti-check" style={{marginRight:3}}/>Seen</span>;
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px',flexShrink:0}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-check" style={{color:'var(--success)',marginRight:6}} />
          Seen Today
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <FilterDropdown allClasses={allClasses} value={classFilter} onChange={setClassFilter} accentColor="var(--success)" />
          <div style={{background:'var(--success)',color:'#fff',borderRadius:20,padding:'3px 14px',fontSize:12,fontWeight:800}}>
            {seen.length}
          </div>
        </div>
      </div>

      <div className="page-content" style={{flex:1}}>
        <div className="stat-card" style={{textAlign:'center',marginBottom:12}}>
          <div style={{fontSize:30,fontWeight:900,color:'var(--success)',lineHeight:1}}>{seen.length}</div>
          <div style={{fontSize:10,color:'var(--t3)',fontWeight:700,marginTop:6}}>
            <i className="ti ti-check" style={{marginRight:3}}/>
            {classFilter === 'all' ? 'Seen Today' : `Seen Today — ${classFilter}`}
          </div>
        </div>

        <div className="card">
          {seen.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700,fontSize:13}}>
                <i className="ti ti-check" style={{fontSize:32,display:'block',marginBottom:8,opacity:0.3}}/>
                {classFilter !== 'all' ? `No patients from ${classFilter} have been seen yet today` : 'No patients have been seen yet today'}
              </div>
            : seen.map(p => {
                const mb = methodBadge(p.reportedSickHow);
                return (
                  <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)} style={{cursor:'pointer'}}>
                    <div className="p-avatar" style={{background:p.sex==='Female'?'#fce7f3':'#dbeafe',color:p.sex==='Female'?'#db2777':'#1d4ed8',fontWeight:800}}>{getInitials(p)}</div>
                    <div className="p-info" style={{flex:1}}>
                      <div className="p-name">{p.surname} {p.firstName}</div>
                      <div className="p-meta" style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                        <span>{p.classSet} · {p.sex}</span>
                        <span style={{fontSize:9,fontWeight:800,padding:'1px 5px',borderRadius:4,background:mb.bg,color:mb.color}}>{mb.label}</span>
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3}}>
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
