// src/pages/OnAdmissionPage.jsx
// Live list of all students currently on admission in the sick bay
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

export default function OnAdmissionPage() {
  const navigate = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [tab,         setTab]         = useState('all');   // 'all' | 'male' | 'female'
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => {
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const admitted  = patients.filter(p => p.status === 'sickbay');

  // ── Unique classes from admitted patients ─────────────
  const allClasses = [...new Set(admitted.map(p => p.classSet).filter(Boolean))].sort();

  // ── Apply class filter first, then gender tab ─────────
  const byClass = (list) =>
    classFilter === 'all' ? list : list.filter(p => p.classSet === classFilter);

  const classFiltered = byClass(admitted);
  const males         = classFiltered.filter(p => p.sex === 'Male');
  const females       = classFiltered.filter(p => p.sex === 'Female');
  const displayed     = tab === 'male' ? males : tab === 'female' ? females : classFiltered;

  // ── Per-class counts (from all admitted, before gender filter) ──
  const classCounts = {};
  admitted.forEach(p => {
    const c = p.classSet || '—';
    classCounts[c] = (classCounts[c] || 0) + 1;
  });

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const daysAdmitted = (p) => {
    if (!p.updatedAt && !p.registeredAt) return null;
    const ts = p.updatedAt || p.registeredAt;
    const d  = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? '1 day' : `${diff} days`;
  };

  const tabStyle = (id) => ({
    flex: 1, padding:'9px 0', fontSize:12, fontWeight:700,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    background: tab === id ? 'var(--accent)' : 'transparent',
    color:      tab === id ? '#fff'          : 'var(--t2)',
    transition: 'all 0.15s',
  });

  const pillStyle = (val) => ({
    padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:20,
    border:'none', cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
    background: classFilter === val ? '#a855f7' : 'var(--card-bg2)',
    color:      classFilter === val ? '#fff'    : 'var(--t2)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      {/* ── Top bar ──────────────────────────────── */}
      <div className="topbar">
        <button className="btn btn-ghost"
          onClick={() => navigate('/nurse')}
          style={{padding:'6px 10px', flexShrink:0}}
        >
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-bed" style={{color:'#a855f7', marginRight:6}} />
          On Admission
        </div>
        <div style={{
          background:'#a855f7', color:'#fff', borderRadius:20,
          padding:'3px 14px', fontSize:12, fontWeight:800, flexShrink:0,
        }}>{classFiltered.length}</div>
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

        {/* ── Gender summary cards ──────────────────── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab(tab === 'male' ? 'all' : 'male')}
          >
            <div style={{
              fontSize:32, fontWeight:900, color:'#3b82f6', lineHeight:1,
              opacity: tab === 'female' ? 0.4 : 1, transition:'opacity 0.2s'
            }}>{males.length}</div>
            <div style={{fontSize:11, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-gender-male" style={{marginRight:4}} />Male
            </div>
          </div>
          <div className="stat-card" style={{textAlign:'center', cursor:'pointer'}}
            onClick={() => setTab(tab === 'female' ? 'all' : 'female')}
          >
            <div style={{
              fontSize:32, fontWeight:900, color:'#ec4899', lineHeight:1,
              opacity: tab === 'male' ? 0.4 : 1, transition:'opacity 0.2s'
            }}>{females.length}</div>
            <div style={{fontSize:11, color:'var(--t3)', fontWeight:700, marginTop:6}}>
              <i className="ti ti-gender-female" style={{marginRight:4}} />Female
            </div>
          </div>
        </div>

        {/* ── Per-class breakdown (shown when no class selected) ── */}
        {classFilter === 'all' && allClasses.length > 1 && (
          <div style={{
            background:'var(--card-bg)', border:'1px solid var(--border)',
            borderRadius:10, padding:'10px 14px', marginBottom:12,
          }}>
            <div style={{fontSize:10, fontWeight:700, color:'var(--t3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em'}}>
              <i className="ti ti-chart-bar" style={{marginRight:4}} />On Admission by Class
            </div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {Object.entries(classCounts).sort((a,b)=>b[1]-a[1]).map(([cls, cnt]) => (
                <button key={cls} onClick={() => setClassFilter(cls)} style={{
                  padding:'4px 12px', fontSize:11, fontWeight:700, borderRadius:20,
                  border:'none', cursor:'pointer',
                  background:'#f5f3ff', color:'#7c3aed',
                }}>
                  {cls}: {cnt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Gender tab filter ─────────────────────── */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}    onClick={() => setTab('all')}>
            All ({classFiltered.length})
          </button>
          <button style={tabStyle('male')}   onClick={() => setTab('male')}>
            Male ({males.length})
          </button>
          <button style={tabStyle('female')} onClick={() => setTab('female')}>
            Female ({females.length})
          </button>
        </div>

        {/* ── Patient list ─────────────────────────── */}
        <div className="card">
          {displayed.length === 0
            ? <div style={{
                padding:40, textAlign:'center',
                color:'var(--t3)', fontWeight:700, fontSize:13,
              }}>
                <i className="ti ti-bed-off" style={{fontSize:32,display:'block',marginBottom:8,opacity:0.4}} />
                {classFilter !== 'all'
                  ? `No patients from ${classFilter} on admission`
                  : tab === 'male'   ? 'No male patients on admission'
                  : tab === 'female' ? 'No female patients on admission'
                  : 'No patients currently on admission'}
              </div>
            : displayed.map(p => (
                <div key={p.id} className="patient-row"
                  onClick={() => navigate(`/patient/${p.emrNumber}`)}
                  style={{ cursor:'pointer' }}
                >
                  <div className="p-avatar" style={{
                    background: p.sex === 'Female' ? '#fce7f3' : '#dbeafe',
                    color:      p.sex === 'Female' ? '#db2777' : '#1d4ed8',
                    fontWeight: 800,
                  }}>{getInitials(p)}</div>

                  <div className="p-info" style={{flex:1}}>
                    <div className="p-name">{p.surname} {p.firstName}</div>
                    <div className="p-meta">
                      {p.classSet} · {p.sex} · {p.folderNumber}
                    </div>
                  </div>

                  <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4}}>
                    <span className="badge badge-danger">Admitted</span>
                    {daysAdmitted(p) && (
                      <span style={{
                        fontSize:10, fontWeight:700,
                        color: daysAdmitted(p) === 'Today' ? 'var(--success)' : 'var(--warn)',
                      }}>{daysAdmitted(p)}</span>
                    )}
                  </div>
                </div>
              ))
          }
        </div>

        {/* ── EMR tag strip ───────────────────────── */}
        {displayed.length > 0 && (
          <div style={{
            marginTop:12, padding:'10px 14px',
            background:'var(--card-bg)', borderRadius:10,
            border:'1px solid var(--border)',
            fontSize:11, color:'var(--t3)', fontWeight:600, lineHeight:1.8,
          }}>
            {displayed.map(p => (
              <span key={p.id} style={{
                display:'inline-block', marginRight:8,
                background:'var(--accent-bg)', color:'var(--accent)',
                borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700,
              }}>{p.emrNumber}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
