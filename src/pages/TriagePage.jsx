// src/pages/TriagePage.jsx
// ─────────────────────────────────────────────
// Triage System — assign priority on arrival
// P1 Emergency · P2 Urgent · P3 Routine
// Visible to: nurse, doctor, admin
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import {
  listenTriageQueue, assignTriage, updateTriageStatus,
  searchPatients, formatTime, formatTs,
} from '../lib/emr';

// ── Priority config ──────────────────────────
const PRIORITY = {
  P1: {
    label: 'P1 — Emergency',
    short: 'P1',
    color: '#B82020',
    bg:    '#FDECEC',
    border:'#F06B6B',
    icon:  'ti-urgent',
    desc:  'Life-threatening. See immediately.',
  },
  P2: {
    label: 'P2 — Urgent',
    short: 'P2',
    color: '#9A6000',
    bg:    '#FEF3DC',
    border:'#F0B429',
    icon:  'ti-alert-triangle',
    desc:  'Serious but stable. See within 30 min.',
  },
  P3: {
    label: 'P3 — Routine',
    short: 'P3',
    color: '#1A5FA8',
    bg:    '#E6F0FB',
    border:'#2E7FDB',
    icon:  'ti-clock',
    desc:  'Non-urgent. Queue in order.',
  },
};

const STATUS_COLORS = {
  waiting:    { color:'var(--warn)',    bg:'var(--warn-bg)',    label:'Waiting'     },
  'with-doctor': { color:'var(--success)', bg:'var(--success-bg)', label:'With Doctor' },
  done:       { color:'var(--t3)',      bg:'var(--card-bg2)',   label:'Done'        },
};

