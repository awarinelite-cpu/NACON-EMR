// src/pages/VitalSignsPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  listenPatients, listenVitals, addVitals,
  formatTs, formatTime,
} from '../lib/emr';

const VITALS_FIELDS = [
  { key: 'temp',      label: 'Temperature',    unit: '°C',   placeholder: 'e.g. 37.2', icon: 'ti-temperature' },
  { key: 'pulse',     label: 'Pulse',          unit: 'bpm',  placeholder: 'e.g. 72',   icon: 'ti-heart-rate-monitor' },
  { key: 'resp',      label: 'Respiratory Rate', unit: '/min', placeholder: 'e.g. 18',  icon: 'ti-lungs' },
  { key: 'bp',        label: 'Blood Pressure', unit: 'mmHg', placeholder: 'e.g. 120/80', icon: 'ti-activity' },
  { key: 'spo2',      label: 'SpO2',           unit: '%',    placeholder: 'e.g. 98',   icon: 'ti-droplet' },
  { key: 'weight',    label: 'Weight',         unit: 'kg',   placeholder: 'e.g. 65',   icon: 'ti-scale' },
  { key: 'height',    label: 'Height',         unit: 'cm',   placeholder: 'e.g. 170',  icon: 'ti-ruler' },
  { key: 'gcs',       label: 'GCS',            unit: '/15',  placeholder: 'e.g. 15',   icon: 'ti-brain' },
  { key: 'pain',      label: 'Pain Score',     unit: '/10',  placeholder: 'e.g. 3',    icon: 'ti-mood-sad' },
  { key: 'bsl',       label: 'Blood Sugar',    unit: 'mmol/L', placeholder: 'e.g. 5.4', icon: 'ti-droplet-half-2' },
];

const NORMAL_RANGES = {
  temp:   { min: 36.1, max: 37.9, label: 'Normal 36.1–37.9°C' },
  pulse:  { min: 60,   max: 100,  label: 'Normal 60–100 bpm'  },
  resp:   { min: 12,   max: 20,   label: 'Normal 12–20 /min'  },
  spo2:   { min: 95,   max: 100,  label: 'Normal ≥95%'         },
  pain:   { min: 0,    max: 3,    label: 'Mild ≤3/10'          },
  bsl:    { min: 3.9,  max: 7.8,  label: 'Normal 3.9–7.8 mmol/L' },
};

function isAbnormal(key, value) {
  const range = NORMAL_RANGES[key];
  if (!range || !value) return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  return num < range.min || num > range.max;
}

