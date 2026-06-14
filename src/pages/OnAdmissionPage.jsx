// src/pages/OnAdmissionPage.jsx
// Live list of all students currently on admission in the sick bay
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenPatients } from '../lib/emr';

export default function OnAdmissionPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [tab, setTab] = useState('all'); // 'all' | 'male' | 'female'

  useEffect(() => {
    const unsub = listenPatients(setPatients);
    return unsub;
  }, []);

  const admitted  = patients.filter(p => p.status === 'sickbay');
  const males     = admitted.filter(p => p.sex === 'Male');
  const females   = admitted.filter(p => p.sex === 'Female');
  const displayed = tab === 'male' ? males : tab === 'female' ? females : admitted;

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  const tabStyle = (id) => ({
    flex: 1, padding:'9px 0', fontSize:12, fontWeight:700,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    background: tab === id ? 'var(--accent)' : 'transparent',
    color:      tab === id ? '#fff'          : 'var(--t2)',
    transition: 'all 0.15s',
  });

  // Days on admission
  const daysAdmitted = (p) => {
    if (!p.updatedAt && !p.registeredAt) return null;
    const ts = p.updatedAt || p.registeredAt;
    const d  = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    return diff === 0 ? 'Today' : diff === 1 ? '1 day' : `${diff} days`;
  };

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
        }}>{admitted.length}</div>
      </div>

      <div className="page-content" style={{ flex:1 }}>

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

        {/* ── Tab filter ───────────────────────────── */}
        <div style={{
          display:'flex', gap:4, background:'var(--card-bg)',
          border:'1px solid var(--border)', borderRadius:10,
          padding:4, marginBottom:12,
        }}>
          <button style={tabStyle('all')}    onClick={() => setTab('all')}>
            All ({admitted.length})
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
                {tab === 'male'   ? 'No male patients on admission'
                : tab === 'female'? 'No female patients on admission'
                : 'No patients currently on admission'}
              </div>
            : displayed.map(p => (
                <div key={p.id} className="patient-row"
                  onClick={() => navigate(`/patient/${p.emrNumber}`)}
                  style={{ cursor:'pointer' }}
                >
                  {/* Avatar with gender colour */}
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

        {/* ── EMR tag strip at bottom ───────────────── */}
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
