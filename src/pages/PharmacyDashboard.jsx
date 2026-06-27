// src/pages/PharmacyDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  listenPendingDispense, listenDispensedToday,
  listenInventory, dispensePrescription,
  getPatient, formatTs,
} from '../lib/emr';
import AllergyAlert, { checkAllergyConflicts } from '../components/patients/AllergyAlert';
import toast from 'react-hot-toast';

const URGENCY_COLOR = { stat:'#ef4444', urgent:'#f97316', routine:'var(--accent)' };

export default function PharmacyDashboard() {
  const { profile }  = useNavigate ? useAuth() : { profile:{} };
  const navigate     = useNavigate();
  const [pending,    setPending]    = useState([]);
  const [dispensed,  setDispensed]  = useState([]);
  const [inventory,  setInventory]  = useState([]);
  const [patients,   setPatients]   = useState({});     // emrNumber → patient
  const [dispensing, setDispensing] = useState(null);   // rx being confirmed
  const [saving,     setSaving]     = useState(false);
  const [allergyAlert, setAllergyAlert] = useState(null); // { conflicts, allergyStr, onConfirm }
  const [tab,        setTab]        = useState('queue'); // 'queue'|'inventory'|'log'
  const [search,     setSearch]     = useState('');

  useEffect(() => {
    const u1 = listenPendingDispense(setPending);
    const u2 = listenDispensedToday(setDispensed);
    const u3 = listenInventory(setInventory);
    return () => { u1?.(); u2?.(); u3?.(); };
  }, []);

  // Fetch patient names for Rx queue
  useEffect(() => {
    const missing = pending.filter(rx => !patients[rx.emrNumber]);
    missing.forEach(async rx => {
      const p = await getPatient(rx.emrNumber);
      if (p) setPatients(prev => ({ ...prev, [rx.emrNumber]: p }));
    });
  }, [pending]);

  const lowStock = inventory.filter(i => i.quantity <= i.reorderAt);

  const doDispense = async (rx) => {
    if (saving) return;
    setSaving(true);
    try {
      const p = patients[rx.emrNumber];
      await dispensePrescription(rx.id, {
        ...rx,
        patientName: p ? `${p.surname} ${p.firstName}` : rx.emrNumber,
      }, profile.displayName || profile.email || 'Pharmacist');
      toast.success('Prescription dispensed');
      setDispensing(null);
    } catch (e) { toast.error('Failed to dispense'); }
    setSaving(false);
  };

  const handleDispense = async (rx) => {
    if (saving) return;
    // ── Allergy check — same cross-reactivity logic used when the Rx was
    // written, run again here in case the patient's allergy record was
    // added/updated after the prescription was written. ──
    const p = patients[rx.emrNumber];
    const allergyStr = p?.allergies?.trim();
    const drugsForCheck = (rx.drugs || []).map(d => ({ drug: d.name || d.drug || '' }));
    const conflicts = checkAllergyConflicts(allergyStr, drugsForCheck);
    if (conflicts.length > 0) {
      setAllergyAlert({ conflicts, allergyStr, onConfirm: () => doDispense(rx) });
      return; // block until pharmacist decides
    }
    await doDispense(rx);
  };

  const tabStyle = (id) => ({
    flex:1, padding:'9px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius:8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color:      tab===id ? '#fff'          : 'var(--t2)',
  });

  const filteredPending = pending.filter(rx => {
    if (!search) return true;
    const p = patients[rx.emrNumber];
    const name = p ? `${p.surname} ${p.firstName}`.toLowerCase() : '';
    return name.includes(search.toLowerCase()) || rx.emrNumber?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', background:'var(--main-bg)' }}>
      {/* ── Topbar ── */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-building-store" style={{color:'#6366f1',marginRight:6}} />
          Pharmacy — {profile?.displayName}
        </div>
        <input
          placeholder="Search patient / EMR…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex:1, maxWidth:240, padding:'7px 12px', borderRadius:20,
            border:'1px solid var(--border)', background:'var(--main-bg)',
            fontSize:12, fontWeight:600, color:'var(--t1)', fontFamily:'var(--font)', outline:'none',
          }}
        />
      </div>

      <div className="page-content">
        {/* ── Summary cards ── */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setTab('queue')}>
            <div className="stat-label"><i className="ti ti-clock" style={{color:'#f97316'}} />Pending Rx</div>
            <div className="stat-value" style={{color:'#f97316'}}>{pending.length}</div>
          </div>
          <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setTab('log')}>
            <div className="stat-label"><i className="ti ti-check" style={{color:'var(--success)'}} />Dispensed Today</div>
            <div className="stat-value" style={{color:'var(--success)'}}>{dispensed.length}</div>
          </div>
          <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setTab('inventory')}>
            <div className="stat-label"><i className="ti ti-packages" style={{color:'var(--accent)'}} />Drug Items</div>
            <div className="stat-value" style={{color:'var(--accent)'}}>{inventory.length}</div>
          </div>
          <div className="stat-card" style={{cursor:'pointer', borderTop: lowStock.length ? '3px solid var(--danger)' : undefined}} onClick={() => { setTab('inventory'); }}>
            <div className="stat-label"><i className="ti ti-alert-triangle" style={{color:'var(--danger)'}} />Low Stock</div>
            <div className="stat-value" style={{color:'var(--danger)'}}>{lowStock.length}</div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{display:'flex', gap:4, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:12}}>
          <button style={tabStyle('queue')}     onClick={() => setTab('queue')}>Pending Queue ({pending.length})</button>
          <button style={tabStyle('inventory')} onClick={() => setTab('inventory')}>Inventory ({inventory.length})</button>
          <button style={tabStyle('log')}       onClick={() => setTab('log')}>Today's Log ({dispensed.length})</button>
        </div>

        {/* ══ PENDING QUEUE ══ */}
        {tab === 'queue' && (
          <div className="card">
            {filteredPending.length === 0
              ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                  <i className="ti ti-circle-check" style={{fontSize:36,display:'block',marginBottom:8,opacity:.3}} />
                  No pending prescriptions
                </div>
              : filteredPending.map(rx => {
                  const p = patients[rx.emrNumber];
                  const name = p ? `${p.surname} ${p.firstName}` : rx.emrNumber;
                  return (
                    <div key={rx.id} style={{padding:'12px 16px', borderBottom:'1px solid var(--border)'}}>
                      <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:8}}>
                        {/* Patient avatar */}
                        <div style={{
                          width:38, height:38, borderRadius:'50%', flexShrink:0,
                          background:'var(--accent-bg)', color:'var(--accent)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:13, fontWeight:800,
                        }}>
                          {(p?.surname?.[0]||'?')+(p?.firstName?.[0]||'')}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontWeight:800, fontSize:14, color:'var(--t1)'}}>{name}</div>
                          <div style={{fontSize:10, color:'var(--t3)'}}>
                            {rx.emrNumber} · {p?.classSet} · Prescribed by {rx.prescribedBy}
                          </div>
                        </div>
                        <span style={{
                          fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6,
                          background: rx.prescribedByRole==='nurse' ? 'var(--warn-bg)' : 'var(--accent-bg)',
                          color: rx.prescribedByRole==='nurse' ? 'var(--warn)' : 'var(--accent)',
                        }}>
                          {rx.prescribedByRole === 'nurse' ? '⚠ Nurse Rx' : 'Doctor Rx'}
                        </span>
                        <div style={{fontSize:10, color:'var(--t3)'}}>{formatTs(rx.createdAt)}</div>
                      </div>

                      {/* Drug list */}
                      <div style={{display:'flex', flexDirection:'column', gap:5, marginBottom:10, paddingLeft:48}}>
                        {(rx.drugs||[]).map((d,i) => {
                          const drugName  = d.name || d.drug || '';
                          const stockItem = inventory.find(inv => inv.name?.toLowerCase() === drugName?.toLowerCase());
                          const stockOk   = !stockItem || stockItem.quantity >= (Number(d.qty)||1);
                          return (
                            <div key={i} style={{
                              display:'flex', alignItems:'center', gap:8,
                              background:'var(--card-bg2)', borderRadius:8, padding:'6px 10px',
                              border:`1px solid ${stockOk?'var(--border)':'var(--danger)'}`,
                            }}>
                              <i className="ti ti-pill" style={{color: stockOk?'var(--accent)':'var(--danger)', fontSize:14}} />
                              <div style={{flex:1}}>
                                <div style={{fontWeight:700, fontSize:13, color:'var(--t1)'}}>{drugName}</div>
                                <div style={{fontSize:10, color:'var(--t3)'}}>
                                  {d.dose} · {d.freq} · {d.duration} · Qty: {d.qty}
                                </div>
                              </div>
                              {stockItem && (
                                <span style={{
                                  fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
                                  background: stockOk ? 'var(--success-bg)' : 'var(--danger-bg)',
                                  color:      stockOk ? 'var(--success)'    : 'var(--danger)',
                                }}>
                                  Stock: {stockItem.quantity} {stockItem.unit}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Dispense button */}
                      {dispensing === rx.id
                        ? <div style={{display:'flex', gap:8, paddingLeft:48}}>
                            <button onClick={() => handleDispense(rx)} disabled={saving} style={{
                              background:'var(--success)', color:'#fff', border:'none', borderRadius:8,
                              padding:'7px 16px', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'var(--font)',
                            }}>
                              {saving ? 'Dispensing…' : 'Confirm Dispense'}
                            </button>
                            <button onClick={() => setDispensing(null)} style={{
                              background:'var(--card-bg2)', color:'var(--t2)', border:'1px solid var(--border)',
                              borderRadius:8, padding:'7px 14px', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'var(--font)',
                            }}>Cancel</button>
                          </div>
                        : <div style={{paddingLeft:48}}>
                            <button onClick={() => setDispensing(rx.id)} style={{
                              background:'var(--accent)', color:'#fff', border:'none', borderRadius:8,
                              padding:'7px 18px', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:'var(--font)',
                              display:'flex', alignItems:'center', gap:6,
                            }}>
                              <i className="ti ti-package-export" style={{fontSize:14}} /> Dispense
                            </button>
                          </div>
                      }
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* ══ INVENTORY ══ */}
        {tab === 'inventory' && (
          <div>
            {lowStock.length > 0 && (
              <div style={{
                background:'var(--danger-bg)', border:'1px solid var(--danger)',
                borderRadius:10, padding:'10px 14px', marginBottom:12,
                fontSize:12, fontWeight:700, color:'var(--danger)',
                display:'flex', alignItems:'center', gap:8,
              }}>
                <i className="ti ti-alert-triangle" style={{fontSize:16}} />
                {lowStock.length} item{lowStock.length!==1?'s':''} below reorder level:
                {' '}{lowStock.map(i=>i.name).join(', ')}
              </div>
            )}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-packages" />Drug Inventory</div>
                <span className="card-action" onClick={() => navigate('/pharmacy')}>
                  Manage Inventory →
                </span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Drug Name</th>
                    <th>Category</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Reorder At</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(item => {
                    const low = item.quantity <= item.reorderAt;
                    return (
                      <tr key={item.id}>
                        <td style={{fontWeight:700}}>{item.name}</td>
                        <td style={{color:'var(--t3)'}}>{item.category}</td>
                        <td style={{fontWeight:800, color: low?'var(--danger)':'var(--success)'}}>{item.quantity}</td>
                        <td style={{color:'var(--t3)'}}>{item.unit}</td>
                        <td style={{color:'var(--t3)'}}>{item.reorderAt}</td>
                        <td>
                          <span className={`badge ${low?'badge-danger':'badge-ok'}`}>
                            {low?'Low Stock':'In Stock'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TODAY'S DISPENSE LOG ══ */}
        {tab === 'log' && (
          <div className="card">
            {dispensed.length === 0
              ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700}}>
                  <i className="ti ti-clipboard-list" style={{fontSize:36,display:'block',marginBottom:8,opacity:.3}} />
                  Nothing dispensed yet today
                </div>
              : dispensed.map(log => (
                  <div key={log.id} style={{padding:'11px 16px', borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:5}}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800, fontSize:13, color:'var(--t1)'}}>{log.patientName || log.emrNumber}</div>
                        <div style={{fontSize:10, color:'var(--t3)'}}>{log.emrNumber} · By {log.dispensedBy} · {formatTs(log.dispensedAt)}</div>
                      </div>
                      <span className="badge badge-ok"><i className="ti ti-check" /> Dispensed</span>
                    </div>
                    <div style={{display:'flex', gap:6, flexWrap:'wrap', paddingLeft:0}}>
                      {(log.drugs||[]).map((d,i) => (
                        <span key={i} style={{
                          fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:6,
                          background:'var(--accent-bg)', color:'var(--accent)',
                        }}>{(d.name||d.drug)} ×{d.qty}</span>
                      ))}
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* ── ALLERGY ALERT MODAL ── */}
      {allergyAlert && (
        <AllergyAlert
          conflicts={allergyAlert.conflicts}
          allergyString={allergyAlert.allergyStr}
          onCancel={() => setAllergyAlert(null)}
          onOverride={async () => {
            setAllergyAlert(null);
            await allergyAlert.onConfirm();
          }}
        />
      )}
    </div>
  );
}