export default function TriagePage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [queue,        setQueue]        = useState([]);
  const [showForm,     setShowForm]     = useState(false);
  const [searchResults,setSearchResults]= useState([]);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [searching,    setSearching]    = useState(false);
  const [selectedPt,   setSelectedPt]   = useState(null);
  const [priority,     setPriority]     = useState('P3');
  const [chiefComp,    setChiefComp]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterStatus,   setFilterStatus]   = useState('ALL');

  // Live triage queue
  useEffect(() => {
    const unsub = listenTriageQueue(setQueue);
    return unsub;
  }, []);

  // Patient search
  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPatients(searchTerm);
        setSearchResults(results.slice(0, 6));
      } catch { /* ignore */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Save triage entry ──
  const handleSave = async () => {
    if (!selectedPt) { toast.error('Select a patient first'); return; }
    if (!chiefComp.trim()) { toast.error('Enter chief complaint'); return; }
    setSaving(true);
    try {
      await assignTriage(
        selectedPt.emrNumber,
        { priority, chiefComplaint: chiefComp },
        profile.displayName,
        profile.role,
      );
      toast.success(`${selectedPt.surname} ${selectedPt.firstName} triaged as ${priority}`);
      setShowForm(false);
      setSelectedPt(null);
      setSearchTerm('');
      setSearchResults([]);
      setPriority('P3');
      setChiefComp('');
    } catch (e) {
      toast.error('Failed to save triage');
    }
    setSaving(false);
  };

  // ── Update queue status ──
  const handleStatusChange = async (triageId, newStatus) => {
    try {
      await updateTriageStatus(triageId, newStatus, profile.displayName, profile.role);
      if (newStatus === 'done') toast.success('Marked as done');
      if (newStatus === 'with-doctor') toast.success('Moved to "With Doctor"');
    } catch {
      toast.error('Failed to update status');
    }
  };

  // ── Filtered queue ──
  const filtered = queue.filter(t => {
    const pMatch = filterPriority === 'ALL' || t.priority === filterPriority;
    const sMatch = filterStatus   === 'ALL' || t.status   === filterStatus;
    return pMatch && sMatch;
  });

  const counts = {
    P1: queue.filter(t => t.priority === 'P1' && t.status !== 'done').length,
    P2: queue.filter(t => t.priority === 'P2' && t.status !== 'done').length,
    P3: queue.filter(t => t.priority === 'P3' && t.status !== 'done').length,
    waiting:    queue.filter(t => t.status === 'waiting').length,
    withDoctor: queue.filter(t => t.status === 'with-doctor').length,
    done:       queue.filter(t => t.status === 'done').length,
  };

  const getInitials = p => ((p.surname?.[0] || '') + (p.firstName?.[0] || '')).toUpperCase();

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-urgent" style={{ marginRight:6, color:'var(--danger)' }} />
          Triage Queue
        </div>
        <PatientSearch />
        <button
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          <i className="ti ti-plus" /> Triage Patient
        </button>
      </div>

      <div className="page-content" style={{ overflowY:'auto' }}>

        {/* ── SUMMARY CARDS ── */}
        <div className="stats-grid" style={{ marginBottom:16 }}>
          {[
            { label:'P1 Emergency', value:counts.P1, color:'var(--danger)',  bg:'var(--danger-bg)',  icon:'ti-urgent'         },
            { label:'P2 Urgent',    value:counts.P2, color:'var(--warn)',    bg:'var(--warn-bg)',    icon:'ti-alert-triangle' },
            { label:'P3 Routine',   value:counts.P3, color:'var(--accent)',  bg:'var(--accent-bg)',  icon:'ti-clock'          },
            { label:'Waiting',      value:counts.waiting,    color:'var(--warn)',    bg:'var(--warn-bg)',    icon:'ti-hourglass'      },
            { label:'With Doctor',  value:counts.withDoctor, color:'var(--success)', bg:'var(--success-bg)', icon:'ti-stethoscope'    },
            { label:'Done Today',   value:counts.done,       color:'var(--t3)',      bg:'var(--card-bg2)',   icon:'ti-check'          },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ borderTop:`3px solid ${s.color}` }}>
              <div className="stat-label">
                <i className={`ti ${s.icon}`} style={{ color:s.color }} />
                {s.label}
              </div>
              <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── FILTERS ── */}
        <div style={{
          display:'flex', gap:8, flexWrap:'wrap', marginBottom:14,
          alignItems:'center',
        }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)', marginRight:4 }}>Filter:</span>
          {['ALL','P1','P2','P3'].map(p => (
            <button key={p} onClick={() => setFilterPriority(p)} style={{
              padding:'4px 12px', borderRadius:20, border:'1.5px solid',
              borderColor: filterPriority === p ? (PRIORITY[p]?.color || 'var(--accent)') : 'var(--border)',
              background:  filterPriority === p ? (PRIORITY[p]?.bg   || 'var(--accent-bg)') : 'transparent',
              color:       filterPriority === p ? (PRIORITY[p]?.color || 'var(--accent)') : 'var(--t3)',
              fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'var(--font)',
            }}>
              {p === 'ALL' ? 'All priorities' : PRIORITY[p].label}
            </button>
          ))}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          {['ALL','waiting','with-doctor','done'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{
              padding:'4px 12px', borderRadius:20, border:'1.5px solid',
              borderColor: filterStatus === s ? 'var(--accent)' : 'var(--border)',
              background:  filterStatus === s ? 'var(--accent-bg)' : 'transparent',
              color:       filterStatus === s ? 'var(--accent)' : 'var(--t3)',
              fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'var(--font)',
            }}>
              {s === 'ALL' ? 'All statuses' : STATUS_COLORS[s]?.label || s}
            </button>
          ))}
        </div>

        {/* ── QUEUE TABLE ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className="ti ti-list-check" />
              Active Triage Queue
            </div>
            <span style={{ fontSize:11, color:'var(--t3)' }}>
              {filtered.length} patient{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div style={{
              padding:48, textAlign:'center', color:'var(--t3)',
              display:'flex', flexDirection:'column', alignItems:'center', gap:10,
            }}>
              <i className="ti ti-clipboard-check" style={{ fontSize:40 }} />
              <div style={{ fontWeight:700, fontSize:14 }}>
                {queue.length === 0 ? 'No patients in triage queue' : 'No patients match current filter'}
              </div>
              <div style={{ fontSize:11 }}>Use "Triage Patient" to add a patient to the queue</div>
            </div>
          ) : (
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width:36 }}>#</th>
                  <th>Priority</th>
                  <th>Patient</th>
                  <th>Class / Set</th>
                  <th>Chief Complaint</th>
                  <th>Arrived</th>
                  <th>Status</th>
                  <th>Triaged by</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, idx) => {
                  const pr  = PRIORITY[t.priority] || PRIORITY.P3;
                  const st  = STATUS_COLORS[t.status] || STATUS_COLORS.waiting;
                  return (
                    <tr key={t.id} style={{
                      borderLeft: `3px solid ${pr.color}`,
                      background: t.priority === 'P1' && t.status === 'waiting'
                        ? pr.bg + '44' : 'transparent',
                    }}>
                      <td style={{ fontWeight:700, color:'var(--t3)', fontSize:11 }}>
                        {idx + 1}
                      </td>
                      <td>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          padding:'3px 10px', borderRadius:20,
                          background: pr.bg, color: pr.color,
                          border:`1px solid ${pr.border}`,
                          fontSize:11, fontWeight:700,
                        }}>
                          <i className={`ti ${pr.icon}`} style={{ fontSize:11 }} />
                          {pr.short}
                        </span>
                      </td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}
                          onClick={() => navigate(`/patient/${t.emrNumber}`)}>
                          <div style={{
                            width:30, height:30, borderRadius:'50%',
                            background: pr.bg, color: pr.color,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:11, fontWeight:700, flexShrink:0,
                          }}>
                            {getInitials(t)}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13 }}>{t.surname} {t.firstName}</div>
                            <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>{t.emrNumber}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize:12, color:'var(--t2)' }}>{t.classSet || '—'}</td>
                      <td style={{ fontSize:12, maxWidth:200 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {t.chiefComplaint || '—'}
                        </div>
                      </td>
                      <td style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--mono)', whiteSpace:'nowrap' }}>
                        {formatTime(t.arrivedAt)}
                      </td>
                      <td>
                        <span style={{
                          padding:'3px 10px', borderRadius:20,
                          background: st.bg, color: st.color,
                          fontSize:11, fontWeight:700,
                        }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ fontSize:11, color:'var(--t3)' }}>{t.triagedBy}</td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          {t.status === 'waiting' && (
                            <button
                              className="btn btn-sm"
                              style={{ background:'var(--success-bg)', color:'var(--success)', border:'1px solid var(--success)', fontSize:11 }}
                              onClick={() => handleStatusChange(t.id, 'with-doctor')}
                            >
                              <i className="ti ti-stethoscope" /> See Doctor
                            </button>
                          )}
                          {t.status === 'with-doctor' && (
                            <button
                              className="btn btn-sm"
                              style={{ background:'var(--card-bg2)', color:'var(--t2)', border:'1px solid var(--border)', fontSize:11 }}
                              onClick={() => handleStatusChange(t.id, 'done')}
                            >
                              <i className="ti ti-check" /> Done
                            </button>
                          )}
                          <button
                            className="btn btn-sm"
                            style={{ fontSize:11 }}
                            onClick={() => navigate(`/patient/${t.emrNumber}`)}
                          >
                            <i className="ti ti-eye" /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {/* ══ TRIAGE FORM MODAL ══ */}
      {showForm && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1000, padding:20,
        }}>
          <div style={{
            background:'var(--card-bg)', borderRadius:16,
            width:'100%', maxWidth:520,
            boxShadow:'var(--shadow-md)',
            overflow:'hidden',
            maxHeight:'90vh', overflowY:'auto',
          }}>

            {/* Modal header */}
            <div style={{
              padding:'16px 20px',
              borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <i className="ti ti-urgent" style={{ fontSize:20, color:'var(--danger)' }} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>Triage Patient</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>Assign priority on arrival</div>
              </div>
              <button onClick={() => { setShowForm(false); setSelectedPt(null); setSearchTerm(''); setSearchResults([]); }} style={{
                background:'none', border:'none', cursor:'pointer', color:'var(--t3)', fontSize:18,
              }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

              {/* Patient search */}
              <div className="form-group">
                <label className="form-label">Search patient *</label>
                {selectedPt ? (
                  <div style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'10px 14px', borderRadius:10,
                    background:'var(--success-bg)',
                    border:'1.5px solid var(--success)',
                  }}>
                    <div style={{
                      width:34, height:34, borderRadius:'50%',
                      background:'var(--success)', color:'#fff',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:13, fontWeight:700,
                    }}>{getInitials(selectedPt)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{selectedPt.surname} {selectedPt.firstName}</div>
                      <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>
                        {selectedPt.emrNumber} · {selectedPt.classSet}
                      </div>
                    </div>
                    <button onClick={() => setSelectedPt(null)} style={{
                      background:'none', border:'none', cursor:'pointer', color:'var(--t3)',
                    }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ) : (
                  <div style={{ position:'relative' }}>
                    <input
                      className="form-input"
                      placeholder="Type name, EMR number or matric…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      autoFocus
                    />
                    {searching && (
                      <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', color:'var(--t3)' }}>
                        <i className="ti ti-loader-2" style={{ animation:'spin 1s linear infinite' }} />
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div style={{
                        position:'absolute', top:'calc(100% + 4px)', left:0, right:0,
                        background:'var(--card-bg)',
                        border:'1px solid var(--border)',
                        borderRadius:10,
                        boxShadow:'var(--shadow-md)',
                        zIndex:100, overflow:'hidden',
                      }}>
                        {searchResults.map(pt => (
                          <div
                            key={pt.id}
                            onClick={() => { setSelectedPt(pt); setSearchTerm(''); setSearchResults([]); }}
                            style={{
                              padding:'10px 14px', cursor:'pointer',
                              borderBottom:'1px solid var(--border)',
                              display:'flex', alignItems:'center', gap:10,
                              transition:'background .12s',
                            }}
                            onMouseOver={e => e.currentTarget.style.background='var(--card-bg2)'}
                            onMouseOut={e => e.currentTarget.style.background='transparent'}
                          >
                            <div style={{
                              width:30, height:30, borderRadius:'50%',
                              background:'var(--accent-bg)', color:'var(--accent)',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:11, fontWeight:700,
                            }}>{getInitials(pt)}</div>
                            <div>
                              <div style={{ fontWeight:700, fontSize:13 }}>{pt.surname} {pt.firstName}</div>
                              <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>
                                {pt.emrNumber} · {pt.classSet}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Priority selection */}
              <div className="form-group">
                <label className="form-label">Triage Priority *</label>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {Object.entries(PRIORITY).map(([key, pr]) => (
                    <div
                      key={key}
                      onClick={() => setPriority(key)}
                      style={{
                        display:'flex', alignItems:'center', gap:12,
                        padding:'12px 16px', borderRadius:10, cursor:'pointer',
                        border:`2px solid ${priority === key ? pr.color : 'var(--border)'}`,
                        background: priority === key ? pr.bg : 'transparent',
                        transition:'all .15s',
                      }}
                    >
                      <i className={`ti ${pr.icon}`} style={{ fontSize:20, color: pr.color }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:13, color: priority === key ? pr.color : 'var(--t1)' }}>
                          {pr.label}
                        </div>
                        <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{pr.desc}</div>
                      </div>
                      <div style={{
                        width:18, height:18, borderRadius:'50%',
                        border:`2px solid ${priority === key ? pr.color : 'var(--border)'}`,
                        background: priority === key ? pr.color : 'transparent',
                        flexShrink:0,
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Chief complaint */}
              <div className="form-group">
                <label className="form-label">Chief Complaint *</label>
                <textarea
                  className="form-textarea full-width"
                  rows={3}
                  placeholder="e.g. Fever × 3 days, headache, vomiting…"
                  value={chiefComp}
                  onChange={e => setChiefComp(e.target.value)}
                />
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex:1 }}
                  onClick={handleSave}
                  disabled={saving}
                >
                  <i className="ti ti-device-floppy" />
                  {saving ? 'Saving…' : 'Save & Add to Queue'}
                </button>
                <button
                  className="btn"
                  onClick={() => { setShowForm(false); setSelectedPt(null); setSearchTerm(''); setSearchResults([]); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
