// src/pages/OnAdmissionPage.jsx
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

export default function OnAdmissionPage() {
  const navigate = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [tab,         setTab]         = useState('all');
  const [classFilter, setClassFilter] = useState('all');

  useEffect(() => { const unsub = listenPatients(setPatients); return unsub; }, []);

  const admitted   = patients.filter(p => p.status === 'sickbay');
  const allClasses = [...new Set(admitted.map(p => p.classSet).filter(Boolean))].sort();
  const byClass    = (list) => classFilter === 'all' ? list : list.filter(p => p.classSet === classFilter);
  const filtered   = byClass(admitted);
  const males      = filtered.filter(p => p.sex === 'Male');
  const females    = filtered.filter(p => p.sex === 'Female');
  const displayed  = tab === 'male' ? males : tab === 'female' ? females : filtered;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const daysAdmitted = (p) => {
    if (!p.updatedAt && !p.registeredAt) return null;
    const ts = p.updatedAt || p.registeredAt;
    const d  = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? '1 day' : `${diff} days`;
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
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px',flexShrink:0}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-bed" style={{color:'#a855f7',marginRight:6}} />
          On Admission
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
          <FilterDropdown allClasses={allClasses} value={classFilter} onChange={setClassFilter} accentColor="#a855f7" />
          <div style={{background:'#a855f7',color:'#fff',borderRadius:20,padding:'3px 14px',fontSize:12,fontWeight:800}}>
            {filtered.length}
          </div>
        </div>
      </div>

      <div className="page-content" style={{flex:1}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center',cursor:'pointer'}} onClick={() => setTab(tab==='male'?'all':'male')}>
            <div style={{fontSize:32,fontWeight:900,color:'#3b82f6',lineHeight:1,opacity:tab==='female'?0.4:1,transition:'opacity 0.2s'}}>{males.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:6}}><i className="ti ti-gender-male" style={{marginRight:4}}/>Male</div>
          </div>
          <div className="stat-card" style={{textAlign:'center',cursor:'pointer'}} onClick={() => setTab(tab==='female'?'all':'female')}>
            <div style={{fontSize:32,fontWeight:900,color:'#ec4899',lineHeight:1,opacity:tab==='male'?0.4:1,transition:'opacity 0.2s'}}>{females.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:6}}><i className="ti ti-gender-female" style={{marginRight:4}}/>Female</div>
          </div>
        </div>

        <div style={{display:'flex',gap:4,background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:10,padding:4,marginBottom:12}}>
          <button style={tabStyle('all')}    onClick={() => setTab('all')}>All ({filtered.length})</button>
          <button style={tabStyle('male')}   onClick={() => setTab('male')}>Male ({males.length})</button>
          <button style={tabStyle('female')} onClick={() => setTab('female')}>Female ({females.length})</button>
        </div>

        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700,fontSize:13}}>
                <i className="ti ti-bed-off" style={{fontSize:32,display:'block',marginBottom:8,opacity:0.4}}/>
                {classFilter !== 'all' ? `No patients from ${classFilter} on admission`
                : tab==='male' ? 'No male patients on admission'
                : tab==='female' ? 'No female patients on admission'
                : 'No patients currently on admission'}
              </div>
            : displayed.map(p => (
                <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)} style={{cursor:'pointer'}}>
                  <div className="p-avatar" style={{background:p.sex==='Female'?'#fce7f3':'#dbeafe',color:p.sex==='Female'?'#db2777':'#1d4ed8',fontWeight:800}}>{getInitials(p)}</div>
                  <div className="p-info" style={{flex:1}}>
                    <div className="p-name">{p.surname} {p.firstName}</div>
                    <div className="p-meta">{p.classSet} · {p.sex} · {p.folderNumber}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                    <span className="badge badge-danger">Admitted</span>
                    {daysAdmitted(p) && <span style={{fontSize:10,fontWeight:700,color:daysAdmitted(p)==='Today'?'var(--success)':'var(--warn)'}}>{daysAdmitted(p)}</span>}
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
