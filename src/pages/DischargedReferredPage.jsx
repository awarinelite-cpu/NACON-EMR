// src/pages/DischargedReferredPage.jsx
// Live list of students discharged or referred today
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

export default function DischargedReferredPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [tab, setTab] = useState('all'); // 'all' | 'discharged' | 'referred'

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

  const displayed  = tab === 'discharged' ? discharged
                   : tab === 'referred'   ? referred
                   : combined;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const tabStyle = (id) => ({
    flex: 1, padding:'8px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius: 8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color: tab===id ? '#fff' : 'var(--t2)',
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
      </div>

      <div className="page-content" style={{ flex:1 }}>
        {/* Summary cards */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#10b981'}}>{discharged.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Discharged</div>
          </div>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:28,fontWeight:900,color:'#f59e0b'}}>{referred.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Referred</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}       onClick={() => setTab('all')}>All ({combined.length})</button>
          <button style={tabStyle('discharged')} onClick={() => setTab('discharged')}>Discharged ({discharged.length})</button>
          <button style={tabStyle('referred')}   onClick={() => setTab('referred')}>Referred ({referred.length})</button>
        </div>

        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                No records for today
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
