// src/components/patients/MARTab.jsx
// ─────────────────────────────────────────────
// Drug Administration Record tab for PatientProfile.
// Embedded inside the existing tab system.
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/AuthContext';
import { listenMAR, recordAdministration, formatTs, formatTime } from '../../lib/emr';

const ROUTES = ['Oral', 'IM', 'IV', 'SC', 'Topical', 'PR'];

const STATUS_CFG = {
  given:   { label:'Given',   color:'var(--success)', bg:'var(--success-bg)' },
  held:    { label:'Held',    color:'var(--warn)',    bg:'var(--warn-bg)'    },
  refused: { label:'Refused', color:'var(--danger)',  bg:'var(--danger-bg)'  },
};

export default function MARTab({ emrNumber, visitId, prescriptions, patient }) {
  const { profile } = useAuth();

  const [marList,    setMarList]    = useState([]);
  const [showForm,   setShowForm]   = useState(false);
  const [activeDrug, setActiveDrug] = useState(null);
  const [form,       setForm]       = useState({ route:'Oral', dose:'', time:'', notes:'', status:'given' });
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    if (!emrNumber) return;
    const unsub = listenMAR(emrNumber, setMarList);
    return unsub;
  }, [emrNumber]);

  // Flat drug list from all prescriptions
  const drugs = (prescriptions || []).flatMap(rx =>
    (rx.drugs || []).map(d => ({
      ...d,
      rxId:             rx.id,
      prescribedBy:     rx.prescribedBy,
      prescribedByRole: rx.prescribedByRole,
      requiresCountersign: rx.requiresCountersign,
      countersigned:    rx.countersigned,
    }))
  );

  const today = new Date(); today.setHours(0,0,0,0);
  const todayAdmins = marList.filter(m => {
    const ts = m.createdAt?.toDate?.();
    return ts && ts.getTime() >= today.getTime();
  });

  const adminsForDrug = (rxId, drugName) =>
    todayAdmins.filter(m => m.rxId === rxId && m.drug === drugName);

  const openForm = (drug) => {
    setActiveDrug(drug);
    setForm({ route:'Oral', dose: drug.dose || '', time:'', notes:'', status:'given' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.time) { toast.error('Enter the time given'); return; }
    if ((form.status === 'held' || form.status === 'refused') && !form.notes.trim()) {
      toast.error('Enter a reason'); return;
    }
    setSaving(true);
    try {
      await recordAdministration({
        emrNumber,
        rxId:               activeDrug.rxId,
        drug:               activeDrug.drug,
        dose:               form.dose || activeDrug.dose,
        route:              form.route,
        scheduledFreq:      activeDrug.frequency,
        status:             form.status,
        administeredAt:     form.time,
        notes:              form.notes,
        administeredBy:     profile.displayName,
        administeredByRole: profile.role,
      });
      toast.success(`${activeDrug.drug} — ${STATUS_CFG[form.status].label}`);
      setShowForm(false);
      setActiveDrug(null);
    } catch {
      toast.error('Failed to record');
    }
    setSaving(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* ── Allergy banner ── */}
      {patient?.knownAllergies && (
        <div style={{
          padding:'10px 16px', borderRadius:10,
          background:'var(--danger-bg)',
          border:'1.5px solid var(--danger)',
          display:'flex', alignItems:'center', gap:8,
          fontWeight:700, fontSize:12, color:'var(--danger)',
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize:16 }} />
          ALLERGY ALERT: {patient.knownAllergies}
        </div>
      )}

      {/* ── Active medications ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-pill" />Active Medications</div>
          <span style={{ fontSize:11, color:'var(--t3)' }}>
            {drugs.length} drug{drugs.length !== 1 ? 's' : ''}
          </span>
        </div>

        {drugs.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
            <i className="ti ti-pill-off" style={{ fontSize:32, display:'block', marginBottom:8 }} />
            <div style={{ fontWeight:700 }}>No prescriptions yet</div>
            <div style={{ fontSize:11, marginTop:4 }}>Add a prescription in the Prescription tab first</div>
          </div>
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dose</th>
                  <th>Freq</th>
                  <th>Duration</th>
                  <th>Prescribed by</th>
                  <th>Given today</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((d, i) => {
                  const administered = adminsForDrug(d.rxId, d.drug);
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
                      <td style={{ color:'var(--t2)', fontSize:12 }}>{d.dose || '—'}</td>
                      <td style={{ color:'var(--t2)', fontSize:12 }}>{d.frequency || '—'}</td>
                      <td style={{ color:'var(--t2)', fontSize:12 }}>{d.duration || '—'}</td>
                      <td>
                        <div style={{ fontSize:12 }}>{d.prescribedBy}</div>
                        <div style={{ fontSize:10, color:'var(--t3)', textTransform:'capitalize' }}>
                          {d.prescribedByRole}
                        </div>
                      </td>
                      <td>
                        {administered.length === 0 ? (
                          <span style={{ fontSize:11, color:'var(--t3)' }}>Not yet</span>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
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
                          onClick={() => openForm(d)}
                        >
                          <i className="ti ti-plus" /> Record
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── Today's log ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-history" />Today's Administration Log</div>
          <span style={{ fontSize:11, color:'var(--t3)' }}>{todayAdmins.length} entries</span>
        </div>
        {todayAdmins.length === 0 ? (
          <div style={{ padding:20, textAlign:'center', color:'var(--t3)', fontSize:12, fontWeight:700 }}>
            No administrations recorded today
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th><th>Drug</th><th>Dose</th>
                <th>Route</th><th>Status</th><th>By</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[...todayAdmins].reverse().map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700 }}>{m.administeredAt}</td>
                  <td style={{ fontWeight:700 }}>{m.drug}</td>
                  <td style={{ color:'var(--t2)', fontSize:12 }}>{m.dose || '—'}</td>
                  <td>
                    <span style={{
                      fontSize:11, padding:'2px 7px', borderRadius:10, fontWeight:700,
                      background:'var(--card-bg2)', color:'var(--t2)',
                    }}>{m.route}</span>
                  </td>
                  <td>
                    <span style={{
                      fontSize:11, fontWeight:700, padding:'2px 7px', borderRadius:10,
                      background: STATUS_CFG[m.status]?.bg || 'var(--card-bg2)',
                      color: STATUS_CFG[m.status]?.color || 'var(--t2)',
                    }}>
                      {STATUS_CFG[m.status]?.label || m.status}
                    </span>
                  </td>
                  <td style={{ fontSize:11 }}>
                    <div>{m.administeredBy}</div>
                    <div style={{ fontSize:10, color:'var(--t3)', textTransform:'capitalize' }}>{m.administeredByRole}</div>
                  </td>
                  <td style={{ fontSize:11, color:'var(--t3)' }}>{m.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Full history ── */}
      {marList.length > todayAdmins.length && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-calendar-stats" />Full MAR History</div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Drug</th>
                <th>Dose</th><th>Route</th><th>Status</th><th>By</th>
              </tr>
            </thead>
            <tbody>
              {marList.map(m => (
                <tr key={m.id}>
                  <td style={{ fontSize:11, color:'var(--t3)' }}>{formatTs(m.createdAt)}</td>
                  <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{m.administeredAt}</td>
                  <td style={{ fontWeight:700 }}>{m.drug}</td>
                  <td style={{ color:'var(--t2)', fontSize:12 }}>{m.dose || '—'}</td>
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

      {/* ══ ADMINISTRATION MODAL ══ */}
      {showForm && activeDrug && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.45)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex:1000, padding:20,
        }}>
          <div style={{
            background:'var(--card-bg)', borderRadius:16,
            width:'100%', maxWidth:440,
            boxShadow:'var(--shadow-md)', overflow:'hidden',
          }}>
            <div style={{
              padding:'15px 18px', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', gap:10,
            }}>
              <i className="ti ti-pill" style={{ fontSize:18, color:'var(--accent)' }} />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>Record Administration</div>
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

            <div style={{ padding:18, display:'flex', flexDirection:'column', gap:13 }}>

              {/* Status selector */}
              <div className="form-group">
                <label className="form-label">Status *</label>
                <div style={{ display:'flex', gap:8 }}>
                  {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                    <div
                      key={key}
                      onClick={() => setForm(f => ({ ...f, status: key }))}
                      style={{
                        flex:1, padding:'9px 6px', borderRadius:10,
                        cursor:'pointer', textAlign:'center',
                        border:`2px solid ${form.status === key ? cfg.color : 'var(--border)'}`,
                        background: form.status === key ? cfg.bg : 'transparent',
                        transition:'all .15s',
                      }}
                    >
                      <div style={{
                        fontWeight:700, fontSize:12,
                        color: form.status === key ? cfg.color : 'var(--t3)',
                      }}>
                        {cfg.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Time given *</label>
                  <input type="time" className="form-input"
                    value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Route *</label>
                  <select className="form-select"
                    value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}>
                    {ROUTES.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Dose given</label>
                <input className="form-input"
                  placeholder={activeDrug.dose || 'e.g. 500mg'}
                  value={form.dose}
                  onChange={e => setForm(f => ({ ...f, dose: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">
                  {form.status !== 'given' ? 'Reason *' : 'Notes (optional)'}
                </label>
                <textarea className="form-textarea full-width" rows={2}
                  placeholder={
                    form.status === 'held'    ? 'Reason held…' :
                    form.status === 'refused' ? 'Patient refused because…' :
                    'e.g. Patient tolerated well'
                  }
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div style={{
                padding:'9px 12px', borderRadius:9,
                background:'var(--accent-bg)', border:'1px solid var(--border)',
                fontSize:11, color:'var(--t2)', display:'flex', alignItems:'center', gap:7,
              }}>
                <i className="ti ti-user-check" style={{ color:'var(--accent)' }} />
                Recording as <strong style={{ color:'var(--accent)' }}>{profile.displayName}</strong>
                &nbsp;({profile.role})
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ flex:1 }}
                  onClick={handleSave} disabled={saving}>
                  <i className="ti ti-device-floppy" />
                  {saving ? 'Saving…' : 'Save'}
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
