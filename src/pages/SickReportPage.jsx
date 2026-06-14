// src/pages/SickReportPage.jsx
// Live list of students who reported sick today
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

export default function SickReportPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);

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

  const todayPatients = patients.filter(p => isToday(p.updatedAt) || isToday(p.registeredAt));

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls = s => s==='discharged'?'badge-ok':s==='referred'?'badge-warn':s==='sickbay'?'badge-danger':'badge-info';
  const statusLabel = s => s==='discharged'?'Discharged':s==='referred'?'Referred':s==='sickbay'?'Admitted':s==='active'?'In Clinic':'Waiting';

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px'}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-stethoscope" style={{color:'#f97316',marginRight:6}} />
          Sick Report — Today
        </div>
        <div style={{
          background:'#f97316', color:'#fff', borderRadius:20,
          padding:'3px 12px', fontSize:12, fontWeight:800
        }}>{todayPatients.length}</div>
      </div>

      <div className="page-content" style={{ flex:1 }}>
        <div className="card">
          {todayPatients.length === 0
            ? <div style={{padding:32,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                No students have reported sick today
              </div>
            : todayPatients.map(p => (
                <div key={p.id} className="patient-row"
                  onClick={() => navigate(`/patient/${p.emrNumber}`)}
                  style={{ cursor:'pointer' }}
                >
                  <div className="p-avatar" style={{
                    background: p.sex==='Female'?'#fce7f3':'#dbeafe',
                    color: p.sex==='Female'?'#db2777':'#1d4ed8'
                  }}>{getInitials(p)}</div>
                  <div className="p-info">
                    <div className="p-name">{p.surname} {p.firstName}</div>
                    <div className="p-meta">{p.classSet} · {p.sex} · {p.folderNumber}</div>
                  </div>
                  <span className={`badge ${statusCls(p.status)}`}>{statusLabel(p.status)}</span>
                </div>
              ))
          }
        </div>

        {/* Gender summary */}
        {todayPatients.length > 0 && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12}}>
            <div className="stat-card" style={{textAlign:'center'}}>
              <div style={{fontSize:28,fontWeight:900,color:'#3b82f6'}}>{todayPatients.filter(p=>p.sex==='Male').length}</div>
              <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Male</div>
            </div>
            <div className="stat-card" style={{textAlign:'center'}}>
              <div style={{fontSize:28,fontWeight:900,color:'#ec4899'}}>{todayPatients.filter(p=>p.sex==='Female').length}</div>
              <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:4}}>Female</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
