// src/pages/MARPage.jsx
// ─────────────────────────────────────────────
// Medication Administration Record — Summary
// Shows all patients with active prescriptions.
// Nurse selects a patient → records administration.
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  listenPatients, listenPrescriptions, listenMAR,
  recordAdministration, formatTime, formatDateTime, formatTs,
} from '../lib/emr';

const ROUTES = ['Oral', 'IM', 'IV', 'SC', 'Topical', 'PR'];

const STATUS_CFG = {
  given:   { label:'Given',   color:'var(--success)', bg:'var(--success-bg)' },
  held:    { label:'Held',    color:'var(--warn)',    bg:'var(--warn-bg)'    },
  refused: { label:'Refused', color:'var(--danger)',  bg:'var(--danger-bg)'  },
};

export default function MARPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [patients,  setPatients]  = useState([]);
  const [selected,  setSelected]  = useState(null);   // selected patient
  const [rxList,    setRxList]    = useState([]);      // prescriptions for selected pt
  const [marList,   setMarList]   = useState([]);      // MAR records for selected pt
  const [showForm,  setShowForm]  = useState(false);
  const [activeDrug,setActiveDrug]= useState(null);    // drug being administered
  const [form,      setForm]      = useState({ route:'Oral', dose:'', time:'', notes:'', status:'given' });
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');

  // Unsub refs
  const [rxUnsub,  setRxUnsub]  = useState(null);
  const [marUnsub, setMarUnsub] = useState(null);

  useEffect(() => {
    const unsub = listenPatients(pts => {
      // Only patients who are active or in sickbay
      setPatients(pts.filter(p => p.status === 'active' || p.status === 'sickbay'));
    });
    return unsub;
  }, []);

  // When patient changes, listen to their prescriptions + MAR
  useEffect(() => {
    if (rxUnsub)  rxUnsub();
    if (marUnsub) marUnsub();
    if (!selected) { setRxList([]); setMarList([]); return; }

    const u1 = listenPrescriptions(selected.emrNumber, setRxList);
    const u2 = listenMAR(selected.emrNumber, setMarList);
    setRxUnsub(() => u1);
    setMarUnsub(() => u2);
    return () => { u1(); u2(); };
  }, [selected?.emrNumber]);

  const handleAdminister = async () => {
    if (!activeDrug) return;
    if (!form.time)  { toast.error('Enter administration time'); return; }
    setSaving(true);
    try {
      const { offline } = await recordAdministration({
        emrNumber:    selected.emrNumber,
        rxId:         activeDrug.rxId,
        drug:         activeDrug.drug,
        dose:         form.dose || activeDrug.dose,
        route:        form.route,
        scheduledFreq:activeDrug.frequency,
        status:       form.status,
        administeredAt: form.time,
        notes:        form.notes,
        administeredBy:   profile.displayName,
        administeredByRole: profile.role,
      });
      if (offline) {
        toast.success(`${activeDrug.drug} saved offline — will sync when back online`);
      } else {
        toast.success(`${activeDrug.drug} recorded as ${form.status}`);
      }
      setShowForm(false);
      setActiveDrug(null);
      setForm({ route:'Oral', dose:'', time:'', notes:'', status:'given' });
    } catch (err) {
      console.error('[MARPage] recordAdministration failed:', err);
      if (err?.code === 'permission-denied') {
        toast.error('Failed to record — your account may not be active. Ask an admin to check your staff profile.');
      } else {
        toast.error(`Failed to record administration${err?.code ? ` (${err.code})` : ''} — check your connection and try again`);
      }
    }
    setSaving(false);
  };

  // Build flat drug list from all prescriptions
  const drugs = rxList.flatMap(rx =>
    (rx.drugs || []).map(d => ({
      ...d,
      rxId:         rx.id,
      prescribedBy: rx.prescribedBy,
      prescribedByRole: rx.prescribedByRole,
      rxCreatedAt:  rx.createdAt,
      requiresCountersign: rx.requiresCountersign,
      countersigned: rx.countersigned,
    }))
  );

  // How many administrations each drug has today
  const today = new Date(); today.setHours(0,0,0,0);
  const todayAdmins = marList.filter(m => {
    // m.administeredAt is a HH:MM string — check createdAt for date
    const ts = m.createdAt?.toDate?.();
    return ts && ts.getTime() >= today.getTime();
  });

  const adminsForDrug = (rxId, drugName) =>
    todayAdmins.filter(m => m.rxId === rxId && m.drug === drugName);

  // Filtered patients
  const filteredPts = patients.filter(p => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      p.surname?.toLowerCase().includes(s) ||
      p.firstName?.toLowerCase().includes(s) ||
      p.emrNumber?.toLowerCase().includes(s) ||
      p.classSet?.toLowerCase().includes(s)
    );
  });

  const getInitials = p => ((p.surname?.[0]||'')+(p.firstName?.[0]||'')).toUpperCase();

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>

      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-pill" style={{ marginRight:6, color:'var(--accent)' }} />
          Medication Administration Record
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* ── LEFT PANEL — patient list ── */}
        {!selected && (
        <div style={{
          width:260, flexShrink:0,
          borderRight:'1px solid var(--border)',
          display:'flex', flexDirection:'column',
          background:'var(--card-bg)',
          overflow:'hidden',
        }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ position:'relative' }}>
              <i className="ti ti-search" style={{
                position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
                color:'var(--t3)', fontSize:13,
              }} />
              <input
                className="form-input"
                style={{ paddingLeft:30, fontSize:12 }}
                placeholder="Search patients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {filteredPts.length === 0 && (
              <div style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:12, fontWeight:700 }}>
                No active patients
              </div>
            )}
            {filteredPts.map(p => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                style={{
                  padding:'11px 14px',
                  borderBottom:'1px solid var(--border)',
                  cursor:'pointer',
                  background: selected?.emrNumber === p.emrNumber
                    ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected?.emrNumber === p.emrNumber
                    ? '3px solid var(--accent)' : '3px solid transparent',
                  transition:'background .12s',
                }}
                onMouseOver={e => {
                  if (selected?.emrNumber !== p.emrNumber)
                    e.currentTarget.style.background = 'var(--card-bg2)';
                }}
                onMouseOut={e => {
                  if (selected?.emrNumber !== p.emrNumber)
                    e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <div style={{
                    width:32, height:32, borderRadius:'50%', flexShrink:0,
                    background: p.status === 'sickbay' ? 'var(--danger-bg)' : 'var(--accent-bg)',
                    color: p.status === 'sickbay' ? 'var(--danger)' : 'var(--accent)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:700,
                  }}>{getInitials(p)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:12, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {p.surname} {p.firstName}
                    </div>
                    <div style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>
                      {p.emrNumber}
                    </div>
                    <div style={{ fontSize:10, color:'var(--t3)' }}>{p.classSet}</div>
                  </div>
                  {p.status === 'sickbay' && (
                    <span style={{
                      fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10,
                      background:'var(--danger-bg)', color:'var(--danger)',
                    }}>Admitted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* ── RIGHT PANEL — MAR content ── */}
        <div style={{ flex:1, overflowY:'auto', padding:16, display:'flex', flexDirection:'column', gap:14 }}>

          {!selected ? (
            <div style={{
              flex:1, display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center',
              color:'var(--t3)', gap:12,
            }}>
              <i className="ti ti-pill" style={{ fontSize:48, opacity:.3 }} />
              <div style={{ fontWeight:700, fontSize:15 }}>Select a patient</div>
              <div style={{ fontSize:12 }}>Choose a patient from the list to view their MAR</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'14px 18px',
                background:'var(--card-bg)',
                borderRadius:12,
                border:'1px solid var(--border)',
              }}>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelected(null)}
                  style={{ flexShrink:0 }}
                  title="Back to patient list"
                >
                  <i className="ti ti-arrow-left" />
                </button>
                <div style={{
                  width:44, height:44, borderRadius:'50%',
                  background:'var(--accent-bg)', color:'var(--accent)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, fontWeight:700, flexShrink:0,
                }}>{getInitials(selected)}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:16 }}>{selected.surname} {selected.firstName}</div>
                  <div style={{ fontSize:11, color:'var(--t3)', display:'flex', gap:10, marginTop:2 }}>
                    <span style={{ fontFamily:'var(--mono)' }}>{selected.emrNumber}</span>
                    <span>·</span>
                    <span>{selected.classSet}</span>
                    {selected.knownAllergies && <>
                      <span>·</span>
                      <span style={{ color:'var(--danger)', fontWeight:700 }}>⚠ {selected.knownAllergies}</span>
                    </>}
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => navigate(`/patient/${selected.emrNumber}`)}
                >
                  <i className="ti ti-external-link" /> Full Profile
                </button>
              </div>

              {/* Active prescriptions / drug list */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-pill" /> Active Medications
                  </div>
                  <span style={{ fontSize:11, color:'var(--t3)' }}>
                    {drugs.length} drug{drugs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {drugs.length === 0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
                    <i className="ti ti-pill-off" style={{ fontSize:32, display:'block', marginBottom:8 }} />
                    <div style={{ fontWeight:700 }}>No active prescriptions</div>
                    <div style={{ fontSize:11, marginTop:4 }}>Go to patient profile to add a prescription first</div>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Drug</th>
                        <th>Dose</th>
                        <th>Frequency</th>
                        <th>Duration</th>
                        <th>Prescribed by</th>
                        <th>Given today</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drugs.map((d, i) => {
                        const administered = adminsForDrug(d.rxId, d.drug);
                        const lastAdmin    = administered[administered.length - 1];
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight:700 }}>
                              {d.drug}
                              {d.requiresCountersign && !d.countersigned && (
                                <span style={{
                                  marginLeft:6, fontSize:9, fontWeight:700,
                                  padding:'1px 6px', borderRadius:10,
                                  background:'var(--warn-bg)', color:'var(--warn)',
                                }}>Nurse Rx</span>
                              )}
                            </td>
                            <td style={{ color:'var(--t2)' }}>{d.dose || '—'}</td>
                            <td style={{ color:'var(--t2)' }}>{d.frequency || '—'}</td>
                            <td style={{ color:'var(--t2)' }}>{d.duration || '—'}</td>
                            <td>
                              <div style={{ fontSize:12 }}>{d.prescribedBy}</div>
                              <div style={{ fontSize:10, color:'var(--t3)', textTransform:'capitalize' }}>
                                {d.prescribedByRole}
                              </div>
                            </td>
                            <td>
                              {administered.length === 0 ? (
                                <span style={{ fontSize:11, color:'var(--t3)' }}>Not yet given</span>
                              ) : (
                                <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                                  {administered.map((a, j) => (
                                    <span key={j} style={{
                                      fontSize:10, fontWeight:700,
                                      padding:'2px 7px', borderRadius:10,
                                      background: STATUS_CFG[a.status]?.bg || 'var(--card-bg2)',
                                      color: STATUS_CFG[a.status]?.color || 'var(--t2)',
                                    }}>
                                      {a.administeredAt} — {STATUS_CFG[a.status]?.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setActiveDrug(d);
                                  setForm({ route:'Oral', dose: d.dose || '', time:'', notes:'', status:'given' });
                                  setShowForm(true);
                                }}
                              >
                                <i className="ti ti-plus" /> Record
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Today's administration log */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-history" /> Administration Log — Today
                  </div>
                  <span style={{ fontSize:11, color:'var(--t3)' }}>
                    {todayAdmins.length} entr{todayAdmins.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>
                {todayAdmins.length === 0 ? (
                  <div style={{ padding:24, textAlign:'center', color:'var(--t3)', fontSize:12, fontWeight:700 }}>
                    No administrations recorded today
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Drug</th>
                        <th>Dose</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Given by</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...todayAdmins].reverse().map(m => (
                        <tr key={m.id}>
                          <td style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700 }}>
                            {m.administeredAt}
                          </td>
                          <td style={{ fontWeight:700 }}>{m.drug}</td>
                          <td style={{ color:'var(--t2)' }}>{m.dose || '—'}</td>
                          <td>
                            <span style={{
                              fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                              background:'var(--card-bg2)', color:'var(--t2)',
                            }}>{m.route}</span>
                          </td>
                          <td>
                            <span style={{
                              fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                              background: STATUS_CFG[m.status]?.bg || 'var(--card-bg2)',
                              color: STATUS_CFG[m.status]?.color || 'var(--t2)',
                            }}>
                              {STATUS_CFG[m.status]?.label || m.status}
                            </span>
                          </td>
                          <td style={{ fontSize:11 }}>
                            <div>{m.administeredBy}</div>
                            <div style={{ color:'var(--t3)', textTransform:'capitalize' }}>{m.administeredByRole}</div>
                          </td>
                          <td style={{ fontSize:11, color:'var(--t3)' }}>{m.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Full MAR history */}
              {marList.length > todayAdmins.length && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <i className="ti ti-calendar" /> Full MAR History
                    </div>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Drug</th>
                        <th>Dose</th>
                        <th>Route</th>
                        <th>Status</th>
                        <th>Given by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marList.map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize:11, color:'var(--t3)' }}>{formatTs(m.createdAt)}</td>
                          <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{m.administeredAt}</td>
                          <td style={{ fontWeight:700 }}>{m.drug}</td>
                          <td style={{ color:'var(--t2)' }}>{m.dose || '—'}</td>
                          <td style={{ fontSize:11 }}>{m.route}</td>
                          <td>
                            <span style={{
                              fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10,
                              background: STATUS_CFG[m.status]?.bg || 'var(--card-bg2)',
                              color: STATUS_CFG[m.status]?.color || 'var(--t2)',
                            }}>
                              {STATUS_CFG[m.status]?.label || m.status}
                            </span>
                          </td>
                          <td style={{ fontSize:11 }}>{m.administeredBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ══ ADMINISTRATION FORM MODAL ══ */}
      {showForm && activeDrug && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1000, padding:20,
        }}>
          <div style={{
            background:'var(--card-bg)', borderRadius:16,
            width:'100%', maxWidth:460,
            boxShadow:'var(--shadow-md)',
            overflow:'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding:'16px 20px',
              borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <i className="ti ti-pill" style={{ fontSize:20, color:'var(--accent)' }} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>Record Administration</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>
                  {activeDrug.drug} · {activeDrug.dose} · {activeDrug.frequency}
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setActiveDrug(null); }} style={{
                background:'none', border:'none', cursor:'pointer', color:'var(--t3)', fontSize:18,
              }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>

              {/* Status */}
              <div className="form-group">
                <label className="form-label">Administration Status *</label>
                <div style={{ display:'flex', gap:8 }}>
                  {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                    <div
                      key={key}
                      onClick={() => setForm(f => ({ ...f, status: key }))}
                      style={{
                        flex:1, padding:'10px 8px', borderRadius:10, cursor:'pointer',
                        textAlign:'center',
                        border:`2px solid ${form.status === key ? cfg.color : 'var(--border)'}`,
                        background: form.status === key ? cfg.bg : 'transparent',
                        transition:'all .15s',
                      }}
                    >
                      <div style={{ fontWeight:700, fontSize:12, color: form.status === key ? cfg.color : 'var(--t2)' }}>
                        {cfg.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Time + Route */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Time given *</label>
                  <input
                    type="time"
                    className="form-input"
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Route *</label>
                  <select
                    className="form-select"
                    value={form.route}
                    onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                  >
                    {ROUTES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* Dose (pre-filled, editable) */}
              <div className="form-group">
                <label className="form-label">Dose given</label>
                <input
                  className="form-input"
                  placeholder={activeDrug.dose || 'e.g. 500mg'}
                  value={form.dose}
                  onChange={e => setForm(f => ({ ...f, dose: e.target.value }))}
                />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">
                  {form.status === 'held'    ? 'Reason held *' :
                   form.status === 'refused' ? 'Reason refused *' : 'Notes (optional)'}
                </label>
                <textarea
                  className="form-textarea full-width"
                  rows={2}
                  placeholder={
                    form.status === 'held'    ? 'e.g. Patient vomiting, held per protocol' :
                    form.status === 'refused' ? 'e.g. Patient declined medication' :
                    'e.g. Patient tolerated well'
                  }
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              {/* Nurse info banner */}
              <div style={{
                padding:'10px 14px', borderRadius:10,
                background:'var(--accent-bg)',
                border:'1px solid var(--border)',
                fontSize:11, color:'var(--t2)',
                display:'flex', alignItems:'center', gap:8,
              }}>
                <i className="ti ti-user-check" style={{ color:'var(--accent)', fontSize:15 }} />
                Recording as <strong style={{ color:'var(--accent)' }}>{profile.displayName}</strong>
                &nbsp;({profile.role})
              </div>

              {/* Actions */}
              <div style={{ display:'flex', gap:8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex:1 }}
                  onClick={handleAdminister}
                  disabled={saving}
                >
                  <i className="ti ti-device-floppy" />
                  {saving ? 'Saving…' : 'Save Administration'}
                </button>
                <button className="btn" onClick={() => { setShowForm(false); setActiveDrug(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
