// src/pages/AllPatients.jsx
// Shared patient list used by Doctor, Nurse, Records, Admin
// Patients are grouped by class SET (SET 52, SET 51, ...). Admin can add new sets.
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import {
  listenPatients, listenClassSets, addClassSet,
  normalizeClassSet, sortClassSets,
} from '../lib/emr';

export default function AllPatients({ role, filter }) {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients, setPatients]   = useState([]);
  const [classSets, setClassSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [adding, setAdding]       = useState(false);
  const [newSet, setNewSet]       = useState('');
  const [saving, setSaving]       = useState(false);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => listenPatients(setPatients), []);
  useEffect(() => listenClassSets(setClassSets), []);

  // `filter` still comes from the sidebar routes (e.g. /nurse/active, /nurse/sickbay)
  const filtered = patients.filter(p => {
    if (!filter || filter === 'all') return true;
    return p.status === filter;
  });

  // Build groups: every admin-defined set (even if empty) + any set found on patients
  const groups = useMemo(() => {
    const map = {};
    classSets.forEach(c => { map[c] = []; });
    filtered.forEach(p => {
      const key = normalizeClassSet(p.classSet) || 'No set';
      (map[key] = map[key] || []).push(p);
    });
    const keys = sortClassSets(Object.keys(map).filter(k => k !== 'No set'));
    if (map['No set']) keys.push('No set');
    return keys.map(k => ({ name: k, list: map[k] }));
  }, [filtered, classSets]);

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();
  const statusCls   = s => s==='active'?'badge-danger':s==='discharged'?'badge-ok':
    s==='referred'?'badge-warn':s==='sickbay'?'badge-danger':'badge-info';

  const titles = {
    doctor:'Doctor — All Patients', nurse:'All Patients',
    records:'Records — All Case Folders', admin:'Admin — All Patients',
  };

  const handleAddSet = async () => {
    setSaving(true);
    try {
      const added = await addClassSet(newSet, profile?.displayName, profile?.role);
      toast.success(`${added} added`);
      setNewSet('');
      setAdding(false);
    } catch (err) {
      toast.error(err.message || 'Could not add set');
    }
    setSaving(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar topbar-tight">
        <div className="topbar-title">{titles[role] || 'All Patients'}</div>
        {['doctor','nurse','records'].includes(role) && <PatientSearch />}
        {role === 'records' && (
          <button className="btn btn-primary" onClick={() => navigate('/records/register')}>
            <i className="ti ti-user-plus" /> Register new
          </button>
        )}
        {role === 'admin' && (
          <button className="btn btn-primary" onClick={() => navigate('/admin/patients/bulk-import')}>
            <i className="ti ti-file-upload" /> Bulk import (CSV)
          </button>
        )}
      </div>
      <div className="page-content">
        {!selectedSet ? (
          <>
            {/* SET cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12 }}>
              {groups.map(g => (
                <div key={g.name} className="card"
                  onClick={() => setSelectedSet(g.name)}
                  style={{ cursor:'pointer', marginBottom:0, textAlign:'center', padding:'18px 10px' }}>
                  <i className="ti ti-users-group" style={{ fontSize:26, color:'var(--accent)' }} />
                  <div style={{ fontSize:18, fontWeight:800, marginTop:6 }}>{g.name}</div>
                  <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                    {g.list.length} patient{g.list.length!==1?'s':''}
                  </div>
                </div>
              ))}

              {/* Admin: add a new SET */}
              {isAdmin && (
                !adding ? (
                  <div className="card" onClick={() => setAdding(true)}
                    style={{ cursor:'pointer', marginBottom:0, textAlign:'center', padding:'18px 10px',
                             borderStyle:'dashed', color:'var(--t3)' }}>
                    <i className="ti ti-plus" style={{ fontSize:26 }} />
                    <div style={{ fontSize:14, fontWeight:700, marginTop:6 }}>Add set</div>
                  </div>
                ) : (
                  <div className="card" style={{ marginBottom:0, padding:'14px 10px', borderStyle:'dashed' }}>
                    <input
                      className="form-input"
                      placeholder="e.g. SET 53"
                      value={newSet}
                      autoFocus
                      onChange={e => setNewSet(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newSet.trim()) handleAddSet(); }}
                    />
                    <div style={{ display:'flex', gap:6, marginTop:8, justifyContent:'center' }}>
                      <button className="btn btn-sm btn-primary" disabled={saving || !newSet.trim()} onClick={handleAddSet}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn-sm" onClick={() => { setAdding(false); setNewSet(''); }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {groups.length === 0 && (
              <div className="card">
                <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
                  <i className="ti ti-users-off" style={{ fontSize:32, display:'block', marginBottom:8 }} />
                  <div style={{ fontWeight:700 }}>No patients found</div>
                </div>
              </div>
            )}
          </>
        ) : (
          (() => {
            const g = groups.find(x => x.name === selectedSet) || { name: selectedSet, list: [] };
            return (
              <>
                <button className="btn btn-sm" style={{ marginBottom:12 }} onClick={() => setSelectedSet(null)}>
                  <i className="ti ti-arrow-left" /> All sets
                </button>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <i className="ti ti-users" />
                      {g.name} · {g.list.length} patient{g.list.length!==1?'s':''}
                    </div>
                  </div>
                  {g.list.map(p => (
                    <div key={p.id} className="patient-row" onClick={() => navigate(`/patient/${p.emrNumber}`)}>
                      <div className="p-avatar" style={{ background:'var(--accent-bg)', color:'var(--accent)' }}>
                        {getInitials(p)}
                      </div>
                      <div className="p-info">
                        <div className="p-name">{p.surname} {p.firstName} {p.otherNames}</div>
                        <div className="p-meta">{p.classSet} · {p.folderNumber} · {p.matricNo}
                          {p.patientIdentity && (
                            <span style={{
                              marginLeft:6, fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4,
                              background: p.patientIdentity === 'Soldier' ? 'rgba(29,78,216,.12)' : 'rgba(124,58,237,.12)',
                              color: p.patientIdentity === 'Soldier' ? '#1d4ed8' : '#7c3aed',
                            }}>
                              {p.patientIdentity === 'Soldier' ? '🪖' : '👤'} {p.patientIdentity}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                        <span className="emr-tag">{p.emrNumber}</span>
                        <span className={`badge ${statusCls(p.status)}`}>{p.status}</span>
                      </div>
                      {role === 'records' && (
                        <button
                          className="btn btn-sm"
                          onClick={e => { e.stopPropagation(); navigate(`/records/edit/${p.emrNumber}`); }}
                          style={{ marginLeft:4, flexShrink:0 }}
                          title="Edit patient record"
                        >
                          <i className="ti ti-edit" />
                        </button>
                      )}
                      <i className="ti ti-chevron-right" style={{ fontSize:16, color:'var(--t3)', marginLeft:4 }} />
                    </div>
                  ))}
                  {g.list.length === 0 && (
                    <div style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:12 }}>
                      No patients in {g.name} yet
                    </div>
                  )}
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
