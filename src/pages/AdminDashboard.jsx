// src/pages/AdminDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { listenPatients, getTodayStats, getAllUsers } from '../lib/emr';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [stats,   setStats]   = useState({});
  const [users,   setUsers]   = useState([]);
  const [patients,setPatients]= useState([]);

  useEffect(() => {
    getTodayStats().then(setStats);
    getAllUsers().then(setUsers);
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const roleBadge = r => ({
    doctor:'badge-ok', nurse:'badge-info', records:'badge-warn',
    admin:'badge-danger', subadmin:'badge-neutral',
  }[r]||'badge-neutral');

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Admin Dashboard</div>
        <button className="btn" onClick={()=>navigate('/admin/users')}>
          <i className="ti ti-user-cog" /> Manage users
        </button>
        <button className="btn btn-primary" onClick={()=>navigate('/admin/users')}>
          <i className="ti ti-user-plus" /> Add staff user
        </button>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          {[
            { label:'Total patients',  value:stats.totalPatients||0,  icon:'ti-users',     color:'var(--accent)'  },
            { label:'Staff accounts',  value:users.length,            icon:'ti-user-cog',  color:'var(--info)'    },
            { label:'Visits today',    value:stats.visitsToday||0,    icon:'ti-stethoscope',color:'var(--success)'},
            { label:'Referrals today', value:stats.referred||0,       icon:'ti-file-export',color:'var(--warn)'   },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label"><i className={`ti ${s.icon}`} style={{color:s.color}} />{s.label}</div>
              <div className="stat-value">{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-user-cog" />Staff accounts</div>
              <span className="card-action" onClick={()=>navigate('/admin/users')}>Manage →</span>
            </div>
            {users.map(u => (
              <div key={u.uid} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'var(--accent-bg)',
                  color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:11,fontWeight:700,flexShrink:0}}>
                  {(u.displayName||'U').slice(0,2).toUpperCase()}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t1)'}}>{u.displayName}</div>
                  <div style={{fontSize:10,color:'var(--t3)'}}>{u.email}</div>
                </div>
                <span className={`badge ${roleBadge(u.role)}`}>{u.role}</span>
                <span className={`badge ${u.active?'badge-ok':'badge-neutral'}`}>
                  {u.active?'Active':'Inactive'}
                </span>
              </div>
            ))}
            {users.length===0&&<div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No staff users yet</div>}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title"><i className="ti ti-activity" />Recent activity</div>
            </div>
            {patients.slice(0,6).map(p => (
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderBottom:'1px solid var(--border)'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'var(--accent)',flexShrink:0}} />
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t1)'}}>Patient registered</div>
                  <div style={{fontSize:10,color:'var(--t3)'}}>{p.surname} {p.firstName} — {p.emrNumber}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
