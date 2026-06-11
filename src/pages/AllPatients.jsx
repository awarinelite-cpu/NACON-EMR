// src/pages/AllPatients.jsx
// Shared patient list used by Doctor, Nurse, Records, Admin
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients } from '../lib/emr';

export default function AllPatients({ role, filter }) {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients, setPatients] = useState([]);
  const [activeFilter, setFilter] = useState(filter || 'all');

  useEffect(() => {
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const filtered = patients.filter(p => {
    if (activeFilter === 'all')     return true;
    if (activeFilter === 'active')  return p.status === 'active';
    if (activeFilter === 'sickbay') return p.status === 'sickbay';
    if (activeFilter === 'discharged') return p.status === 'discharged';
    if (activeFilter === 'referred')   return p.status === 'referred';
    return true;
  });

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls   = s => s==='active'?'badge-danger':s==='discharged'?'badge-ok':
    s==='referred'?'badge-warn':s==='sickbay'?'badge-danger':'badge-info';

  const titles = {
    doctor:'Doctor — All Patients', nurse:'Nurse — All Patients',
    records:'Records — All Case Folders', admin:'Admin — All Patients',
  };

  const FILTERS = [
    { id:'all',        label:'All' },
    { id:'active',     label:'Active / Waiting' },
    { id:'sickbay',    label:'Sick Bay' },
    { id:'discharged', label:'Discharged' },
    { id:'referred',   label:'Referred' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">{titles[role] || 'All Patients'}</div>
        {['doctor','nurse','records'].includes(role) && <PatientSearch />}
        {role === 'records' && (
          <button className="btn btn-primary" onClick={() => navigate('/records/register')}>
            <i className="ti ti-user-plus" /> Register new
          </button>
        )}
      </div>
      <div className="page-content">
        {/* Filter pills */}
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
          {FILTERS.map(f => (
            <button key={f.id}
              className={`btn btn-sm ${activeFilter===f.id?'btn-primary':''}`}
              onClick={() => setFilter(f.id)}>
              {f.label}
              <span style={{ marginLeft:4, fontSize:10, opacity:.8 }}>
                ({patients.filter(p => f.id==='all'||p.status===f.id).length})
              </span>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className="ti ti-users" />
              {filtered.length} patient{filtered.length!==1?'s':''}
            </div>
          </div>
          {filtered.map(p => (
            <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)}>
              <div className="p-avatar" style={{ background:'var(--accent-bg)', color:'var(--accent)' }}>
                {getInitials(p)}
              </div>
              <div className="p-info">
                <div className="p-name">{p.surname} {p.firstName} {p.otherNames}</div>
                <div className="p-meta">{p.classSet} · {p.folderNumber} · {p.matricNo}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                <span className="emr-tag">{p.emrNumber}</span>
                <span className={`badge ${statusCls(p.status)}`}>{p.status}</span>
              </div>
              <i className="ti ti-chevron-right" style={{ fontSize:16, color:'var(--t3)', marginLeft:4 }} />
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
              <i className="ti ti-users-off" style={{ fontSize:32, display:'block', marginBottom:8 }} />
              <div style={{ fontWeight:700 }}>No patients found</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
