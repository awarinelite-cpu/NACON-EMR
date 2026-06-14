// src/pages/DischargedReferredPage.jsx
// Live list of students discharged or referred today
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

export default function DischargedReferredPage() {
  const navigate = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [tab,         setTab]         = useState('all');  // 'all' | 'discharged' | 'referred'
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  const discharged = patients.filter(p => p.status === 'discharged' && isToday(p.updatedAt));
  const referred   = patients.filter(p => p.status === 'referred'   && isToday(p.updatedAt));
  const combined   = [...discharged, ...referred];

  // ── Unique classes from today's D/R patients ──────────
  const allClasses = [...new Set(combined.map(p => p.classSet).filter(Boolean))].sort();

  // ── Apply class filter ────────────────────────────────
  const byClass = (list) =>
    classFilter === 'all' ? list : list.filter(p => p.classSet === classFilter);

  const filteredDischarged = byClass(discharged);
  const filteredReferred   = byClass(referred);
  const filteredCombined   = byClass(combined);

  const displayed = tab === 'discharged' ? filteredDischarged
                  : tab === 'referred'   ? filteredReferred
                  : filteredCombined;

  // ── Per-class counts (from full combined, before tab) ──
  const classCounts = {};
  combined.forEach(p => {
    const c = p.classSet || '—';
    classCounts[c] = (classCounts[c] || 0) + 1;
  });

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const tabStyle = (id) => ({
    flex: 1, padding:'8px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius: 8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color: tab===id ? '#fff' : 'var(--t2)',
    transition: 'all 0.15s',
  });

  const pillStyle = (val) => ({
    padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:20,
    border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
    background: classFilter === val ? '#10b981' : 'var(--card-bg2)',
    color:      classFilter === val ? '#fff'    : 'var(--t2)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px'}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-logout" style={{color:'#10b981',marginRight:6}} />
          Discharged / Referred — Today
        </div>
        <div style={{
          background:'#10b981', color:'#fff', borderRadius:20,
          padding:'3px 14px', fontSize:12, fontWeight:800, flexShrink:0,
        }}>{filteredCombined.length}</div>
      </div>

      <div className="page-content" style={{ flex:1 }}>

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

        {/* ── Summary cards ────────────────────────────── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#10b981'}}>{filteredDischarged.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Discharged</div>
          </div>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#f59e0b'}}>{filteredReferred.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Referred</div>
          </div>
        </div>

        {/* ── Per-class breakdown ───────────────────────── */}
        {classFilter === 'all' && allClasses.length > 1 && (
          <div style={{
            background:'var(--card-bg)', border:'1px solid var(--border)',
            borderRadius:10, padding:'10px 14px', marginBottom:12,
          }}>
            <div style={{fontSize:10, fontWeight:700, color:'var(--t3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em'}}>
              <i className="ti ti-chart-bar" style={{marginRight:4}} />Discharged / Referred by Class
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

        {/* ── Tab switcher ─────────────────────────────── */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}        onClick={() => setTab('all')}>All ({filteredCombined.length})</button>
          <button style={tabStyle('discharged')} onClick={() => setTab('discharged')}>Discharged ({filteredDischarged.length})</button>
          <button style={tabStyle('referred')}   onClick={() => setTab('referred')}>Referred ({filteredReferred.length})</button>
        </div>

        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                {classFilter !== 'all'
                  ? `No records for ${classFilter} today`
                  : 'No records for today'}
              </div>
            : displayed.map(p => (
                <div key={p.id} className="patient-row"
                  onClick={() => navigate(`/patient/${p.emrNumber}`)}
                  style={{ cursor:'pointer' }}
                >
                  <div className="p-avatar" style={{
                    background: p.status==='discharged'?'#d1fae5':'#fef3c7',
                    color: p.status==='discharged'?'#065f46':'#92400e',
                  }}>{getInitials(p)}</div>
                  <div className="p-info">
                    <div className="p-name">{p.surname} {p.firstName}</div>
                    <div className="p-meta">{p.classSet} · {p.sex} · {p.folderNumber}</div>
                  </div>
                  <span className={`badge ${p.status==='discharged'?'badge-ok':'badge-warn'}`}>
                    {p.status==='discharged'?'Discharged':'Referred'}
                  </span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
