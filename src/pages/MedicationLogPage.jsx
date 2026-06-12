// src/pages/MedicationLogPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  listenPatients, listenPrescriptions, listenMAR,
  formatTs, formatTime,
} from '../lib/emr';

const STATUS_CFG = {
  given:   { label: 'Given',   color: 'var(--success)', bg: 'var(--success-bg)' },
  held:    { label: 'Held',    color: 'var(--warn)',    bg: 'var(--warn-bg)'    },
  refused: { label: 'Refused', color: 'var(--danger)',  bg: 'var(--danger-bg)'  },
};

export default function MedicationLogPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [patients,    setPatients]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [rxList,      setRxList]      = useState([]);
  const [marList,     setMarList]     = useState([]);
  const [search,      setSearch]      = useState('');
  const [dateFilter,  setDateFilter]  = useState('today');
  const [rxUnsub,     setRxUnsub]     = useState(null);
  const [marUnsub,    setMarUnsub]    = useState(null);

  useEffect(() => {
    const unsub = listenPatients(pts =>
      setPatients(pts.filter(p => p.status === 'active' || p.status === 'sickbay'))
    );
    return unsub;
  }, []);

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

  // All drugs across prescriptions
  const allDrugs = rxList.flatMap(rx =>
    (rx.drugs || []).map(d => ({
      ...d, rxId: rx.id,
      prescribedBy: rx.prescribedBy,
      prescribedByRole: rx.prescribedByRole,
      rxCreatedAt: rx.createdAt,
      requiresCountersign: rx.requiresCountersign,
    }))
  );

  // Filter MAR by date
  const filteredMAR = marList.filter(m => {
    const ts = m.createdAt?.toDate?.();
    if (!ts) return false;
    if (dateFilter === 'today') {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return ts >= today;
    }
    if (dateFilter === 'week') {
      const week = new Date(); week.setDate(week.getDate() - 7);
      return ts >= week;
    }
    return true; // all
  });

  // Group MAR by drug name
  const marByDrug = {};
  filteredMAR.forEach(m => {
    const key = m.drug;
    if (!marByDrug[key]) marByDrug[key] = [];
    marByDrug[key].push(m);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-pill" style={{ marginRight: 6, color: 'var(--accent)' }} />
          Medication Log
        </div>
        {selected && (
          <div style={{ display: 'flex', gap: 6 }}>
            {['today', 'week', 'all'].map(f => (
              <button
                key={f}
                className={`btn btn-sm${dateFilter === f ? ' btn-primary' : ''}`}
                onClick={() => setDateFilter(f)}
                style={{ textTransform: 'capitalize' }}
              >
                {f === 'today' ? 'Today' : f === 'week' ? 'This Week' : 'All Time'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT */}
        {!selected && (
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
        )}

        {/* RIGHT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', gap: 12 }}>
              <i className="ti ti-pill" style={{ fontSize: 48, opacity: .3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Select a patient</div>
              <div style={{ fontSize: 12 }}>View complete medication administration history</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'var(--card-bg)',
                borderRadius: 12, border: '1px solid var(--border)',
              }}>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelected(null)}
                  style={{ flexShrink: 0 }}
                  title="Back to patient list"
                >
                  <i className="ti ti-arrow-left" />
                </button>
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
                    {selected.knownAllergies && <>
                      <span>·</span>
                      <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ {selected.knownAllergies}</span>
                    </>}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => navigate(`/patient/${selected.emrNumber}`)}>
                  <i className="ti ti-external-link" /> Profile
                </button>
              </div>

              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Records', value: filteredMAR.length, icon: 'ti-list', color: 'var(--accent)' },
                  { label: 'Given', value: filteredMAR.filter(m => m.status === 'given').length, icon: 'ti-circle-check', color: 'var(--success)' },
                  { label: 'Held / Refused', value: filteredMAR.filter(m => m.status !== 'given').length, icon: 'ti-circle-x', color: 'var(--danger)' },
                ].map(s => (
                  <div key={s.label} className="card" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <i className={`ti ${s.icon}`} style={{ fontSize: 22, color: s.color }} />
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>{s.label}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Active prescriptions summary */}
              {allDrugs.length > 0 && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><i className="ti ti-prescription" /> Current Prescriptions</div>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>{allDrugs.length} drug{allDrugs.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 16px 14px' }}>
                    {allDrugs.map((d, i) => (
                      <span key={i} style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                        background: 'var(--accent-bg)', color: 'var(--accent)',
                        border: '1px solid var(--border)',
                      }}>
                        {d.drug} {d.dose && `· ${d.dose}`}
                        {d.requiresCountersign && (
                          <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--warn-bg)', color: 'var(--warn)', padding: '1px 5px', borderRadius: 8 }}>
                            Nurse Rx
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Medication log table */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-history" /> Administration Log</div>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{filteredMAR.length} entr{filteredMAR.length !== 1 ? 'ies' : 'y'}</span>
                </div>
                {filteredMAR.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>
                    <i className="ti ti-pill-off" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                    <div style={{ fontWeight: 700 }}>No records for this period</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Change the date filter or administer via MAR</div>
                  </div>
                ) : (
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
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredMAR].reverse().map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize: 11, color: 'var(--t3)' }}>{formatTs(m.createdAt)}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{m.administeredAt}</td>
                          <td style={{ fontWeight: 700 }}>{m.drug}</td>
                          <td style={{ color: 'var(--t2)' }}>{m.dose || '—'}</td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: 'var(--card-bg2)', color: 'var(--t2)',
                            }}>{m.route}</span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: STATUS_CFG[m.status]?.bg || 'var(--card-bg2)',
                              color: STATUS_CFG[m.status]?.color || 'var(--t2)',
                            }}>
                              {STATUS_CFG[m.status]?.label || m.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 11 }}>
                            <div>{m.administeredBy}</div>
                            <div style={{ color: 'var(--t3)', textTransform: 'capitalize', fontSize: 10 }}>{m.administeredByRole}</div>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--t3)' }}>{m.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
