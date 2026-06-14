// src/pages/SickReportPage.jsx
// Live list of students who reported sick today (via QR or manual nurse entry)
// Counts ONLY patients with reportedSickAt = today — discharged patients excluded
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenSickReportsToday } from '../lib/emr';

export default function SickReportPage() {
  const navigate  = useNavigate();
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    const unsub = listenSickReportsToday(setPatients);
    return unsub;
  }, []);

  const males   = patients.filter(p => p.sex === 'Male');
  const females = patients.filter(p => p.sex === 'Female');

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const methodBadge = (how) => how === 'qr'
    ? { label:'QR Scan', bg:'#dbeafe', color:'#1d4ed8' }
    : { label:'Manual',  bg:'#fef3c7', color:'#92400e' };

  const statusCls   = s => s==='discharged'?'badge-ok':s==='referred'?'badge-warn':s==='sickbay'?'badge-danger':'badge-info';
  const statusLabel = s => s==='discharged'?'Discharged':s==='referred'?'Referred':s==='sickbay'?'Admitted':s==='active'?'In Clinic':'Waiting';

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate('/nurse')} style={{padding:'6px 10px', flexShrink:0}}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-stethoscope" style={{color:'#f97316', marginRight:6}} />
          Sick Report — Today
        </div>
        <div style={{
          background:'#f97316', color:'#fff', borderRadius:20,
          padding:'3px 14px', fontSize:12, fontWeight:800, flexShrink:0,
        }}>{patients.length}</div>
      </div>

      <div className="page-content" style={{ flex:1 }}>

        {/* Gender summary */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:900,color:'#3b82f6',lineHeight:1}}>{males.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:6}}>
              <i className="ti ti-gender-male" style={{marginRight:4}} />Male
            </div>
          </div>
          <div className="stat-card" style={{textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:900,color:'#ec4899',lineHeight:1}}>{females.length}</div>
            <div style={{fontSize:11,color:'var(--t3)',fontWeight:700,marginTop:6}}>
              <i className="ti ti-gender-female" style={{marginRight:4}} />Female
            </div>
          </div>
        </div>

        {/* Patient list */}
        <div className="card">
          {patients.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700,fontSize:13}}>
                <i className="ti ti-stethoscope" style={{fontSize:32,display:'block',marginBottom:8,opacity:0.3}} />
                No students have reported sick today
              </div>
            : patients.map(p => {
                const mb = methodBadge(p.reportedSickHow);
                return (
                  <div key={p.id} className="patient-row"
                    onClick={() => navigate(`/patient/${p.emrNumber}`)}
                    style={{ cursor:'pointer' }}
                  >
                    <div className="p-avatar" style={{
                      background: p.sex==='Female'?'#fce7f3':'#dbeafe',
                      color:      p.sex==='Female'?'#db2777':'#1d4ed8',
                      fontWeight:800,
                    }}>{getInitials(p)}</div>

                    <div className="p-info" style={{flex:1}}>
                      <div className="p-name">{p.surname} {p.firstName}</div>
                      <div className="p-meta" style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
                        <span>{p.classSet} · {p.sex} · {p.folderNumber}</span>
                        <span style={{
                          fontSize:9,fontWeight:800,padding:'1px 6px',borderRadius:4,
                          background:mb.bg, color:mb.color,
                        }}>{mb.label}</span>
                      </div>
                    </div>

                    <span className={`badge ${statusCls(p.status)}`}>
                      {statusLabel(p.status)}
                    </span>
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
