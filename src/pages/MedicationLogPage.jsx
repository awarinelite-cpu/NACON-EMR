// src/pages/MedicationLogPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { listenPatients, listenPrescriptions } from '../lib/emr';
import MARTab from '../components/patients/MARTab';

export default function MedicationLogPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [patients,    setPatients]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [rxList,      setRxList]      = useState([]);
  const [search,      setSearch]      = useState('');
  const [rxUnsub,     setRxUnsub]     = useState(null);

  useEffect(() => {
    const unsub = listenPatients(pts =>
      setPatients(pts.filter(p => p.status === 'active' || p.status === 'sickbay'))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (rxUnsub) rxUnsub();
    if (!selected) { setRxList([]); return; }
    const u1 = listenPrescriptions(selected.emrNumber, setRxList);
    setRxUnsub(() => u1);
    return () => { u1(); };
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-pill" style={{ marginRight: 6, color: 'var(--accent)' }} />
          Medication Log
        </div>
      </div>

      <div className="mar-split" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT */}
        {!selected && (
        <div className="mar-patient-list" style={{
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
          <div className="mar-patient-list-scroll" style={{ flex: 1, overflowY: 'auto' }}>
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
        <div className="mar-detail-panel" style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', gap: 12 }}>
              <i className="ti ti-pill" style={{ fontSize: 48, opacity: .3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Select a patient</div>
              <div style={{ fontSize: 12 }}>View complete medication administration history</div>
            </div>
          ) : (
            <>
              {/* Patient header + medication charts: ONE card */}
              <div className="card mar-embedded" style={{ overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  {/* Back (top-left corner) and Profile (top-right corner), so the name below gets the full width */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => setSelected(null)}
                      title="Back to patient list"
                    >
                      <i className="ti ti-arrow-left" />
                    </button>
                    <button className="btn btn-sm" onClick={() => navigate(`/patient/${selected.emrNumber}`)}>
                      <i className="ti ti-external-link" /> Profile
                    </button>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.surname} {selected.firstName}</div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 2 }}>
                      <span style={{ fontFamily: 'var(--mono)' }}>{selected.emrNumber}</span>
                      <span>·</span>
                      <span>{selected.classSet}</span>
                      {selected.knownAllergies && <>
                        <span>·</span>
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠ {selected.knownAllergies}</span>
                      </>}
                    </div>
                  </div>
                </div>

                {/* Same MAR chart as the patient profile MAR tab */}
                <MARTab
                  key={selected.emrNumber}
                  emrNumber={selected.emrNumber}
                  visitId={null}
                  prescriptions={rxList}
                  patient={selected}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