export default function VitalSignsPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [patients,     setPatients]     = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [vitals,       setVitals]       = useState([]);
  const [search,       setSearch]       = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [vitalsUnsub,  setVitalsUnsub]  = useState(null);
  const [form, setForm] = useState({
    temp: '', pulse: '', resp: '', bp: '',
    spo2: '', weight: '', height: '', gcs: '', pain: '', bsl: '', notes: '',
  });

  useEffect(() => {
    const unsub = listenPatients(pts =>
      setPatients(pts.filter(p => p.status === 'active' || p.status === 'sickbay'))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (vitalsUnsub) vitalsUnsub();
    if (!selected) { setVitals([]); return; }
    const u = listenVitals(selected.emrNumber, setVitals);
    setVitalsUnsub(() => u);
    return u;
  }, [selected?.emrNumber]);

  const handleSave = async () => {
    const hasAny = VITALS_FIELDS.some(f => form[f.key].trim());
    if (!hasAny) { toast.error('Enter at least one vital sign'); return; }
    setSaving(true);
    try {
      const data = {};
      VITALS_FIELDS.forEach(f => { if (form[f.key].trim()) data[f.key] = form[f.key].trim(); });
      if (form.notes.trim()) data.notes = form.notes.trim();
      await addVitals(selected.emrNumber, null, data, profile.displayName);
      toast.success('Vitals recorded');
      setShowForm(false);
      setForm({ temp: '', pulse: '', resp: '', bp: '', spo2: '', weight: '', height: '', gcs: '', pain: '', bsl: '', notes: '' });
    } catch {
      toast.error('Failed to save vitals');
    }
    setSaving(false);
  };

  const filtered = patients.filter(p => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      p.surname?.toLowerCase().includes(s) ||
      p.firstName?.toLowerCase().includes(s) ||
      p.emrNumber?.toLowerCase().includes(s) ||
      p.classSet?.toLowerCase().includes(s)
    );
  });

  const getInitials = p => ((p.surname?.[0] || '') + (p.firstName?.[0] || '')).toUpperCase();

  // Latest vitals for summary card
  const latest = vitals[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-activity" style={{ marginRight: 6, color: 'var(--accent)' }} />
          Vital Signs
        </div>
        {selected && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <i className="ti ti-plus" /> Record Vitals
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT */}
        <div style={{
          width: 260, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-search" style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--t3)', fontSize: 13,
              }} />
              <input
                className="form-input"
                style={{ paddingLeft: 30, fontSize: 12 }}
                placeholder="Search patients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 12, fontWeight: 700 }}>
                No active patients
              </div>
            )}
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                style={{
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected?.emrNumber === p.emrNumber ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected?.emrNumber === p.emrNumber ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background .12s',
                }}
                onMouseOver={e => { if (selected?.emrNumber !== p.emrNumber) e.currentTarget.style.background = 'var(--card-bg2)'; }}
                onMouseOut={e => { if (selected?.emrNumber !== p.emrNumber) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: p.status === 'sickbay' ? 'var(--danger-bg)' : 'var(--accent-bg)',
                    color: p.status === 'sickbay' ? 'var(--danger)' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{getInitials(p)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.surname} {p.firstName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{p.emrNumber}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{p.classSet}</div>
                  </div>
                  {p.status === 'sickbay' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                      background: 'var(--danger-bg)', color: 'var(--danger)',
                    }}>Admitted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', gap: 12 }}>
              <i className="ti ti-activity" style={{ fontSize: 48, opacity: .3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Select a patient</div>
              <div style={{ fontSize: 12 }}>View and record vital signs</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'var(--card-bg)',
                borderRadius: 12, border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>{getInitials(selected)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.surname} {selected.firstName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 10, marginTop: 2 }}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{selected.emrNumber}</span>
                    <span>·</span>
                    <span>{selected.classSet}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                    <i className="ti ti-plus" /> Record Vitals
                  </button>
                  <button className="btn btn-sm" onClick={() => navigate(`/patient/${selected.emrNumber}`)}>
                    <i className="ti ti-external-link" /> Profile
                  </button>
                </div>
              </div>

              {/* Latest vitals summary */}
              {latest && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><i className="ti ti-heartbeat" /> Latest Vitals</div>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                      {formatTs(latest.recordedAt)} {formatTime(latest.recordedAt)} · by {latest.recordedBy}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '8px 16px 16px' }}>
                    {VITALS_FIELDS.filter(f => latest[f.key]).map(f => {
                      const abnormal = isAbnormal(f.key, latest[f.key]);
                      return (
                        <div key={f.key} style={{
                          padding: '10px 14px', borderRadius: 10, minWidth: 100,
                          background: abnormal ? 'var(--danger-bg)' : 'var(--card-bg2)',
                          border: `1px solid ${abnormal ? 'var(--danger)' : 'var(--border)'}`,
                        }}>
                          <div style={{ fontSize: 10, color: abnormal ? 'var(--danger)' : 'var(--t3)', fontWeight: 700, marginBottom: 2 }}>
                            <i className={`ti ${f.icon}`} style={{ marginRight: 4 }} />{f.label}
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: abnormal ? 'var(--danger)' : 'var(--t1)' }}>
                            {latest[f.key]}
                            <span style={{ fontSize: 11, fontWeight: 500, color: abnormal ? 'var(--danger)' : 'var(--t3)', marginLeft: 3 }}>{f.unit}</span>
                          </div>
                          {abnormal && (
                            <div style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 700, marginTop: 2 }}>⚠ ABNORMAL</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Vitals history */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-history" /> Vitals History</div>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{vitals.length} record{vitals.length !== 1 ? 's' : ''}</span>
                </div>
                {vitals.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>
                    <i className="ti ti-activity" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                    <div style={{ fontWeight: 700 }}>No vitals recorded yet</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Click "Record Vitals" to add the first entry</div>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date / Time</th>
                          <th>Temp °C</th>
                          <th>Pulse</th>
                          <th>Resp</th>
                          <th>BP</th>
                          <th>SpO2</th>
                          <th>GCS</th>
                          <th>Pain</th>
                          <th>BSL</th>
                          <th>Wt/Ht</th>
                          <th>Recorded by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vitals.map(v => (
                          <tr key={v.id}>
                            <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 700 }}>{formatTs(v.recordedAt)}</div>
                              <div style={{ color: 'var(--t3)' }}>{formatTime(v.recordedAt)}</div>
                            </td>
                            {['temp', 'pulse', 'resp'].map(k => (
                              <td key={k} style={{
                                fontWeight: 700,
                                color: isAbnormal(k, v[k]) ? 'var(--danger)' : 'var(--t1)',
                              }}>
                                {v[k] || '—'}
                                {isAbnormal(k, v[k]) && <span style={{ marginLeft: 3 }}>⚠</span>}
                              </td>
                            ))}
                            <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v.bp || '—'}</td>
                            <td style={{
                              fontWeight: 700,
                              color: isAbnormal('spo2', v.spo2) ? 'var(--danger)' : 'var(--t1)',
                            }}>
                              {v.spo2 ? `${v.spo2}%` : '—'}
                              {isAbnormal('spo2', v.spo2) && <span style={{ marginLeft: 3 }}>⚠</span>}
                            </td>
                            <td>{v.gcs || '—'}</td>
                            <td style={{
                              color: isAbnormal('pain', v.pain) ? 'var(--danger)' : 'var(--t1)',
                              fontWeight: v.pain ? 700 : 400,
                            }}>{v.pain || '—'}</td>
                            <td style={{
                              color: isAbnormal('bsl', v.bsl) ? 'var(--danger)' : 'var(--t1)',
                              fontWeight: v.bsl ? 700 : 400,
                            }}>{v.bsl || '—'}</td>
                            <td style={{ fontSize: 11 }}>
                              {v.weight ? `${v.weight}kg` : '—'}
                              {v.height ? ` / ${v.height}cm` : ''}
                            </td>
                            <td style={{ fontSize: 11 }}>{v.recordedBy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* RECORD VITALS MODAL */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16,
            width: '100%', maxWidth: 560, maxHeight: '90vh',
            boxShadow: 'var(--shadow-md)', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <i className="ti ti-activity" style={{ fontSize: 20, color: 'var(--accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Record Vital Signs</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{selected?.surname} {selected?.firstName} · {selected?.emrNumber}</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 18 }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {VITALS_FIELDS.map(f => (
                  <div key={f.key} className="form-group">
                    <label className="form-label">
                      <i className={`ti ${f.icon}`} style={{ marginRight: 4, color: 'var(--accent)' }} />
                      {f.label} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>({f.unit})</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`form-input${isAbnormal(f.key, form[f.key]) ? ' input-danger' : ''}`}
                        placeholder={f.placeholder}
                        value={form[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={isAbnormal(f.key, form[f.key]) ? { borderColor: 'var(--danger)', background: 'var(--danger-bg)' } : {}}
                      />
                      {isAbnormal(f.key, form[f.key]) && (
                        <span style={{
                          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                          fontSize: 10, color: 'var(--danger)', fontWeight: 700,
                        }}>⚠ {NORMAL_RANGES[f.key]?.label}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Clinical Notes (optional)</label>
                <textarea
                  className="form-textarea full-width"
                  rows={2}
                  placeholder="Any additional observations…"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div style={{
                padding: '10px 14px', borderRadius: 10, background: 'var(--accent-bg)',
                border: '1px solid var(--border)', fontSize: 11, color: 'var(--t2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className="ti ti-user-check" style={{ color: 'var(--accent)', fontSize: 15 }} />
                Recording as <strong style={{ color: 'var(--accent)' }}>{profile.displayName}</strong> ({profile.role})
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save Vitals'}
                </button>
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
