// src/pages/DischargedReferredPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

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

export default function DischargedReferredPage() {
  const navigate = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [tab,         setTab]         = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => { const unsub = listenPatients(setPatients); return unsub; }, []);

  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  const discharged = patients.filter(p => p.status==='discharged' && isToday(p.updatedAt));
  const referred   = patients.filter(p => p.status==='referred'   && isToday(p.updatedAt));
  const combined   = [...discharged, ...referred];
  const allClasses = [...new Set(combined.map(p => p.classSet).filter(Boolean))].sort();
  const byClass    = (list) => classFilter === 'all' ? list : list.filter(p => p.classSet === classFilter);

  const filteredDischarged = byClass(discharged);
  const filteredReferred   = byClass(referred);
  const filteredCombined   = byClass(combined);
  const displayed = tab==='discharged' ? filteredDischarged : tab==='referred' ? filteredReferred : filteredCombined;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const tabStyle = (id) => ({
    flex:1, padding:'8px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius:8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color:      tab===id ? '#fff'          : 'var(--t2)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px',flexShrink:0}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-logout" style={{color:'#10b981',marginRight:6}} />
          Discharged / Referred — Today
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <FilterDropdown allClasses={allClasses} value={classFilter} onChange={setClassFilter} accentColor="#10b981" />
          <div style={{background:'#10b981',color:'#fff',borderRadius:20,padding:'3px 14px',fontSize:12,fontWeight:800}}>
            {filteredCombined.length}
          </div>
        </div>
      </div>

      <div className="page-content" style={{flex:1}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#10b981'}}>{filteredDischarged.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Discharged</div>
          </div>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#f59e0b'}}>{filteredReferred.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Referred</div>
          </div>
        </div>

        <div style={{display:'flex',gap:4,background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,padding:4,marginBottom:12}}>
          <button style={tabStyle('all')}        onClick={() => setTab('all')}>All ({filteredCombined.length})</button>
          <button style={tabStyle('discharged')} onClick={() => setTab('discharged')}>Discharged ({filteredDischarged.length})</button>
          <button style={tabStyle('referred')}   onClick={() => setTab('referred')}>Referred ({filteredReferred.length})</button>
        </div>

        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                {classFilter !== 'all' ? `No records for ${classFilter} today` : 'No records for today'}
              </div>
            : displayed.map(p => (
                <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)} style={{cursor:'pointer'}}>
                  <div className="p-avatar" style={{background:p.status==='discharged'?'#d1fae5':'#fef3c7',color:p.status==='discharged'?'#065f46':'#92400e'}}>{getInitials(p)}</div>
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
