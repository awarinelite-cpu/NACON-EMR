// src/pages/PatientProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  getPatient, listenNotes, listenVitals, listenPrescriptions,
  listenFluidChart, listenGlucoseChart, listenUploads,
  addNote, addVitals, addPrescription, addFluidEntry,
  addGlucoseReading, uploadPatientFile, createReferral,
  dischargePatient, createVisit, formatTs, formatTime,
  formatDateTime, ROLES, reportSick,
  saveNHISForm, saveNACONForm, listenPatientForms,
  requestLabTest, listenPatientLabRequests, listenPatientLabResults, LAB_TESTS,
} from '../lib/emr';

import MARTab from '../components/patients/MARTab';
import VitalsTrendChart from '../components/patients/VitalsTrendChart';
import NewsScore from '../components/patients/NewsScore';
import AllergyAlert, { checkAllergyConflicts, checkAllergyConflictsInText } from '../components/patients/AllergyAlert';

const TABS = [
  { id:'visit',    label:'Visit',           icon:'🏥',  roles: ['doctor','nurse','admin','subadmin'] },
  { id:'vitals',   label:'Vitals',          icon:'❤️',  roles: ['doctor','nurse','admin','subadmin'] },
  { id:'rx',       label:'Prescription',    icon:'💊',  roles: ['doctor','nurse'] },
  { id:'fluid',    label:'Fluid I/O',       icon:'💧',  roles: ['doctor','nurse'] },
  { id:'glucose',  label:'Glycemic',        icon:'🩸',  roles: ['doctor','nurse'] },
  { id:'nursing',  label:'Nursing',         icon:'📋',  roles: ['nurse'] },
  { id:'doctor',   label:"Doctor's Report", icon:'🩺',  roles: ['doctor'] },
  { id:'mar',      label:'MAR',             icon:'💉',  roles: ['doctor','nurse'] },
  { id:'lab',      label:'Lab',             icon:'🔬',  roles: ['doctor','nurse','lab','admin','subadmin'] },
  { id:'referral', label:'Transfer/D/C',    icon:'🔄',  roles: ['doctor','nurse'] },
  { id:'uploads',  label:'Documents',       icon:'📁',  roles: ['doctor','nurse','records','admin','subadmin','lab'] },
];

const vitalFlag = (key, val) => {
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  if (key==='temp')  return v>37.5?'high':v<36?'low':'ok';
  if (key==='sbp')   return v>139?'high':v<90?'low':'ok';
  if (key==='hr')    return v>100?'high':v<60?'low':'ok';
  if (key==='spo2')  return v<95?'high':'ok';
  if (key==='rr')    return v>20?'high':v<12?'low':'ok';
  return 'ok';
};

export default function PatientProfile() {
  const { emrNumber } = useParams();
  const { profile }   = useAuth();
  const navigate      = useNavigate();

  const isRecordsRole = profile?.role?.toLowerCase() === ROLES.RECORDS;
  const [patient,   setPatient]   = useState(null);
  const [activeTab, setActiveTab] = useState(isRecordsRole ? 'uploads' : 'visit');
  const [notes,     setNotes]     = useState([]);
  const [vitals,    setVitals]    = useState([]);
  const [rx,        setRx]        = useState([]);
  const [fluid,     setFluid]     = useState([]);
  const [glucose,   setGlucose]   = useState([]);
  const [uploads,   setUploads]   = useState([]);
  const [labRequests, setLabRequests] = useState([]);
  const [labResults,  setLabResults]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [visitId,   setVisitId]   = useState(null);
  const scrollRef     = useRef(null);
  const collapseRef   = useRef(null);
  const lastScroll    = useRef(0);
  const isCollapsed   = useRef(false);

  const [noteText,  setNoteText]  = useState('');
  const [vitalForm, setVitalForm] = useState({ sbp:'', dbp:'', hr:'', temp:'', rr:'', spo2:'' });
  const [rxForm,    setRxForm]    = useState([{ drug:'', dose:'', frequency:'', duration:'' }]);
  const [rxHistoryOpen, setRxHistoryOpen] = useState(false); // prescription history collapsed by default
  // Official printed Rx form state (NHIS for soldiers, NACON for civilians)
  const [officialRx,    setOfficialRx]    = useState(null);   // null = collapsed, object = open
  const [officialRxSaving, setOfficialRxSaving] = useState(false);
  const officialRxPrintRef = useRef(null);
  // Saved official forms history
  const [savedForms,    setSavedForms]    = useState([]);
  const [viewSavedForms, setViewSavedForms] = useState(false);  // modal open/close
  // Tracks when the last official form was saved; used to exclude already-printed Rx from next form
  const [officialRxSavedAt, setOfficialRxSavedAt] = useState(null);
  const [fluidForm, setFluidForm] = useState({ time:'', intakeAmt:'', intakeType:'', outputAmt:'', outputType:'' });
  const [glucForm,  setGlucForm]  = useState({ time:'', reading:'', context:'' });
  const [refForm,   setRefForm]   = useState({ to:'', purpose:'', clinicalNotes:'' });
  const [selectedEvent, setSelectedEvent] = useState(null); // timeline detail drawer
  const [viewOnly,       setViewOnly]       = useState(false);  // action buttons open view-only
  const [allergyAlert, setAllergyAlert] = useState(null); // { conflicts, pendingRx }
  const fileInput = useRef();

  // Scroll listener: collapse vitals+actions using DOM classList (no re-render = no shake)
  const handleScroll = () => {
    const el  = scrollRef.current;
    const col = collapseRef.current;
    if (!el || !col) return;
    const currentY = el.scrollTop;
    const diff     = currentY - lastScroll.current;
    // collapse on scroll-down: any downward movement past 60px
    if (diff > 2 && currentY > 60 && !isCollapsed.current) {
      col.classList.add('pp-collapsed');
      isCollapsed.current = true;
    }
    // expand when scrolling up (any meaningful upward swipe)
    if (diff < -8 && isCollapsed.current) {
      col.classList.remove('pp-collapsed');
      isCollapsed.current = false;
    }
    // also expand when near the very top
    if (currentY < 20 && isCollapsed.current) {
      col.classList.remove('pp-collapsed');
      isCollapsed.current = false;
    }
    lastScroll.current = currentY <= 0 ? 0 : currentY;
  };

  useEffect(() => {
    (async () => {
      const p = await getPatient(emrNumber);
      if (!p) { toast.error('Patient not found'); navigate(-1); return; }
      setPatient(p);
      setLoading(false);
      const vid = await createVisit(emrNumber, { type:'outpatient', date:new Date().toISOString() }, profile?.displayName);
      setVisitId(vid);
    })();
  }, [emrNumber]);

  useEffect(() => {
    if (!emrNumber) return;
    // Records staff only need uploads — skip all clinical listeners
    if (isRecordsRole) {
      const unsub = listenUploads(emrNumber, setUploads);
      return () => unsub && unsub();
    }
    const unsubs = [
      listenNotes(emrNumber,           setNotes),
      listenVitals(emrNumber,          setVitals),
      listenPrescriptions(emrNumber,   setRx),
      listenFluidChart(emrNumber,      setFluid),
      listenGlucoseChart(emrNumber,    setGlucose),
      listenUploads(emrNumber,         setUploads),
      listenPatientForms(emrNumber,    setSavedForms),
      listenPatientLabRequests(emrNumber, setLabRequests),
      listenPatientLabResults(emrNumber,  setLabResults),
    ];
    return () => unsubs.forEach(u => u && u());
  }, [emrNumber]);

  // Auto-sync the official Rx form's drug field whenever new prescriptions are saved.
  // Runs at top level (not inside IIFE) so React hook rules are respected.
  useEffect(() => {
    if (!officialRx) return;
    // Compute cutoff: latest saved official form timestamp, persists across reloads
    const lastSavedFormAt = savedForms.length > 0
      ? (savedForms[0].savedAt?.seconds || 0) * 1000
      : 0;
    const cutoff = Math.max(lastSavedFormAt, officialRxSavedAt || 0);
    const newRxLines = rx
      .filter(r => {
        const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : (r.createdAt || 0);
        return ts > cutoff;
      })
      .flatMap(r => r.drugs || [])
      .map(d => [d.drug, d.dose, d.frequency, d.duration].filter(Boolean).join('  '))
      .filter(Boolean);
    const draftLines = rxForm
      .filter(r => r.drug.trim())
      .map(r => [r.drug, r.dose, r.frequency, r.duration].filter(Boolean).join('  '));
    const autoRxText = [...newRxLines, ...draftLines].join('\n');
    setOfficialRx(prev => prev ? { ...prev, rx: autoRxText } : prev);
  }, [rx, rxForm, savedForms, officialRxSavedAt]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--main-bg)' }}>
      <i className="ti ti-loader-2" style={{ fontSize:32, animation:'spin 1s linear infinite', color:'var(--accent)' }} />

      {/* ══ TIMELINE EVENT DETAIL DRAWER ══ */}
      {selectedEvent && (
        <div style={{
          position:'fixed', inset:0, zIndex:2000,
          background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end',
        }} onClick={() => setSelectedEvent(null)}>
          <div style={{
            width:'100%', maxHeight:'80vh',
            background:'var(--card-bg)',
            borderRadius:'18px 18px 0 0',
            display:'flex', flexDirection:'column',
            overflow:'hidden',
            boxShadow:'0 -4px 32px rgba(0,0,0,0.25)',
          }} onClick={e => e.stopPropagation()}>

            {/* Drawer header */}
            <div style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'14px 16px',
              borderBottom:'1px solid var(--border)',
              flexShrink:0,
            }}>
              <div style={{
                width:34, height:34, borderRadius:10,
                background: tlColor[selectedEvent.type] + '22',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0,
              }}>
                <i className={`ti ${tlIcon[selectedEvent.type]}`} style={{ color: tlColor[selectedEvent.type], fontSize:18 }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{tlTitle[selectedEvent.type]}</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>{formatDateTime(selectedEvent.ts)}</div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{
                background:'var(--card-bg2)', border:'none', borderRadius:8,
                width:32, height:32, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--t2)', flexShrink:0,
              }}>
                <i className="ti ti-x" style={{ fontSize:16 }} />
              </button>
            </div>

            {/* Drawer body — scrollable */}
            <div style={{ overflowY:'auto', padding:'16px', overscrollBehavior:'none' }}>

              {/* ── NOTE ── */}
              {selectedEvent.type === 'note' && (() => {
                const n = selectedEvent.data;
                return (
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <div style={{
                        background: n.authorRole==='doctor'?'var(--success-bg)':'var(--info-bg)',
                        color: n.authorRole==='doctor'?'var(--success)':'var(--info)',
                        width:30, height:30, borderRadius:'50%',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:700,
                      }}>{(n.authorName||'').slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)' }}>{n.authorName}</div>
                        <span className={`badge ${n.authorRole==='doctor'?'badge-ok':'badge-info'}`} style={{ fontSize:9 }}>
                          {n.authorRole==='doctor'?"Doctor's note":"Nursing note"}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:10, padding:'14px',
                      fontSize:13, fontWeight:500, color:'var(--t1)', lineHeight:1.8,
                      whiteSpace:'pre-line',
                    }}>{n.text}</div>
                  </div>
                );
              })()}

              {/* ── VITALS ── */}
              {selectedEvent.type === 'vitals' && (() => {
                const v = selectedEvent.data;
                const rows = [
                  { label:'Blood Pressure', value:`${v.sbp}/${v.dbp}`, unit:'mmHg', key:'sbp', icon:'ti-heartbeat' },
                  { label:'Heart Rate',     value:v.hr,   unit:'bpm',   key:'hr',   icon:'ti-heart-rate-monitor' },
                  { label:'Temperature',    value:v.temp, unit:'°C',    key:'temp', icon:'ti-temperature' },
                  { label:'Resp. Rate',     value:v.rr,   unit:'/min',  key:'rr',   icon:'ti-lungs' },
                  { label:'SpO₂',           value:v.spo2, unit:'%',     key:'spo2', icon:'ti-activity' },
                  { label:'Weight',         value:v.weight||'—', unit:'kg', key:'', icon:'ti-scale' },
                ];
                return (
                  <div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      {rows.map(r => {
                        const flag = r.key ? vitalFlag(r.key, r.value) : 'ok';
                        const clr  = flag==='high'?'var(--danger)':flag==='low'?'var(--warn)':'var(--t1)';
                        const bg   = flag==='high'?'var(--danger-bg)':flag==='low'?'var(--warn-bg)':'var(--card-bg2)';
                        return (
                          <div key={r.label} style={{ background:bg, borderRadius:10, padding:'12px 14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                              <i className={`ti ${r.icon}`} style={{ fontSize:13, color:clr }} />
                              <span style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase' }}>{r.label}</span>
                            </div>
                            <div style={{ fontSize:22, fontWeight:700, color:clr, lineHeight:1 }}>{r.value}</div>
                            <div style={{ fontSize:10, color:'var(--t3)', marginTop:2 }}>{r.unit}</div>
                          </div>
                        );
                      })}
                    </div>
                    {v.notes && (
                      <div style={{ background:'var(--card-bg2)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', marginBottom:5 }}>Observations</div>
                        <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>{v.notes}</div>
                      </div>
                    )}
                    <div style={{ marginTop:10, fontSize:11, color:'var(--t3)' }}>Recorded by: <b style={{ color:'var(--t2)' }}>{v.recordedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── PRESCRIPTION ── */}
              {selectedEvent.type === 'rx' && (() => {
                const r = selectedEvent.data;
                return (
                  <div>
                    {r.requiresCountersign && (
                      <div className="alert alert-warn" style={{ marginBottom:12 }}>
                        <i className="ti ti-alert-triangle" /> Nurse prescription — requires doctor countersignature
                      </div>
                    )}
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                      {r.drugs?.map((d, i) => (
                        <div key={i} style={{
                          background:'var(--card-bg2)', borderRadius:10, padding:'12px 14px',
                          display:'flex', alignItems:'center', gap:12,
                        }}>
                          <div style={{
                            width:36, height:36, borderRadius:9,
                            background:'var(--success-bg)', color:'var(--success)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:18, flexShrink:0,
                          }}>💊</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{d.drug}</div>
                            <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                              {[d.dose, d.frequency, d.duration].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>Prescribed by: <b style={{ color:'var(--t2)' }}>{r.prescribedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── FLUID ── */}
              {selectedEvent.type === 'fluid' && (() => {
                const f = selectedEvent.data;
                return (
                  <div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      <div style={{ background:'var(--info-bg)', borderRadius:10, padding:'14px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--info)', textTransform:'uppercase', marginBottom:4 }}>💧 Intake</div>
                        <div style={{ fontSize:28, fontWeight:700, color:'var(--info)' }}>{f.intakeAmt || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--info)' }}>ml</div>
                        {f.intakeType && <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{f.intakeType}</div>}
                      </div>
                      <div style={{ background:'var(--warn-bg)', borderRadius:10, padding:'14px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--warn)', textTransform:'uppercase', marginBottom:4 }}>🔴 Output</div>
                        <div style={{ fontSize:28, fontWeight:700, color:'var(--warn)' }}>{f.outputAmt || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--warn)' }}>ml</div>
                        {f.outputType && <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{f.outputType}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                      Time: <b style={{ color:'var(--t2)' }}>{f.time || formatTime(f.recordedAt)}</b>
                      {' · '}Recorded by: <b style={{ color:'var(--t2)' }}>{f.recordedBy}</b>
                    </div>
                  </div>
                );
              })()}

              {/* ── GLUCOSE ── */}
              {selectedEvent.type === 'glucose' && (() => {
                const g = selectedEvent.data;
                const val = parseFloat(g.reading);
                const status = val<4?'Low':val>10?'High':val>7?'Elevated':'Normal';
                const scls   = val<4?'badge-warn':val>10?'badge-danger':val>7?'badge-warn':'badge-ok';
                const clr    = val<4?'var(--warn)':val>10?'var(--danger)':val>7?'var(--warn)':'var(--success)';
                return (
                  <div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:14, padding:'24px',
                      textAlign:'center', marginBottom:12,
                    }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', marginBottom:6 }}>Blood Glucose</div>
                      <div style={{ fontSize:52, fontWeight:700, color:clr, lineHeight:1 }}>{g.reading}</div>
                      <div style={{ fontSize:13, color:'var(--t3)', marginTop:4 }}>mmol/L</div>
                      <span className={`badge ${scls}`} style={{ marginTop:10, display:'inline-flex', fontSize:12, padding:'4px 14px' }}>{status}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>
                      Context: <b style={{ color:'var(--t2)' }}>{g.context || '—'}</b>
                      {' · '}Time: <b style={{ color:'var(--t2)' }}>{g.time || formatTime(g.recordedAt)}</b>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>Recorded by: <b style={{ color:'var(--t2)' }}>{g.recordedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── FILE UPLOAD ── */}
              {selectedEvent.type === 'upload' && (() => {
                const u = selectedEvent.data;
                const isPdf = u.fileType?.includes('pdf');
                return (
                  <div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:12, padding:'20px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:10,
                      marginBottom:12,
                    }}>
                      <i className={`ti ${isPdf?'ti-file-text':'ti-photo'}`} style={{ fontSize:44, color:'var(--accent)' }} />
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)', textAlign:'center' }}>{u.fileName}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{u.category} · {Math.round((u.fileSize||0)/1024)}KB</div>
                    </div>
                    <a href={u.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary"
                      style={{ display:'flex', justifyContent:'center', textDecoration:'none', width:'100%' }}>
                      <i className="ti ti-external-link" /> Open file
                    </a>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:10 }}>Uploaded by: <b style={{ color:'var(--t2)' }}>{u.uploadedBy}</b></div>
                  </div>
                );
              })()}

            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isDoctor     = profile?.role?.toLowerCase() === ROLES.DOCTOR;
  const isNurse      = profile?.role?.toLowerCase() === ROLES.NURSE;
  const isRecords    = isRecordsRole;
  const canPrescribe = isDoctor || isNurse;
  const latestV      = vitals[0];
  const activeMeds   = rx.reduce((a, r) => a + (r.drugs?.length || 0), 0);

  // Ensure visitId exists before saving
  // If visitId from useEffect isn't ready yet, use a local fallback so saves never block
  const ensureVisitId = async () => {
    if (visitId) return visitId;
    // Fallback: generate a local ID so Firestore write is never blocked
    const fallback = `visit_${emrNumber}_${Date.now()}`;
    setVisitId(fallback);
    return fallback;
  };

  // ── SAVE HANDLERS ──
  const saveNote = async () => {
    if (!noteText.trim()) { toast.error('Write a note first'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addNote(emrNumber, vid, { text: noteText, type: isDoctor?'doctor':'nurse' }, profile.displayName || profile.email || 'Unknown', profile.role);
      setNoteText(''); toast.success('Note saved');
    } catch(e) { console.error('saveNote',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveVitals = async () => {
    if (!vitalForm.sbp && !vitalForm.temp) { toast.error('Enter at least BP or temperature'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addVitals(emrNumber, vid, vitalForm, profile.displayName || profile.email || 'Unknown');
      setVitalForm({ sbp:'', dbp:'', hr:'', temp:'', rr:'', spo2:'' });
      toast.success('Vitals recorded');
    } catch(e) { console.error('saveVitals',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveRx = async () => {
    const valid = rxForm.filter(r => r.drug.trim());
    if (!valid.length) { toast.error('Add at least one medication'); return; }
    if (!profile) { toast.error('Not logged in'); return; }

    // ── Allergy check ──
    const allergyStr = patient?.allergies?.trim();
    const conflicts = checkAllergyConflicts(allergyStr, valid);
    if (conflicts.length > 0) {
      setAllergyAlert({ conflicts, pendingRx: valid, allergyStr, onConfirm: () => doSaveRx(valid) });
      return; // block until user decides
    }
    await doSaveRx(valid);
  };

  const doSaveRx = async (drugs) => {
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addPrescription(emrNumber, vid, drugs, profile.displayName || profile.email || 'Unknown', profile.role || 'nurse');
      setRxForm([{ drug:'', dose:'', frequency:'', duration:'' }]);
      toast.success(isNurse ? 'Rx saved — countersign required' : 'Prescription saved');
    } catch(e) { console.error('saveRx',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveFluid = async () => {
    if (!fluidForm.time) { toast.error('Enter the time'); return; }
    if (!profile) { toast.error('Not logged in'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addFluidEntry(emrNumber, vid, fluidForm, profile.displayName || profile.email || 'Unknown');
      setFluidForm({ time:'', intakeAmt:'', intakeType:'', outputAmt:'', outputType:'' });
      toast.success('Fluid entry added');
    } catch(e) { console.error('saveFluid',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveGlucose = async () => {
    if (!glucForm.reading) { toast.error('Enter glucose reading'); return; }
    if (!profile) { toast.error('Not logged in'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addGlucoseReading(emrNumber, vid, glucForm, profile.displayName || profile.email || 'Unknown');
      setGlucForm({ time:'', reading:'', context:'' });
      toast.success('Glucose reading added');
    } catch(e) { console.error('saveGlucose',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      await uploadPatientFile(emrNumber, visitId, file, 'lab_result', profile.displayName || profile.email || 'Unknown');
      toast.success(`${file.name} uploaded`);
    } catch { toast.error('Upload failed'); }
    setSaving(false);
    e.target.value = '';
  };

  const handleReferral = async () => {
    if (!refForm.to) { toast.error('Enter referral destination'); return; }
    setSaving(true);
    try {
      await createReferral(emrNumber, visitId, refForm, profile.displayName || profile.email || 'Unknown');
      toast.success('Referral created'); navigate(-1);
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleDischarge = async () => {
    if (!window.confirm('Discharge this patient?')) return;
    setSaving(true);
    try {
      await dischargePatient(emrNumber, visitId, 'Discharged in good condition', profile.displayName || profile.email || 'Unknown');
      toast.success('Patient discharged'); navigate(-1);
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleReportSick = async () => {
    if (!window.confirm(`Record ${patient.surname} ${patient.firstName} as reported sick today?`)) return;
    setSaving(true);
    try {
      await reportSick(emrNumber, profile.displayName || profile.email || 'Unknown', 'manual');
      toast.success('Reported sick — recorded successfully');
      // Refresh patient data to show updated badge
      const p = await getPatient(emrNumber);
      if (p) setPatient(p);
    } catch { toast.error('Failed to record sick report'); }
    setSaving(false);
  };

  // ── TIMELINE ──
  // Records staff see only uploaded documents, not clinical events
  const CLINICAL_TYPES = ['note', 'vitals', 'fluid', 'glucose', 'rx'];
  const timeline = [
    ...(isRecords ? [] : notes.map(n   => ({ ts:n.createdAt,   type:'note',    data:n }))),
    ...(isRecords ? [] : vitals.map(v  => ({ ts:v.recordedAt,  type:'vitals',  data:v }))),
    ...(isRecords ? [] : fluid.map(f   => ({ ts:f.recordedAt,  type:'fluid',   data:f }))),
    ...(isRecords ? [] : glucose.map(g => ({ ts:g.recordedAt,  type:'glucose', data:g }))),
    ...uploads.map(u => ({ ts:u.uploadedAt,  type:'upload',  data:u })),
  ].sort((a,b) => ((b.ts?.seconds||0)-(a.ts?.seconds||0)));

  const tlDesc = (item) => {
    if (item.type==='note')    return `${item.data.authorRole==='doctor'?"Doctor's note":"Nursing note"} — ${item.data.text?.slice(0,100)}`;
    if (item.type==='vitals')  return `BP ${item.data.sbp}/${item.data.dbp} · HR ${item.data.hr} · Temp ${item.data.temp}°C · SpO₂ ${item.data.spo2}%`;
    if (item.type==='rx')      return `Prescription — ${item.data.drugs?.map(d=>d.drug).join(', ')}`;
    if (item.type==='fluid')   return `Fluid — In: ${item.data.intakeAmt}ml Out: ${item.data.outputAmt}ml`;
    if (item.type==='glucose') return `Blood glucose ${item.data.reading} mmol/L (${item.data.context})`;
    if (item.type==='upload')  return `File: ${item.data.fileName}`;
    return '';
  };

  const tlColor = { note:'#2E7FDB', vitals:'#E53935', rx:'#1A7A4A', fluid:'#0288D1', glucose:'#F57C00', upload:'#6C3CE1' };
  const tlIcon  = { note:'ti-notes-medical', vitals:'ti-heart-rate-monitor', rx:'ti-pill', fluid:'ti-droplet', glucose:'ti-activity', upload:'ti-upload' };
  const tlTitle = { note:'Clinical note', vitals:'Vitals recorded', rx:'Prescription', fluid:'Fluid entry', glucose:'Glucose reading', upload:'File uploaded' };

  const statusColor = patient.status === 'active' ? '#22C55E' : patient.status === 'discharged' ? '#64748B' : '#F59E0B';

  // Check if patient already reported sick today
  const reportedSickToday = (() => {
    const ts = patient.reportedSickAt;
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date(); today.setHours(0,0,0,0);
    return d >= today;
  })();

  return (
    <div style={{ display:'flex', flexDirection:'column', background:'var(--main-bg)', height:'100%', overflowY:'auto', overscrollBehavior:'none' }}>

      {/* ══ HEADER BAR — always visible ══ */}
      <div style={{
        background:'var(--card-bg)',
        borderBottom:'1px solid var(--border)',
        padding:'10px 14px 10px 58px',
        display:'flex', alignItems:'center', gap:10,
        flexShrink:0,
        minHeight: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background:'none', border:'1px solid var(--border)', borderRadius:8,
          padding:'5px 10px', cursor:'pointer', color:'var(--t2)',
          fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:5,
          fontFamily:'var(--font)', flexShrink:0,
        }}>
          <i className="ti ti-arrow-left" style={{fontSize:14}} /> Back
        </button>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <h2 style={{ fontSize:15, fontWeight:700, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {patient.surname} {patient.firstName} {patient.otherNames}
            </h2>
            <span style={{
              background: statusColor + '22', color: statusColor,
              fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20,
              border:`1px solid ${statusColor}44`,
              textTransform:'capitalize', flexShrink:0,
            }}>{patient.status}</span>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:2, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>
              {patient.emrNumber}
            </span>
            <span style={{ fontSize:10, color:'var(--t3)' }}>· {patient.classSet} · {patient.folderNumber}</span>
            {patient.knownAllergies && (
              <span style={{ fontSize:10, color:'var(--danger)', fontWeight:700 }}>
                ⚠ {patient.knownAllergies}
              </span>
            )}
          </div>
        </div>

        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          {isNurse && (
            <button onClick={handleReportSick} disabled={saving || reportedSickToday} style={{
              background: reportedSickToday ? 'var(--success-bg, #d1fae5)' : '#f97316',
              border: 'none', borderRadius:8,
              padding:'5px 10px', cursor: reportedSickToday ? 'default' : 'pointer',
              color: reportedSickToday ? '#065f46' : '#fff',
              fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5,
              fontFamily:'var(--font)', opacity: saving ? 0.6 : 1,
            }}>
              <i className={`ti ${reportedSickToday ? 'ti-check' : 'ti-stethoscope'}`} style={{fontSize:13}} />
              {reportedSickToday ? 'Reported Sick ✓' : 'Report Sick'}
            </button>
          )}
          {(isDoctor || isNurse) && (
            <button onClick={() => setActiveTab('referral')} style={{
              background:'none', border:'1px solid var(--border)', borderRadius:8,
              padding:'5px 10px', cursor:'pointer', color:'var(--t2)',
              fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5,
              fontFamily:'var(--font)',
            }}>
              <i className="ti ti-transfer" style={{fontSize:13}} /> Transfer/D/C
            </button>
          )}
          <button onClick={() => window.print()} style={{
            background:'none', border:'1px solid var(--border)', borderRadius:8,
            padding:'5px 10px', cursor:'pointer', color:'var(--t2)',
            fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5,
            fontFamily:'var(--font)',
          }}>
            <i className="ti ti-printer" style={{fontSize:13}} /> Print
          </button>
        </div>
      </div>

      {/* ══ ALLERGY / CHRONIC CONDITION ALERT BANNER ══ */}
      {(() => {
        const allergies = patient.allergies?.trim();
        const chronic   = patient.pastMedHistory?.trim();
        const CHRONIC_KEYWORDS = ['asthma','sickle cell','diabetes','epilepsy','hypertension',
          'hiv','hepatitis','heart','renal','kidney','liver','stroke','cancer','lupus','thyroid'];
        const hasAllergy  = allergies && allergies.toLowerCase() !== 'none' && allergies.toLowerCase() !== 'nil';
        const hasChronic  = chronic && CHRONIC_KEYWORDS.some(k => chronic.toLowerCase().includes(k));
        if (!hasAllergy && !hasChronic) return null;
        return (
          <div style={{
            background:'#7f1d1d', borderBottom:'2px solid #ef4444',
            padding:'8px 14px', display:'flex', alignItems:'flex-start',
            gap:10, flexShrink:0,
          }}>
            <i className="ti ti-alert-triangle" style={{ fontSize:18, color:'#fca5a5', flexShrink:0, marginTop:1 }} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:11, fontWeight:800, color:'#fca5a5', letterSpacing:'.05em', marginBottom:2 }}>
                ⚠ CLINICAL ALERT
              </div>
              {hasAllergy && (
                <div style={{ fontSize:12, fontWeight:700, color:'#fee2e2', marginBottom:2 }}>
                  <span style={{ color:'#fca5a5' }}>ALLERGY: </span>{allergies.toUpperCase()}
                </div>
              )}
              {hasChronic && (
                <div style={{ fontSize:12, fontWeight:700, color:'#fee2e2' }}>
                  <span style={{ color:'#fca5a5' }}>CHRONIC CONDITION: </span>{chronic}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ══ COLLAPSIBLE SECTION: Vitals cards + Action buttons ══ */}
      <div ref={collapseRef} className="pp-collapsible">
        {/* Vital Stat Cards — hidden for records staff */}
        {!isRecords && (
        <div style={{
          display:'grid',
          gridTemplateColumns:'repeat(5, 1fr)',
          gap:8, padding:'10px 14px 0',
        }}>
          {[
            { label:'BP',   value: latestV ? `${latestV.sbp}/${latestV.dbp}` : '—', unit:'mmHg',  icon:'ti-heartbeat',          flag: latestV ? vitalFlag('sbp', latestV.sbp) : '' },
            { label:'HR',   value: latestV?.hr   || '—', unit:'bpm',   icon:'ti-heart-rate-monitor', flag: latestV ? vitalFlag('hr',  latestV.hr)  : '' },
            { label:'TEMP', value: latestV?.temp  || '—', unit:'°C',    icon:'ti-temperature',        flag: latestV ? vitalFlag('temp',latestV.temp): '' },
            { label:'SPO₂', value: latestV?.spo2  || '—', unit:'%',     icon:'ti-lungs',              flag: latestV ? vitalFlag('spo2',latestV.spo2): '' },
            { label:'MEDS', value: activeMeds,             unit:'active',icon:'ti-pill',               flag: 'ok' },
          ].map(v => {
            const flagColor = v.flag==='high' ? 'var(--danger)' : v.flag==='low' ? 'var(--warn)' : 'var(--accent)';
            return (
              <div key={v.label} style={{
                background:'var(--card-bg)',
                border:`1px solid var(--border)`,
                borderTop:`3px solid ${flagColor}`,
                borderRadius:10,
                padding:'10px 10px',
                cursor:'pointer',
              }} onClick={() => setActiveTab('vitals')}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <i className={`ti ${v.icon}`} style={{ fontSize:15, color: flagColor }} />
                  <span style={{ fontSize:9, fontWeight:700, color:'var(--t3)', letterSpacing:'.05em' }}>{v.label}</span>
                </div>
                <div style={{ fontSize:20, fontWeight:700, color:'var(--t1)', lineHeight:1 }}>{v.value}</div>
                <div style={{ fontSize:9, color:'var(--t3)', fontWeight:500, marginTop:2 }}>{v.unit}</div>
              </div>
            );
          })}
        </div>
        )}

        {/* NEWS2 compact badge row — shown if vitals exist */}
        {!isRecords && latestV && (
          <div style={{ padding:'6px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
            <NewsScore vitals={latestV} compact />
            <span style={{ fontSize:10, color:'var(--t3)', fontWeight:600 }}>
              Based on latest vitals — click for breakdown
            </span>
          </div>
        )}

        {/* Action Buttons — hidden entirely for records staff */}
        {!isRecords && (
        <div style={{
          display:'flex', gap:6, flexWrap:'wrap',
          padding:'8px 14px 10px',
        }}>
          {[
            { tab:'vitals',  label:'Add Vitals',     icon:'ti-heart-rate-monitor', show: true },
            { tab:'rx',      label:'Prescription',   icon:'ti-pill',               show: canPrescribe },
            { tab:'nursing', label:'Nursing Report', icon:'ti-notes-medical',      show: isNurse },
            { tab:'glucose', label:'Glucose',        icon:'ti-activity',           show: true },
            { tab:'fluid',   label:'Fluid I/O',      icon:'ti-droplet',            show: true },
            { tab:'uploads', label:'Wound Care',     icon:'ti-bandage',            show: isNurse || isDoctor },
            { tab:'mar',     label:'Give Medication', icon:'ti-pill',              show: isNurse || isDoctor },
            { tab:'lab',     label:'Order Lab',      icon:'ti-microscope',         show: isNurse || isDoctor },
          ].filter(b => b.show).map((btn, i) => (
            <button key={i} onClick={() => { setActiveTab(btn.tab); setViewOnly(false); }} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'6px 12px',
              background:'var(--card-bg)',
              border:'1px solid var(--border)',
              borderRadius:8,
              fontSize:11, fontWeight:700,
              color:'var(--t2)',
              cursor:'pointer',
              fontFamily:'var(--font)',
            }}>
              <i className={`ti ${btn.icon}`} style={{ fontSize:13, color:'var(--accent)' }} />
              {btn.label}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* ══ TABS — always visible, sticky ══ */}
      <div style={{
        display:'flex', overflowX:'auto', gap:0,
        borderBottom:'2px solid var(--border)',
        background:'var(--card-bg)',
        padding:'0 14px',
        flexShrink:0,
        scrollbarWidth:'none',
      }}>
        {TABS.filter(t => t.roles.includes(profile?.role?.toLowerCase())).map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setViewOnly(t.id !== 'nursing' && t.id !== 'doctor');  }} style={{
            display:'flex', alignItems:'center', gap:4,
            padding:'9px 12px',
            border:'none', borderBottom: activeTab===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom:-2,
            background:'transparent',
            fontSize:11, fontWeight:700,
            color: activeTab===t.id ? 'var(--accent)' : 'var(--t3)',
            cursor:'pointer',
            whiteSpace:'nowrap',
            fontFamily:'var(--font)',
          }}>
            <span style={{fontSize:12}}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB CONTENT ══ */}
      <div style={{ padding:'14px' }}>

        {/* ── VISIT TAB ── */}
        {activeTab==='visit' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:16 }}>

            {/* Left: Patient profile card */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-user" />Patient Profile</div>
                </div>
                <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {/* Avatar */}
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, paddingBottom:14, borderBottom:'1px solid var(--border)' }}>
                    <div style={{
                      width:64, height:64, borderRadius:'50%',
                      background:'var(--accent-bg)', color:'var(--accent)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:24, fontWeight:700,
                    }}>
                      {(patient.surname?.[0]||'')+(patient.firstName?.[0]||'')}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontWeight:700, fontSize:15 }}>{patient.surname} {patient.firstName}</div>
                      <div style={{ fontSize:11, color:'var(--t3)', fontFamily:'var(--mono)' }}>{patient.emrNumber}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{patient.classSet}</div>
                      <span style={{
                        display:'inline-block', marginTop:4,
                        background: statusColor+'22', color: statusColor,
                        fontSize:10, fontWeight:700, padding:'2px 10px', borderRadius:20,
                        textTransform:'capitalize',
                      }}>{patient.status}</span>
                    </div>
                  </div>

                  {[
                    ['Date of Birth',  patient.dob],
                    ['Gender',         patient.sex],
                    ['Matric No.',     patient.matricNo],
                    ['HMO / NHIS',     patient.hmo || '—'],
                    ['Blood Group',    patient.bloodGroup || '—'],
                    ['Admission Date', formatTs(patient.registeredAt)],
                    ['Attending',      patient.registeredBy],
                    ['Primary Dx',     patient.primaryDiagnosis || '—'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display:'flex', flexDirection:'column', gap:1 }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>{label}</div>
                      <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>{val || '—'}</div>
                    </div>
                  ))}

                  <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>Known Allergies</div>
                    {(() => {
                      const a = patient.allergies?.trim();
                      const has = a && a.toLowerCase() !== 'none' && a.toLowerCase() !== 'nil';
                      return (
                        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color: has ? 'var(--danger)' : 'var(--success)' }}>
                          {has ? `⚠ ${a}` : '✓ No known allergies'}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Emergency contact */}
                  {(patient.nextOfKin || patient.nextOfKinTel) && (
                    <div style={{ borderTop:'1px solid var(--border)', paddingTop:12, marginTop:4 }}>
                      <div style={{ fontSize:9, fontWeight:800, color:'var(--danger)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>
                        🚨 Emergency Contact
                      </div>
                      {[
                        ['Name',         patient.nextOfKin],
                        ['Relationship', patient.nextOfKinRel],
                        ['Phone',        patient.nextOfKinTel],
                      ].map(([l, v]) => v ? (
                        <div key={l} style={{ display:'flex', gap:8, marginBottom:3 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:'var(--t3)', width:80, flexShrink:0 }}>{l}:</span>
                          <span style={{ fontSize:11, fontWeight:700, color:'var(--t1)' }}>{v}</span>
                        </div>
                      ) : null)}
                      {patient.nextOfKinTel && (
                        <a href={`tel:${patient.nextOfKinTel}`} style={{
                          display:'inline-flex', alignItems:'center', gap:5,
                          marginTop:6, padding:'5px 10px',
                          background:'var(--danger)', color:'#fff',
                          borderRadius:6, fontSize:11, fontWeight:700, textDecoration:'none',
                        }}>
                          <i className="ti ti-phone" style={{fontSize:12}} /> Call now
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Latest vitals mini */}
              {latestV && (
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><i className="ti ti-heart-rate-monitor" />Latest Vitals</div>
                    <span style={{ fontSize:10, color:'var(--t3)' }}>{formatTime(latestV.recordedAt)}</span>
                  </div>
                  <div className="card-body">
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        { label:'BP',    value:`${latestV.sbp}/${latestV.dbp}`, unit:'mmHg', key:'sbp' },
                        { label:'HR',    value:latestV.hr,   unit:'bpm',  key:'hr'   },
                        { label:'Temp',  value:latestV.temp, unit:'°C',   key:'temp' },
                        { label:'RR',    value:latestV.rr,   unit:'/min', key:'rr'   },
                        { label:'SpO₂',  value:latestV.spo2, unit:'%',    key:'spo2' },
                        { label:'Wt',    value:latestV.weight||'—', unit:'kg', key:'' },
                      ].map(v => {
                        const f = v.key ? vitalFlag(v.key, v.value) : 'ok';
                        const c = f==='high'?'var(--danger)':f==='low'?'var(--warn)':'var(--t1)';
                        return (
                          <div key={v.label} style={{ background:'var(--card-bg2)', borderRadius:8, padding:'8px 10px' }}>
                            <div style={{ fontSize:9, color:'var(--t3)', fontWeight:700, textTransform:'uppercase' }}>{v.label}</div>
                            <div style={{ fontSize:15, fontWeight:700, color:c }}>{v.value}</div>
                            <div style={{ fontSize:9, color:'var(--t3)' }}>{v.unit}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Timeline */}
            <div className="card" style={{ height:'fit-content' }}>
              <div className="card-header">
                <div className="card-title"><i className="ti ti-activity" />Visit Timeline</div>
                <span style={{ fontSize:11, color:'var(--t3)' }}>{timeline.length} events</span>
              </div>
              {timeline.length === 0 ? (
                <div style={{ padding:32, textAlign:'center', color:'var(--t3)' }}>
                  <i className="ti ti-clipboard" style={{ fontSize:32, display:'block', marginBottom:8 }} />
                  <div style={{ fontWeight:700 }}>No events yet</div>
                  <div style={{ fontSize:11, marginTop:4 }}>Start by recording vitals or adding a note</div>
                </div>
              ) : (
                <div className="timeline">
                  {timeline.map((item, i) => (
                    <div key={i} className="tl-item tl-item-clickable" onClick={() => setSelectedEvent(item)}>
                      <div className="tl-dot" style={{ background: tlColor[item.type] }} />
                      <div className="tl-body">
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <i className={`ti ${tlIcon[item.type]}`} style={{ color: tlColor[item.type], fontSize:13 }} />
                          <div className="tl-title">{tlTitle[item.type]}</div>
                          {item.type==='rx' && item.data.requiresCountersign && (
                            <span className="badge badge-warn" style={{ fontSize:9 }}>Nurse Rx</span>
                          )}
                        </div>
                        <div className="tl-sub">{tlDesc(item)}</div>
                        <div style={{ fontSize:10, color:'var(--t3)', marginTop:2 }}>
                          {item.type==='note' ? item.data.authorName : item.data.recordedBy || item.data.prescribedBy || item.data.uploadedBy}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                        <div className="tl-time">{formatTime(item.ts)}</div>
                        <i className="ti ti-chevron-right" style={{ fontSize:11, color:'var(--t3)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── VITALS TAB ── */}
        {activeTab==='vitals' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* NEWS2 Early Warning Score — computed from latest vitals */}
            {vitals.length > 0 && <NewsScore vitals={vitals[0]} />}

            {/* Trend Chart */}
            {vitals.length > 1 && <VitalsTrendChart vitals={vitals} />}

            {!viewOnly && <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-heart-rate-monitor" />Record Vitals</div></div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:12 }}>
                  {[
                    { id:'sbp',  label:'Systolic BP',  ph:'120' },
                    { id:'dbp',  label:'Diastolic BP',  ph:'80'  },
                    { id:'hr',   label:'Heart Rate',    ph:'72'  },
                    { id:'temp', label:'Temperature °C',ph:'36.5'},
                    { id:'rr',   label:'Resp. Rate',    ph:'18'  },
                    { id:'spo2', label:'SpO₂ %',        ph:'99'  },
                  ].map(f => (
                    <div key={f.id} className="form-group">
                      <label className="form-label">{f.label}</label>
                      <input className="form-input" placeholder={f.ph}
                        value={vitalForm[f.id]}
                        onChange={e => setVitalForm(v => ({ ...v, [f.id]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group form-span-3">
                    <label className="form-label">Observations</label>
                    <textarea className="form-textarea" rows={2} placeholder="Clinical observations…"
                      value={vitalForm.notes||''}
                      onChange={e => setVitalForm(v => ({ ...v, notes:e.target.value }))} />
                  </div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveVitals} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save vitals
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-history" />Vitals History</div></div>
              <table className="data-table">
                <thead><tr><th>Time</th><th>BP</th><th>HR</th><th>Temp</th><th>RR</th><th>SpO₂</th><th>By</th></tr></thead>
                <tbody>
                  {vitals.map(v => (
                    <tr key={v.id}>
                      <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{formatDateTime(v.recordedAt)}</td>
                      <td style={{ color: vitalFlag('sbp',v.sbp)==='high'?'var(--danger)':vitalFlag('sbp',v.sbp)==='low'?'var(--warn)':'inherit' }}>{v.sbp}/{v.dbp}</td>
                      <td>{v.hr}</td>
                      <td style={{ color: vitalFlag('temp',v.temp)==='high'?'var(--danger)':vitalFlag('temp',v.temp)==='low'?'var(--warn)':'inherit' }}>{v.temp}°C</td>
                      <td>{v.rr}</td>
                      <td style={{ color: vitalFlag('spo2',v.spo2)==='high'?'var(--danger)':'inherit' }}>{v.spo2}%</td>
                      <td style={{ fontSize:11, color:'var(--t3)' }}>{v.recordedBy}</td>
                    </tr>
                  ))}
                  {vitals.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', color:'var(--t3)', padding:16 }}>No vitals recorded yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PRESCRIPTION TAB ── */}
        {activeTab==='rx' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && isNurse && (
              <div className="alert alert-warn">
                <i className="ti ti-alert-triangle" />
                Nurse prescription — requires doctor countersignature.
              </div>
            )}
            {!viewOnly && <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-pill" />Write Prescription</div>
                <button className="btn btn-sm" onClick={() => setRxForm(r => [...r, {drug:'',dose:'',frequency:'',duration:''}])}>
                  <i className="ti ti-plus" /> Add drug
                </button>
              </div>
              <div className="card-body">
                {rxForm.map((row, i) => (
                  <div key={i} style={{
                    background:'var(--card-bg2)',
                    borderRadius:10,
                    padding:'12px',
                    marginBottom:10,
                    border:'1px solid var(--border)',
                  }}>
                    {/* Drug number + delete */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>Drug {i + 1}</span>
                      {rxForm.length > 1 && (
                        <button className="btn btn-sm btn-danger btn-icon" onClick={() => setRxForm(r => r.filter((_,j)=>j!==i))}>
                          <i className="ti ti-trash" />
                        </button>
                      )}
                    </div>
                    {/* Drug name full width */}
                    <div className="form-group" style={{ marginBottom:8 }}>
                      <label className="form-label">Drug name *</label>
                      <input className="form-input" placeholder="e.g. Artemether 160mg"
                        value={row.drug} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,drug:e.target.value}:x))} />
                    </div>
                    {/* Dose + Frequency side by side */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                      <div className="form-group">
                        <label className="form-label">Dose</label>
                        <input className="form-input" placeholder="160mg"
                          value={row.dose} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,dose:e.target.value}:x))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Frequency</label>
                        <input className="form-input" placeholder="OD / BD / TDS"
                          value={row.frequency} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,frequency:e.target.value}:x))} />
                      </div>
                    </div>
                    {/* Duration full width */}
                    <div className="form-group">
                      <label className="form-label">Duration</label>
                      <input className="form-input" placeholder="e.g. × 3/7 or 5 days"
                        value={row.duration} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,duration:e.target.value}:x))} />
                    </div>
                  </div>
                ))}
                <button className="btn btn-primary" onClick={saveRx} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save prescription
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header"
                onClick={() => setRxHistoryOpen(o => !o)}
                style={{ cursor:'pointer', userSelect:'none' }}>
                <div className="card-title">
                  <i className="ti ti-history" />
                  Prescription History
                  {rx.length > 0 && (
                    <span style={{ fontSize:10, fontWeight:700, background:'var(--accent)', color:'#fff',
                      borderRadius:20, padding:'1px 7px', marginLeft:8 }}>
                      {rx.length}
                    </span>
                  )}
                </div>
                <button style={{ background:'none', border:'1px solid var(--border)', borderRadius:8,
                  padding:'4px 12px', cursor:'pointer', color:'var(--t2)',
                  fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
                  <i className={`ti ${rxHistoryOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
                  {rxHistoryOpen ? 'Collapse' : `Show${rx.length > 0 ? ` (${rx.length})` : ''}`}
                </button>
              </div>
              {rxHistoryOpen && (
                <div style={{ maxHeight:420, overflowY:'auto' }}>
                  {rx.map(r => (
                    <div key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <div style={{ padding:'6px 16px', background:'var(--card-bg2)', display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)' }}>{formatDateTime(r.createdAt)} — {r.prescribedBy}</span>
                        {r.requiresCountersign && <span className="badge badge-warn">Needs countersign</span>}
                      </div>
                      {r.drugs?.map((d,i) => (
                        <div className="rx-row" key={i}>
                          <div className="rx-drug">{d.drug} {d.dose}</div>
                          <div className="rx-dose">{d.frequency} {d.duration}</div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {rx.length===0 && <div style={{ padding:16, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>No prescriptions yet</div>}
                </div>
              )}
            </div>

            {/* ── OFFICIAL PRINTED Rx FORM (auto-selects based on patientIdentity) ── */}
            {(() => {
              // patientIdentity: 'Soldier' | 'Civilian' (new field).
              // Falls back to legacy patientType ('soldier' | 'civilian') for older records.
              const rawIdentity = patient.patientIdentity || patient.patientType;
              if (!rawIdentity) return null; // only show if identity was set at registration

              const isSoldier   = String(rawIdentity).toLowerCase() === 'soldier';
              const accentColor = isSoldier ? '#1d4ed8' : '#7c3aed';
              const formLabel   = isSoldier ? 'NHIS Prescription Form' : 'NACON Civilian Prescription Form';
              const formIcon    = isSoldier ? 'ti-shield-filled' : 'ti-user';

              // Build a pre-filled Rx string — ONLY prescriptions added AFTER the last
              // official form was saved. Use the latest saved form's timestamp (from Firestore)
              // so this persists across page reloads, not just the current session.
              const lastSavedFormAt = savedForms.length > 0
                ? (savedForms[0].savedAt?.seconds || 0) * 1000
                : 0;
              const cutoff = Math.max(lastSavedFormAt, officialRxSavedAt || 0);
              const savedRxLines = rx
                .filter(r => {
                  const ts = r.createdAt?.seconds ? r.createdAt.seconds * 1000 : (r.createdAt || 0);
                  return ts > cutoff;
                })
                .flatMap(r => r.drugs || [])
                .map(d => [d.drug, d.dose, d.frequency, d.duration].filter(Boolean).join('  '))
                .filter(Boolean);

              const draftRxLines = rxForm
                .filter(r => r.drug.trim())
                .map(r => [r.drug, r.dose, r.frequency, r.duration].filter(Boolean).join('  '));

              const autoRxText = [...savedRxLines, ...draftRxLines].join('\n');

              // Compute patient age from DOB
              const age = patient.dob
                ? Math.floor((Date.now() - new Date(patient.dob)) / (365.25 * 24 * 3600 * 1000))
                : '';

              // Default form values pre-filled from patient record
              const defaultRx = isSoldier
                ? {
                    patientName:     `${patient.surname || ''} ${patient.firstName || ''} ${patient.otherNames || ''}`.trim(),
                    nhisId:          patient.hmo || patient.matricNo || '',
                    address:         patient.homeAddress || '',
                    age:             String(age),
                    sex:             patient.sex || '',
                    providerName:    'NACON MRS',
                    date:            new Date().toISOString().split('T')[0],
                    providerAddress: 'Nigerian Army College of Nursing, Yaba, Lagos',
                    telFax:          '',
                    rx:              autoRxText,
                    prescriberName:  profile?.displayName || '',
                    pharmacist:      '',
                    pharmacy:        '',
                    pharmacistNo:    '',
                    nhisRegNo:       '',
                    pcnRegNo:        '',
                  }
                : {
                    patientName:     `${patient.surname || ''} ${patient.firstName || ''} ${patient.otherNames || ''}`.trim(),
                    matricNo:        patient.matricNo || '',
                    address:         patient.homeAddress || '',
                    age:             String(age),
                    sex:             patient.sex || '',
                    class:           patient.classSet || '',
                    date:            new Date().toISOString().split('T')[0],
                    tel:             patient.tel || '',
                    rx:              autoRxText,
                    prescriberName:  profile?.displayName || '',
                    pharmacyTel:     '',
                  };

              // Open the form with defaults on first click
              const openOfficialRx = () => {
                if (!officialRx) setOfficialRx(defaultRx);
              };

              const setR = (k, v) => setOfficialRx(r => ({ ...r, [k]: v }));

              // Print handler
              const handlePrint = () => {
                const el = officialRxPrintRef.current;
                if (!el) return;
                const w = window.open('', '_blank', 'width=820,height=700');
                w.document.write(`<!DOCTYPE html><html><head><title>${formLabel}</title>
                  <style>
                    *{box-sizing:border-box;margin:0;padding:0}
                    body{font-family:'Times New Roman',Times,serif;background:#fff;color:#000;padding:28px}
                    .uline{display:inline-block;border-bottom:1px solid #000;min-width:80px;vertical-align:bottom}
                    .rx-box{border:2px solid #000;padding:8px;min-height:180px;font-size:12px;white-space:pre-wrap;margin:6px 0}
                    @media print{body{padding:10px}}
                  </style></head><body>${el.innerHTML}</body></html>`);
                w.document.close(); w.focus();
                setTimeout(() => w.print(), 400);
              };

              // Save handler
              const doSaveOfficial = async () => {
                setOfficialRxSaving(true);
                const savedBy = profile?.displayName || profile?.email || 'Unknown';
                try {
                  if (isSoldier) {
                    await saveNHISForm({ ...officialRx, emrNumber }, savedBy);
                  } else {
                    await saveNACONForm({ ...officialRx, emrNumber }, savedBy);
                  }
                  toast.success(`${formLabel} saved to records`);
                  setOfficialRx(null);
                  // Mark the save time so next form open starts fresh (only new Rx appear)
                  setOfficialRxSavedAt(Date.now());
                  // Clear the write-prescription draft too
                  setRxForm([{ drug:'', dose:'', frequency:'', duration:'' }]);
                } catch(e) {
                  console.error('handleSaveOfficial', e);
                  toast.error('Failed to save: ' + (e?.message || e));
                }
                setOfficialRxSaving(false);
              };

              const handleSaveOfficial = async () => {
                if (!officialRx?.patientName?.trim()) { toast.error('Patient name is required'); return; }

                // ── Allergy check — `rx` is free text (auto-filled from prescription
                // history), so scan it for allergy terms/cross-reactive drug names
                // rather than checking a structured drug list like saveRx does. ──
                const allergyStr = patient?.allergies?.trim();
                const conflicts = checkAllergyConflictsInText(allergyStr, officialRx?.rx);
                if (conflicts.length > 0) {
                  setAllergyAlert({ conflicts, allergyStr, onConfirm: doSaveOfficial });
                  return; // block until user decides
                }
                await doSaveOfficial();
              };

              // Shared field renderer
              const F = {
                line: { display:'inline-block', borderBottom:'1px solid #000', minWidth:100, verticalAlign:'bottom', fontSize:11 },
                rxBox: { border:'2px solid #000', padding:8, minHeight:140, fontSize:12, whiteSpace:'pre-wrap', marginTop:4 },
                rxSym: { fontWeight:'bold', fontSize:22, fontFamily:'serif', verticalAlign:'top', marginRight:4 },
              };
              const inp = { padding:'6px 8px', borderRadius:6, border:'1px solid var(--border)',
                background:'var(--input-bg,#f4f4f4)', fontSize:12, width:'100%',
                fontFamily:'inherit', color:'var(--t1)' };
              const lbl = { fontSize:10, fontWeight:700, textTransform:'uppercase',
                display:'block', marginBottom:2, color:'var(--t3)' };

              return (
                <>
                <div className="card" style={{ border:`2px solid ${accentColor}22` }}>
                  {/* Collapsed header — click to open */}
                  <div className="card-header"
                    style={{ cursor:'pointer', userSelect:'none' }}
                    onClick={openOfficialRx}>
                    <div className="card-title" style={{ color: accentColor }}>
                      <i className={`ti ${formIcon}`} style={{ color: accentColor }} />
                      {formLabel}
                      <span style={{ fontSize:10, fontWeight:400, color:'var(--t3)', marginLeft:8 }}>
                        — patient info auto-filled
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                      {savedForms.length > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); setViewSavedForms(true); }}
                          style={{ background:'none', border:`1px solid ${accentColor}`, borderRadius:8,
                            padding:'4px 12px', cursor:'pointer', color: accentColor,
                            fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
                          <i className="ti ti-files" />
                          View Saved ({savedForms.length})
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setOfficialRx(officialRx ? null : defaultRx); }}
                        style={{ background: accentColor, border:'none', borderRadius:8,
                          padding:'4px 12px', cursor:'pointer', color:'#fff',
                          fontWeight:700, fontSize:11, display:'flex', alignItems:'center', gap:5 }}>
                        <i className={`ti ${officialRx ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
                        {officialRx ? 'Collapse' : 'Open Form'}
                      </button>
                    </div>
                  </div>

                  {officialRx && (
                    <div className="card-body">
                      {/* ── Editable fields ── */}
                      {isSoldier ? (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px', marginBottom:14 }}>
                          {[
                            { k:'patientName',     label:'Patient Name',           col:2, readOnly:true },
                            { k:'nhisId',          label:'NHIS ID No.' },
                            { k:'age',             label:'Age', readOnly:true },
                            { k:'sex',             label:'Sex', readOnly:true },
                            { k:'address',         label:'Patient Address',        col:2 },
                            { k:'providerName',    label:'Provider Name',          col:2 },
                            { k:'providerAddress', label:'Provider Address',       col:2 },
                            { k:'date',            label:'Date', type:'date' },
                            { k:'telFax',          label:'Tel / Fax' },
                            { k:'rx',              label:'Rx — Drug, Dose, Duration (one per line)', col:2, ta:true },
                            { k:'prescriberName',  label:"Prescriber's Name",      col:2 },
                            { k:'pharmacist',      label:'Pharmacist Name' },
                            { k:'pharmacy',        label:'Pharmacy Name' },
                            { k:'pharmacistNo',    label:'Pharmacist No.' },
                            { k:'nhisRegNo',       label:'NHIS Reg. No.' },
                            { k:'pcnRegNo',        label:'PCN Reg. No.' },
                          ].map(f => (
                            <div key={f.k} style={{ gridColumn: f.col===2 ? 'span 2' : undefined }}>
                              <label style={lbl}>{f.label}</label>
                              {f.ta
                                ? <textarea rows={3} style={{ ...inp, resize:'vertical', background: f.readOnly ? 'var(--card-bg2)' : undefined }}
                                    value={officialRx[f.k]||''} onChange={e => setR(f.k, e.target.value)} />
                                : <input style={{ ...inp, background: f.readOnly ? 'var(--card-bg2)' : undefined }}
                                    type={f.type||'text'} readOnly={f.readOnly}
                                    value={officialRx[f.k]||''} onChange={e => !f.readOnly && setR(f.k, e.target.value)} />
                              }
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 14px', marginBottom:14 }}>
                          {[
                            { k:'patientName',   label:'Patient Name',  col:2, readOnly:true },
                            { k:'matricNo',      label:'Matric No.',           readOnly:true },
                            { k:'address',       label:'Address' },
                            { k:'age',           label:'Age',                  readOnly:true },
                            { k:'sex',           label:'Sex',                  readOnly:true },
                            { k:'class',         label:'Class',                readOnly:true },
                            { k:'date',          label:'Date', type:'date' },
                            { k:'tel',           label:'Tel',                  readOnly:true },
                            { k:'rx',            label:'Rx — Drug, Dose, Duration (one per line)', col:2, ta:true },
                            { k:'prescriberName',label:"Prescriber's Name",    col:2 },
                            { k:'pharmacyTel',   label:'Pharmacy Tel No.',     col:2 },
                          ].map(f => (
                            <div key={f.k} style={{ gridColumn: f.col===2 ? 'span 2' : undefined }}>
                              <label style={lbl}>{f.label}</label>
                              {f.ta
                                ? <textarea rows={3} style={{ ...inp, resize:'vertical' }}
                                    value={officialRx[f.k]||''} onChange={e => setR(f.k, e.target.value)} />
                                : <input style={{ ...inp, background: f.readOnly ? 'var(--card-bg2)' : undefined }}
                                    type={f.type||'text'} readOnly={f.readOnly}
                                    value={officialRx[f.k]||''} onChange={e => !f.readOnly && setR(f.k, e.target.value)} />
                              }
                            </div>
                          ))}
                        </div>
                      )}

                      {/* ── Print preview ── */}
                      <div style={{ background:'#f8f8f8', border:'1px dashed #ccc', borderRadius:6, padding:10, marginBottom:14 }}>
                        <div style={{ fontSize:9, color:'#999', marginBottom:6, textTransform:'uppercase', letterSpacing:1 }}>Print Preview</div>
                        <div ref={officialRxPrintRef}>
                          {isSoldier ? (
                            /* ── NHIS layout ── */
                            <div style={{ fontFamily:"'Times New Roman',Times,serif", color:'#000', background:'#fff',
                              border:'2px solid #000', padding:'14px 18px 18px', maxWidth:640, margin:'0 auto' }}>
                              <div style={{ textAlign:'center', fontSize:14, fontWeight:'bold',
                                textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>
                                National Health Insurance Scheme
                              </div>
                              <div style={{ textAlign:'center', fontSize:12, fontWeight:'bold',
                                textTransform:'uppercase', marginBottom:10, borderBottom:'2px solid #000', paddingBottom:6 }}>
                                Prescription Form
                              </div>
                              <div style={{ fontSize:10, fontWeight:'bold', textTransform:'uppercase', marginBottom:4 }}>A. Patient's Identification</div>
                              <div style={{ fontSize:11, marginBottom:5 }}>
                                <b>Name: </b><span style={F.line}>{officialRx.patientName}</span>
                                <span style={{ marginLeft:16 }}><b>NHIS ID: </b><span style={F.line}>{officialRx.nhisId}</span></span>
                              </div>
                              <div style={{ fontSize:11, marginBottom:5 }}>
                                <b>Address: </b><span style={F.line}>{officialRx.address}</span>
                                <span style={{ marginLeft:10 }}><b>Age: </b><span style={F.line}>{officialRx.age}</span></span>
                                <span style={{ marginLeft:10 }}><b>Sex: </b><span style={F.line}>{officialRx.sex}</span></span>
                              </div>
                              <div style={{ fontSize:10, fontWeight:'bold', textTransform:'uppercase', margin:'8px 0 4px' }}>B. Healthcare Provider's Identification</div>
                              <div style={{ fontSize:11, marginBottom:5 }}>
                                <b>Name: </b><span style={F.line}>{officialRx.providerName}</span>
                                <span style={{ marginLeft:16 }}><b>Date: </b><span style={F.line}>{officialRx.date}</span></span>
                              </div>
                              <div style={{ fontSize:11, marginBottom:8 }}>
                                <b>Address: </b><span style={F.line}>{officialRx.providerAddress}</span>
                                <span style={{ marginLeft:10 }}><b>Tel/Fax: </b><span style={F.line}>{officialRx.telFax}</span></span>
                              </div>
                              <div style={{ display:'flex', gap:4, alignItems:'flex-start' }}>
                                <span style={F.rxSym}>Rx</span>
                                <div style={{ ...F.rxBox, flex:1 }}>{officialRx.rx}</div>
                              </div>
                              <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:11 }}>
                                <div><b>Prescriber's Name: </b><span style={F.line}>{officialRx.prescriberName}</span></div>
                                <div><b>Signature: </b><span style={{ ...F.line, minWidth:100 }}></span></div>
                              </div>
                              <div style={{ borderTop:'1px solid #000', margin:'10px 0' }} />
                              <div style={{ fontSize:10, fontWeight:'bold', textTransform:'uppercase', marginBottom:6 }}>Pharmacy Provider Identification</div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11 }}>
                                {[
                                  ['Pharmacist', officialRx.pharmacist],
                                  ['Pharmacy',   officialRx.pharmacy],
                                  ['No.',        officialRx.pharmacistNo],
                                  ['NHIS Reg. No.', officialRx.nhisRegNo],
                                  ['PCN Reg. No.',  officialRx.pcnRegNo],
                                  ['Signature', ''],
                                ].map(([l,v]) => (
                                  <div key={l}><b>{l}: </b><span style={F.line}>{v}</span></div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            /* ── NACON Civilian layout ── */
                            <div style={{ fontFamily:"'Times New Roman',Times,serif", color:'#000', background:'#fff',
                              border:'2px solid #000', padding:'14px 18px 18px', maxWidth:600, margin:'0 auto' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
                                <div style={{ width:50, height:50, border:'2px solid #000', display:'flex',
                                  alignItems:'center', justifyContent:'center', fontSize:7,
                                  fontWeight:'bold', textAlign:'center', flexShrink:0, lineHeight:1.2 }}>
                                  NACON<br/>CREST
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontWeight:'bold', textDecoration:'underline', fontStyle:'italic', fontSize:14 }}>
                                    Nigerian Army College Of Nursing Yaba-Lagos
                                  </div>
                                  <div style={{ fontWeight:'bold', fontStyle:'italic', fontSize:11, textAlign:'center' }}>
                                    Civilian Prescription Form
                                  </div>
                                </div>
                                <div style={{ fontSize:9, fontWeight:'bold' }}>NACON MRS</div>
                              </div>
                              <div style={{ fontSize:11, fontWeight:'bold', marginBottom:5 }}>A. &nbsp;Patient's Identification</div>
                              <div style={{ fontSize:11, marginBottom:4 }}>
                                <b>NAME:—</b><span style={F.line}>{officialRx.patientName}</span>
                                <span style={{ marginLeft:14 }}><b>MATRIC NO:—</b><span style={F.line}>{officialRx.matricNo}</span></span>
                              </div>
                              <div style={{ fontSize:11, marginBottom:4 }}>
                                <b>ADDRESS:—</b><span style={F.line}>{officialRx.address}</span>
                                <span style={{ marginLeft:10 }}><b>AGE:—</b><span style={F.line}>{officialRx.age}</span></span>
                                <span style={{ marginLeft:8 }}><b>SEX:—</b><span style={F.line}>{officialRx.sex}</span></span>
                              </div>
                              <div style={{ fontSize:11, marginBottom:8 }}>
                                <b>CLASS:—</b><span style={F.line}>{officialRx.class}</span>
                                <span style={{ marginLeft:10 }}><b>DATE:—</b><span style={F.line}>{officialRx.date}</span></span>
                                <span style={{ marginLeft:8 }}><b>TEL:—</b><span style={F.line}>{officialRx.tel}</span></span>
                              </div>
                              <div style={F.rxBox}>
                                <span style={F.rxSym}>R<sub style={{fontSize:13}}>x</sub></span>
                                <span style={{ fontSize:12, whiteSpace:'pre-wrap' }}>{officialRx.rx}</span>
                              </div>
                              <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:11 }}>
                                <div><b>PRESCRIBER'S NAME </b><span style={F.line}>{officialRx.prescriberName}</span></div>
                                <div><b>SIGNATURE </b><span style={{ ...F.line, minWidth:110 }}></span></div>
                              </div>
                              <div style={{ fontSize:11, fontWeight:'bold', margin:'10px 0 5px' }}>B. &nbsp;Pharmacy Provider Identification</div>
                              <div style={{ fontSize:11 }}>
                                <b>TEL NO:—</b><span style={F.line}>{officialRx.pharmacyTel}</span>
                                <span style={{ marginLeft:18 }}><b>SIGNATURE</b><span style={{ ...F.line, minWidth:130 }}></span></span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Action buttons ── */}
                      <div style={{ display:'flex', gap:10 }}>
                        <button onClick={handlePrint}
                          style={{ flex:1, padding:'10px', background: accentColor, color:'#fff',
                            border:'none', borderRadius:9, fontSize:13, fontWeight:700,
                            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                          <i className="ti ti-printer" /> Print Form
                        </button>
                        <button onClick={handleSaveOfficial} disabled={officialRxSaving}
                          style={{ flex:1, padding:'10px', background:'#16a34a', color:'#fff',
                            border:'none', borderRadius:9, fontSize:13, fontWeight:700,
                            cursor: officialRxSaving ? 'not-allowed' : 'pointer',
                            opacity: officialRxSaving ? 0.7 : 1,
                            display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
                          <i className="ti ti-device-floppy" />
                          {officialRxSaving ? 'Saving…' : 'Save to Records'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Saved Forms Modal ── */}
                {viewSavedForms && (
                  <div style={{
                    position:'fixed', inset:0, zIndex:3000,
                    background:'rgba(0,0,0,0.55)',
                    display:'flex', alignItems:'flex-end',
                  }} onClick={() => setViewSavedForms(false)}>
                    <div style={{
                      width:'100%', maxHeight:'88vh',
                      background:'var(--card-bg)',
                      borderRadius:'18px 18px 0 0',
                      display:'flex', flexDirection:'column',
                      overflow:'hidden',
                      boxShadow:'0 -4px 32px rgba(0,0,0,0.3)',
                    }} onClick={e => e.stopPropagation()}>
                      {/* Header */}
                      <div style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'14px 16px', borderBottom:'1px solid var(--border)',
                        background: accentColor, color:'#fff', borderRadius:'18px 18px 0 0',
                      }}>
                        <div style={{ fontWeight:700, fontSize:15, display:'flex', alignItems:'center', gap:8 }}>
                          <i className="ti ti-files" /> Saved {formLabel}s
                        </div>
                        <button onClick={() => setViewSavedForms(false)}
                          style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:8,
                            padding:'4px 10px', color:'#fff', cursor:'pointer', fontWeight:700, fontSize:13 }}>
                          ✕ Close
                        </button>
                      </div>

                      {/* List */}
                      <div style={{ overflowY:'auto', flex:1, padding:12, display:'flex', flexDirection:'column', gap:10 }}>
                        {savedForms.length === 0 ? (
                          <div style={{ textAlign:'center', color:'var(--t3)', padding:32, fontWeight:700 }}>
                            No saved forms yet
                          </div>
                        ) : savedForms.map((form, idx) => {
                          const savedDate = form.savedAt?.seconds
                            ? new Date(form.savedAt.seconds * 1000).toLocaleString()
                            : 'Unknown date';

                          // Build share text
                          const shareText = [
                            `${form.formType === 'NHIS' ? 'NHIS' : 'NACON Civilian'} Prescription Form`,
                            `Patient: ${form.patientName || ''}`,
                            form.formType === 'NHIS' ? `NHIS ID: ${form.nhisId || ''}` : `Matric No: ${form.matricNo || ''}`,
                            `Date: ${form.date || ''}`,
                            `Age: ${form.age || ''}   Sex: ${form.sex || ''}`,
                            ``,
                            `Rx:`,
                            form.rx || '',
                            ``,
                            `Prescriber: ${form.prescriberName || ''}`,
                            `Saved by: ${form.savedBy || ''}  on ${savedDate}`,
                          ].join('\n');

                          const handleShare = async () => {
                            if (navigator.share) {
                              try {
                                await navigator.share({ title: `Rx Form — ${form.patientName}`, text: shareText });
                              } catch(e) { /* user cancelled */ }
                            } else {
                              await navigator.clipboard.writeText(shareText);
                              toast.success('Copied to clipboard!');
                            }
                          };

                          const handlePrintSaved = () => {
                            const label = form.formType === 'NHIS' ? 'NHIS Prescription Form' : 'NACON Civilian Prescription Form';
                            const w = window.open('', '_blank', 'width=820,height=700');
                            w.document.write(`<!DOCTYPE html><html><head><title>${label}</title>
                              <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Times New Roman',Times,serif;background:#fff;color:#000;padding:28px}.uline{display:inline-block;border-bottom:1px solid #000;min-width:80px;vertical-align:bottom}.rx-box{border:2px solid #000;padding:8px;min-height:120px;font-size:12px;white-space:pre-wrap;margin:6px 0}@media print{body{padding:10px}}</style>
                              </head><body>
                              <div style="text-align:center;font-weight:bold;font-size:14px;margin-bottom:12px">${label}</div>
                              <p><b>Patient:</b> ${form.patientName || ''} &nbsp; <b>Date:</b> ${form.date || ''}</p>
                              <p><b>Age:</b> ${form.age || ''} &nbsp; <b>Sex:</b> ${form.sex || ''}</p>
                              ${form.formType==='NHIS' ? `<p><b>NHIS ID:</b> ${form.nhisId || ''}</p>` : `<p><b>Matric No:</b> ${form.matricNo || ''}</p>`}
                              <div class="rx-box"><b style="font-size:20px;font-family:serif">℞</b>&nbsp;${(form.rx||'').replace(/\n/g,'<br/>')}</div>
                              <p><b>Prescriber:</b> ${form.prescriberName || ''}</p>
                              <hr style="margin:10px 0"/><p style="font-size:10px;color:#666">Saved by ${form.savedBy||''} on ${savedDate}</p>
                              </body></html>`);
                            w.document.close(); w.focus();
                            setTimeout(() => w.print(), 400);
                          };

                          return (
                            <div key={form.id || idx} style={{
                              border:`1px solid ${accentColor}33`, borderRadius:12,
                              padding:12, background:'var(--main-bg)',
                            }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:13, color: accentColor }}>
                                    <i className={`ti ${form.formType==='NHIS' ? 'ti-shield-filled' : 'ti-user'}`} style={{ marginRight:5 }} />
                                    {form.formType==='NHIS' ? 'NHIS' : 'NACON Civilian'} Form
                                  </div>
                                  <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{savedDate}</div>
                                  <div style={{ fontSize:11, color:'var(--t3)' }}>Saved by: {form.savedBy || 'Unknown'}</div>
                                </div>
                                <div style={{ display:'flex', gap:6 }}>
                                  <button onClick={handlePrintSaved}
                                    style={{ background: accentColor, color:'#fff', border:'none', borderRadius:8,
                                      padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                                      display:'flex', alignItems:'center', gap:4 }}>
                                    <i className="ti ti-printer" /> Print
                                  </button>
                                  <button onClick={handleShare}
                                    style={{ background:'#16a34a', color:'#fff', border:'none', borderRadius:8,
                                      padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                                      display:'flex', alignItems:'center', gap:4 }}>
                                    <i className="ti ti-share" /> Share
                                  </button>
                                </div>
                              </div>
                              {/* Rx preview */}
                              <div style={{ fontSize:11, background:'var(--card-bg)', borderRadius:8,
                                padding:'8px 10px', border:'1px solid var(--border)', whiteSpace:'pre-wrap', marginTop:4 }}>
                                <span style={{ fontWeight:700, fontFamily:'serif', fontSize:16, marginRight:4 }}>℞</span>
                                {form.rx || <span style={{ color:'var(--t3)' }}>No Rx content</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </>
              );
            })()}

          </div>
        )}

        {/* ── FLUID TAB ── */}
        {activeTab==='fluid' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-droplet" />Fluid I/O Entry</div></div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:10 }}>
                  <div className="form-group"><label className="form-label">Time *</label>
                    <input type="time" className="form-input" value={fluidForm.time} onChange={e=>setFluidForm(f=>({...f,time:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Intake (ml)</label>
                    <input className="form-input" placeholder="500" value={fluidForm.intakeAmt} onChange={e=>setFluidForm(f=>({...f,intakeAmt:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Intake type</label>
                    <select className="form-select" value={fluidForm.intakeType} onChange={e=>setFluidForm(f=>({...f,intakeType:e.target.value}))}>
                      <option value="">Select…</option>
                      {['Oral','IV Normal Saline','IV Ringers Lactate','IV Dextrose 5%','Blood transfusion'].map(t=><option key={t}>{t}</option>)}
                    </select></div>
                  <div className="form-group"><label className="form-label">Output (ml)</label>
                    <input className="form-input" placeholder="300" value={fluidForm.outputAmt} onChange={e=>setFluidForm(f=>({...f,outputAmt:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Output type</label>
                    <select className="form-select" value={fluidForm.outputType} onChange={e=>setFluidForm(f=>({...f,outputType:e.target.value}))}>
                      <option value="">Select…</option>
                      {['Urine','Vomitus','Drainage','Stool'].map(t=><option key={t}>{t}</option>)}
                    </select></div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveFluid} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save entry
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-table" />Fluid Chart</div>
                {fluid.length > 0 && (
                  <div style={{ fontSize:11, fontWeight:700 }}>
                    In: <span style={{color:'var(--info)'}}>{fluid.reduce((a,f)=>a+(parseInt(f.intakeAmt)||0),0)}ml</span> ·
                    Out: <span style={{color:'var(--warn)'}}>{fluid.reduce((a,f)=>a+(parseInt(f.outputAmt)||0),0)}ml</span>
                  </div>
                )}
              </div>
              <table className="chart-table">
                <thead><tr><th>Time</th><th>Intake (ml)</th><th>Type</th><th>Output (ml)</th><th>Type</th><th>By</th></tr></thead>
                <tbody>
                  {fluid.map(f=>(
                    <tr key={f.id}>
                      <td>{f.time}</td>
                      <td style={{color:'var(--info)',fontWeight:700}}>{f.intakeAmt||'—'}</td>
                      <td className="text-muted">{f.intakeType}</td>
                      <td style={{color:'var(--warn)',fontWeight:700}}>{f.outputAmt||'—'}</td>
                      <td className="text-muted">{f.outputType}</td>
                      <td className="text-muted text-sm">{f.recordedBy}</td>
                    </tr>
                  ))}
                  {fluid.length===0 && <tr><td colSpan={6} style={{textAlign:'center',color:'var(--t3)',padding:16}}>No entries yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── GLUCOSE TAB ── */}
        {activeTab==='glucose' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-activity" />Blood Glucose Reading</div></div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:10 }}>
                  <div className="form-group"><label className="form-label">Time</label>
                    <input type="time" className="form-input" value={glucForm.time} onChange={e=>setGlucForm(g=>({...g,time:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Blood glucose (mmol/L) *</label>
                    <input className="form-input" placeholder="5.4" value={glucForm.reading} onChange={e=>setGlucForm(g=>({...g,reading:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Context</label>
                    <select className="form-select" value={glucForm.context} onChange={e=>setGlucForm(g=>({...g,context:e.target.value}))}>
                      <option value="">Select…</option>
                      {['Fasting','Pre-meal','Post-meal (2hr)','Random','Bedtime'].map(c=><option key={c}>{c}</option>)}
                    </select></div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveGlucose} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save reading
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-table" />Glycemic Chart</div></div>
              <table className="chart-table">
                <thead><tr><th>Time</th><th>Reading (mmol/L)</th><th>Context</th><th>Status</th><th>By</th></tr></thead>
                <tbody>
                  {glucose.map(g=>{
                    const v=parseFloat(g.reading);
                    const status=v<4?'Low':v>10?'High':v>7?'Elevated':'Normal';
                    const scls=v<4?'badge-warn':v>10?'badge-danger':v>7?'badge-warn':'badge-ok';
                    return (
                      <tr key={g.id}>
                        <td>{g.time}</td>
                        <td style={{fontWeight:700}}>{g.reading}</td>
                        <td className="text-muted">{g.context}</td>
                        <td><span className={`badge ${scls}`}>{status}</span></td>
                        <td className="text-muted text-sm">{g.recordedBy}</td>
                      </tr>
                    );
                  })}
                  {glucose.length===0 && <tr><td colSpan={5} style={{textAlign:'center',color:'var(--t3)',padding:16}}>No readings yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NURSING / DOCTOR NOTES ── */}
        {(activeTab==='nursing' || (activeTab==='doctor' && isDoctor)) && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <i className={`ti ${activeTab==='doctor'?'ti-stethoscope':'ti-notes-medical'}`} />
                  {activeTab==='doctor' ? "Doctor's Consultation Note" : 'Nursing Report'}
                </div>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">
                    {activeTab==='doctor' ? 'C/O · O/E · Diagnosis · Plan' : 'Nursing observation / intervention'}
                  </label>
                  <textarea className="form-textarea full-width" rows={6}
                    placeholder={activeTab==='doctor'
                      ? 'C/O: headache × 2 days\nO/E: Temp 38.5°C, BP 110/70\nDx: ? Malaria\nPlan: IM Artemether 160mg OD × 3/7…'
                      : 'Patient assessment, interventions, response to treatment…'}
                    value={noteText} onChange={e=>setNoteText(e.target.value)} />
                </div>
                <button className="btn btn-primary mt-3" onClick={saveNote} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save note
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-history" />All Notes</div></div>
              {notes.map(n => (
                <div key={n.id} className="note-block">
                  <div className="note-header">
                    <div className="note-avatar" style={{
                      background: n.authorRole==='doctor'?'var(--success-bg)':'var(--info-bg)',
                      color: n.authorRole==='doctor'?'var(--success)':'var(--info)',
                    }}>
                      {(n.authorName||'').slice(0,2).toUpperCase()}
                    </div>
                    <div className="note-author">{n.authorName}</div>
                    <span className={`badge ${n.authorRole==='doctor'?'badge-ok':'badge-info'}`} style={{fontSize:9}}>
                      {n.authorRole==='doctor'?"Doctor's note":"Nursing note"}
                    </span>
                    <div className="note-time">{formatDateTime(n.createdAt)}</div>
                  </div>
                  <div className="note-text" style={{ whiteSpace:'pre-line' }}>{n.text}</div>
                </div>
              ))}
              {notes.length===0 && <div style={{ padding:16, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>No notes yet</div>}
            </div>
          </div>
        )}

        {/* ── DOCTOR'S REPORT TAB (doctor only) ── */}
        {activeTab==='doctor' && isDoctor && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-stethoscope" />Doctor's Consultation Note</div>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">C/O · O/E · Diagnosis · Plan</label>
                  <textarea className="form-textarea full-width" rows={6}
                    placeholder={'C/O: headache × 2 days\nO/E: Temp 38.5°C, BP 110/70\nDx: ? Malaria\nPlan: IM Artemether 160mg OD × 3/7…'}
                    value={noteText} onChange={e=>setNoteText(e.target.value)} />
                </div>
                <button className="btn btn-primary mt-3" onClick={saveNote} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save note
                </button>
              </div>
            </div>}
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-history" />Doctor's Notes History</div></div>
              {notes.filter(n=>n.authorRole==='doctor').map(n => (
                <div key={n.id} className="note-block">
                  <div className="note-header">
                    <div className="note-avatar" style={{ background:'var(--success-bg)', color:'var(--success)' }}>
                      {(n.authorName||'').slice(0,2).toUpperCase()}
                    </div>
                    <div className="note-author">{n.authorName}</div>
                    <span className="badge badge-ok" style={{fontSize:9}}>Doctor's note</span>
                    <div className="note-time">{formatDateTime(n.createdAt)}</div>
                  </div>
                  <div className="note-text" style={{ whiteSpace:'pre-line' }}>{n.text}</div>
                </div>
              ))}
              {notes.filter(n=>n.authorRole==='doctor').length===0 && (
                <div style={{ padding:16, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>No doctor notes yet</div>
              )}
            </div>
          </div>
        )}

        {/* ── UPLOADS / LABS TAB ── */}
        {activeTab==='uploads' && isDoctor && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!viewOnly && <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-upload" />Upload Lab Result / Scan</div></div>
              <div className="card-body">
                <div className="upload-zone" onClick={() => fileInput.current?.click()}>
                  <i className="ti ti-cloud-upload" />
                  <p>{saving ? 'Uploading…' : 'Tap to upload PDF, image, or scan result'}</p>
                  <p style={{fontSize:10,marginTop:4,color:'var(--t3)'}}>PNG · JPG · PDF · Max 10MB</p>
                </div>
                <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{display:'none'}} onChange={handleUpload} />
              </div>
            </div>}
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-files" />Uploaded Files</div></div>
              {uploads.map(u => (
                <div key={u.id} className="upload-file-row" style={{ borderBottom:'1px solid var(--border)' }}>
                  <i className={`ti ${u.fileType?.includes('pdf')?'ti-file-text':'ti-photo'}`} style={{fontSize:20,color:'var(--accent)'}} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--t1)'}}>{u.fileName}</div>
                    <div style={{fontSize:10,color:'var(--t3)',fontWeight:500}}>{formatDateTime(u.uploadedAt)} · {u.uploadedBy}</div>
                  </div>
                  <span className="badge badge-info">{u.category}</span>
                  <a href={u.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-sm">
                    <i className="ti ti-external-link" /> View
                  </a>
                </div>
              ))}
              {uploads.length===0 && <div style={{ padding:16, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>No files uploaded yet</div>}
            </div>
          </div>
        )}

        {/* ── MAR TAB ── */}
        {activeTab==='mar' && (
          <MARTab
            emrNumber={emrNumber}
            visitId={visitId}
            prescriptions={rx}
            patient={patient}
          />
        )}

        {/* ── LAB TAB ── */}
        {activeTab==='lab' && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Request form — doctors and nurses only */}
            {(isDoctor || isNurse) && (
              <LabRequestForm
                emr={emrNumber}
                visitId={visitId}
                ensureVisitId={ensureVisitId}
                profile={profile}
                onSaved={() => {}}
              />
            )}
            {/* Results history — all roles with lab tab access */}
            <LabResultsHistory
              labResults={labResults}
              labRequests={labRequests}
            />
          </div>
        )}

        {/* ── REFERRAL / DISCHARGE TAB ── */}
        {activeTab==='referral' && (isDoctor || isNurse) && (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-transfer" />Transfer / Discharge</div></div>
              <div className="card-body">
                <div className="form-grid-2" style={{ gap:12, marginBottom:12 }}>
                  <div className="form-group">
                    <label className="form-label">Referring to (hospital) *</label>
                    <input className="form-input" placeholder="e.g. Lagos University Teaching Hospital"
                      value={refForm.to} onChange={e=>setRefForm(r=>({...r,to:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Purpose / specialty</label>
                    <input className="form-input" placeholder="e.g. Further management"
                      value={refForm.purpose} onChange={e=>setRefForm(r=>({...r,purpose:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group mb-3">
                  <label className="form-label">Clinical notes for receiving facility</label>
                  <textarea className="form-textarea full-width" rows={5}
                    placeholder="Patient presents with… Dx: … Treatment given: … Please see and manage accordingly."
                    value={refForm.clinicalNotes} onChange={e=>setRefForm(r=>({...r,clinicalNotes:e.target.value}))} />
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn btn-primary" onClick={handleReferral} disabled={saving}>
                    <i className="ti ti-file-export" /> Generate referral letter
                  </button>
                  <button className="btn btn-success" onClick={handleDischarge} disabled={saving}>
                    <i className="ti ti-door-exit" /> Discharge patient
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ══ TIMELINE EVENT DETAIL DRAWER ══ */}
      {selectedEvent && (
        <div style={{
          position:'fixed', inset:0, zIndex:2000,
          background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'flex-end',
        }} onClick={() => setSelectedEvent(null)}>
          <div style={{
            width:'100%', maxHeight:'80vh',
            background:'var(--card-bg)',
            borderRadius:'18px 18px 0 0',
            display:'flex', flexDirection:'column',
            overflow:'hidden',
            boxShadow:'0 -4px 32px rgba(0,0,0,0.25)',
          }} onClick={e => e.stopPropagation()}>

            {/* Drawer header */}
            <div style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'14px 16px',
              borderBottom:'1px solid var(--border)',
              flexShrink:0,
            }}>
              <div style={{
                width:34, height:34, borderRadius:10,
                background: tlColor[selectedEvent.type] + '22',
                display:'flex', alignItems:'center', justifyContent:'center',
                flexShrink:0,
              }}>
                <i className={`ti ${tlIcon[selectedEvent.type]}`} style={{ color: tlColor[selectedEvent.type], fontSize:18 }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{tlTitle[selectedEvent.type]}</div>
                <div style={{ fontSize:11, color:'var(--t3)' }}>{formatDateTime(selectedEvent.ts)}</div>
              </div>
              <button onClick={() => setSelectedEvent(null)} style={{
                background:'var(--card-bg2)', border:'none', borderRadius:8,
                width:32, height:32, cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
                color:'var(--t2)', flexShrink:0,
              }}>
                <i className="ti ti-x" style={{ fontSize:16 }} />
              </button>
            </div>

            {/* Drawer body — scrollable */}
            <div style={{ overflowY:'auto', padding:'16px', overscrollBehavior:'none' }}>

              {/* ── NOTE ── */}
              {selectedEvent.type === 'note' && (() => {
                const n = selectedEvent.data;
                return (
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
                      <div style={{
                        background: n.authorRole==='doctor'?'var(--success-bg)':'var(--info-bg)',
                        color: n.authorRole==='doctor'?'var(--success)':'var(--info)',
                        width:30, height:30, borderRadius:'50%',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:700,
                      }}>{(n.authorName||'').slice(0,2).toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)' }}>{n.authorName}</div>
                        <span className={`badge ${n.authorRole==='doctor'?'badge-ok':'badge-info'}`} style={{ fontSize:9 }}>
                          {n.authorRole==='doctor'?"Doctor's note":"Nursing note"}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:10, padding:'14px',
                      fontSize:13, fontWeight:500, color:'var(--t1)', lineHeight:1.8,
                      whiteSpace:'pre-line',
                    }}>{n.text}</div>
                  </div>
                );
              })()}

              {/* ── VITALS ── */}
              {selectedEvent.type === 'vitals' && (() => {
                const v = selectedEvent.data;
                const rows = [
                  { label:'Blood Pressure', value:`${v.sbp}/${v.dbp}`, unit:'mmHg', key:'sbp', icon:'ti-heartbeat' },
                  { label:'Heart Rate',     value:v.hr,   unit:'bpm',   key:'hr',   icon:'ti-heart-rate-monitor' },
                  { label:'Temperature',    value:v.temp, unit:'°C',    key:'temp', icon:'ti-temperature' },
                  { label:'Resp. Rate',     value:v.rr,   unit:'/min',  key:'rr',   icon:'ti-lungs' },
                  { label:'SpO₂',           value:v.spo2, unit:'%',     key:'spo2', icon:'ti-activity' },
                  { label:'Weight',         value:v.weight||'—', unit:'kg', key:'', icon:'ti-scale' },
                ];
                return (
                  <div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      {rows.map(r => {
                        const flag = r.key ? vitalFlag(r.key, r.value) : 'ok';
                        const clr  = flag==='high'?'var(--danger)':flag==='low'?'var(--warn)':'var(--t1)';
                        const bg   = flag==='high'?'var(--danger-bg)':flag==='low'?'var(--warn-bg)':'var(--card-bg2)';
                        return (
                          <div key={r.label} style={{ background:bg, borderRadius:10, padding:'12px 14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                              <i className={`ti ${r.icon}`} style={{ fontSize:13, color:clr }} />
                              <span style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase' }}>{r.label}</span>
                            </div>
                            <div style={{ fontSize:22, fontWeight:700, color:clr, lineHeight:1 }}>{r.value}</div>
                            <div style={{ fontSize:10, color:'var(--t3)', marginTop:2 }}>{r.unit}</div>
                          </div>
                        );
                      })}
                    </div>
                    {v.notes && (
                      <div style={{ background:'var(--card-bg2)', borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', marginBottom:5 }}>Observations</div>
                        <div style={{ fontSize:13, color:'var(--t2)', lineHeight:1.7 }}>{v.notes}</div>
                      </div>
                    )}
                    <div style={{ marginTop:10, fontSize:11, color:'var(--t3)' }}>Recorded by: <b style={{ color:'var(--t2)' }}>{v.recordedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── PRESCRIPTION ── */}
              {selectedEvent.type === 'rx' && (() => {
                const r = selectedEvent.data;
                return (
                  <div>
                    {r.requiresCountersign && (
                      <div className="alert alert-warn" style={{ marginBottom:12 }}>
                        <i className="ti ti-alert-triangle" /> Nurse prescription — requires doctor countersignature
                      </div>
                    )}
                    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                      {r.drugs?.map((d, i) => (
                        <div key={i} style={{
                          background:'var(--card-bg2)', borderRadius:10, padding:'12px 14px',
                          display:'flex', alignItems:'center', gap:12,
                        }}>
                          <div style={{
                            width:36, height:36, borderRadius:9,
                            background:'var(--success-bg)', color:'var(--success)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:18, flexShrink:0,
                          }}>💊</div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{d.drug}</div>
                            <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                              {[d.dose, d.frequency, d.duration].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>Prescribed by: <b style={{ color:'var(--t2)' }}>{r.prescribedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── FLUID ── */}
              {selectedEvent.type === 'fluid' && (() => {
                const f = selectedEvent.data;
                return (
                  <div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                      <div style={{ background:'var(--info-bg)', borderRadius:10, padding:'14px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--info)', textTransform:'uppercase', marginBottom:4 }}>💧 Intake</div>
                        <div style={{ fontSize:28, fontWeight:700, color:'var(--info)' }}>{f.intakeAmt || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--info)' }}>ml</div>
                        {f.intakeType && <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{f.intakeType}</div>}
                      </div>
                      <div style={{ background:'var(--warn-bg)', borderRadius:10, padding:'14px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'var(--warn)', textTransform:'uppercase', marginBottom:4 }}>🔴 Output</div>
                        <div style={{ fontSize:28, fontWeight:700, color:'var(--warn)' }}>{f.outputAmt || '—'}</div>
                        <div style={{ fontSize:11, color:'var(--warn)' }}>ml</div>
                        {f.outputType && <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>{f.outputType}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>
                      Time: <b style={{ color:'var(--t2)' }}>{f.time || formatTime(f.recordedAt)}</b>
                      {' · '}Recorded by: <b style={{ color:'var(--t2)' }}>{f.recordedBy}</b>
                    </div>
                  </div>
                );
              })()}

              {/* ── GLUCOSE ── */}
              {selectedEvent.type === 'glucose' && (() => {
                const g = selectedEvent.data;
                const val = parseFloat(g.reading);
                const status = val<4?'Low':val>10?'High':val>7?'Elevated':'Normal';
                const scls   = val<4?'badge-warn':val>10?'badge-danger':val>7?'badge-warn':'badge-ok';
                const clr    = val<4?'var(--warn)':val>10?'var(--danger)':val>7?'var(--warn)':'var(--success)';
                return (
                  <div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:14, padding:'24px',
                      textAlign:'center', marginBottom:12,
                    }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', marginBottom:6 }}>Blood Glucose</div>
                      <div style={{ fontSize:52, fontWeight:700, color:clr, lineHeight:1 }}>{g.reading}</div>
                      <div style={{ fontSize:13, color:'var(--t3)', marginTop:4 }}>mmol/L</div>
                      <span className={`badge ${scls}`} style={{ marginTop:10, display:'inline-flex', fontSize:12, padding:'4px 14px' }}>{status}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>
                      Context: <b style={{ color:'var(--t2)' }}>{g.context || '—'}</b>
                      {' · '}Time: <b style={{ color:'var(--t2)' }}>{g.time || formatTime(g.recordedAt)}</b>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:4 }}>Recorded by: <b style={{ color:'var(--t2)' }}>{g.recordedBy}</b></div>
                  </div>
                );
              })()}

              {/* ── FILE UPLOAD ── */}
              {selectedEvent.type === 'upload' && (() => {
                const u = selectedEvent.data;
                const isPdf = u.fileType?.includes('pdf');
                return (
                  <div>
                    <div style={{
                      background:'var(--card-bg2)', borderRadius:12, padding:'20px',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:10,
                      marginBottom:12,
                    }}>
                      <i className={`ti ${isPdf?'ti-file-text':'ti-photo'}`} style={{ fontSize:44, color:'var(--accent)' }} />
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)', textAlign:'center' }}>{u.fileName}</div>
                      <div style={{ fontSize:11, color:'var(--t3)' }}>{u.category} · {Math.round((u.fileSize||0)/1024)}KB</div>
                    </div>
                    <a href={u.downloadUrl} target="_blank" rel="noreferrer" className="btn btn-primary"
                      style={{ display:'flex', justifyContent:'center', textDecoration:'none', width:'100%' }}>
                      <i className="ti ti-external-link" /> Open file
                    </a>
                    <div style={{ fontSize:11, color:'var(--t3)', marginTop:10 }}>Uploaded by: <b style={{ color:'var(--t2)' }}>{u.uploadedBy}</b></div>
                  </div>
                );
              })()}

            </div>
          </div>
        </div>
      )}
      {/* ── ALLERGY ALERT MODAL ── */}
      {allergyAlert && (
        <AllergyAlert
          conflicts={allergyAlert.conflicts}
          allergyString={allergyAlert.allergyStr}
          onCancel={() => setAllergyAlert(null)}
          onOverride={async () => {
            setAllergyAlert(null);
            if (allergyAlert.onConfirm) await allergyAlert.onConfirm();
            else await doSaveRx(allergyAlert.pendingRx);
          }}
        />
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── LAB REQUEST FORM ──────────────────────────
function LabRequestForm({ emr, visitId, ensureVisitId, profile, onSaved }) {
  const groups = [...new Set(LAB_TESTS.map(t => t.group))];
  const [selected, setSelected] = useState([]);
  const [urgency,  setUrgency]  = useState('routine');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);

  const toggle = (name) =>
    setSelected(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);

  const save = async () => {
    if (!selected.length) { toast.error('Select at least one test'); return; }
    setSaving(true);
    try {
      // Ensure a visit exists before writing the lab request
      const vid = visitId || (ensureVisitId ? await ensureVisitId() : null);
      await requestLabTest(emr, vid, selected, profile?.displayName || profile?.email || 'Unknown', urgency, notes);
      toast.success('Lab request sent');
      setSelected([]); setNotes(''); setUrgency('routine');
      onSaved?.();
    } catch(e) {
      console.error('Lab request failed:', e);
      toast.error('Failed: ' + (e?.message || String(e)));
    }
    setSaving(false);
  };

  const URGENCY_OPTS = [
    { val:'routine', label:'Routine', color:'var(--accent)' },
    { val:'urgent',  label:'Urgent',  color:'#c2410c' },
    { val:'stat',    label:'STAT',    color:'#b91c1c' },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-microscope" />Order Lab Investigations</div>
        {selected.length > 0 && (
          <span style={{ fontSize:11, fontWeight:700, color:'#0E7490',
            background:'rgba(14,116,144,.1)', padding:'2px 8px', borderRadius:6 }}>
            {selected.length} selected
          </span>
        )}
      </div>
      <div className="card-body">
        {/* Urgency */}
        <div style={{ display:'flex', gap:8, marginBottom:16, alignItems:'center' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)' }}>Priority:</span>
          {URGENCY_OPTS.map(u => (
            <button key={u.val} onClick={() => setUrgency(u.val)} style={{
              padding:'4px 12px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${u.color}`, fontFamily:'var(--font)',
              background: urgency === u.val ? u.color : 'transparent',
              color:      urgency === u.val ? '#fff'  : u.color,
            }}>{u.label}</button>
          ))}
        </div>

        {/* Test picker grouped */}
        {groups.map(grp => (
          <div key={grp} style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--t3)', textTransform:'uppercase',
              letterSpacing:'.06em', marginBottom:6 }}>{grp}</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {LAB_TESTS.filter(t => t.group === grp).map(t => {
                const on = selected.includes(t.name);
                return (
                  <button key={t.name} onClick={() => toggle(t.name)} style={{
                    padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
                    border:`1.5px solid ${on ? '#0E7490' : 'var(--border)'}`,
                    background: on ? 'rgba(14,116,144,.12)' : 'var(--card-bg)',
                    color: on ? '#0E7490' : 'var(--t2)', fontFamily:'var(--font)', transition:'all .15s',
                  }}>
                    {on && <i className="ti ti-check" style={{ marginRight:3, fontSize:10 }} />}
                    {t.abbr}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Selected list */}
        {selected.length > 0 && (
          <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8,
            background:'rgba(14,116,144,.06)', border:'1px solid rgba(14,116,144,.15)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#0E7490', marginBottom:4 }}>ORDERED TESTS</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {selected.map(s => (
                <span key={s} onClick={() => toggle(s)} title="Click to remove"
                  style={{ fontSize:11, padding:'2px 8px', borderRadius:4, cursor:'pointer',
                    background:'rgba(14,116,144,.15)', color:'#0E7490', fontWeight:600 }}>
                  {s} ×
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Clinical indication / notes to lab</label>
          <textarea className="form-textarea" rows={2}
            placeholder="e.g. ? Malaria, Fever × 3/7"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving || !selected.length}>
          {saving
            ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Sending…</>
            : <><i className="ti ti-send" /> Send to Lab ({selected.length} test{selected.length!==1?'s':''})</>
          }
        </button>
      </div>
    </div>
  );
}

// ── LAB RESULTS HISTORY ───────────────────────
const URGENCY_BADGE_L = { stat:'badge-danger', urgent:'badge-warn', routine:'badge-info' };
const STATUS_BADGE_L  = { pending:'badge-warn', processing:'badge-info', completed:'badge-ok' };
const FLAG_COLOR_L    = { high:'#dc2626', low:'#d97706', normal:'var(--success)', '':'var(--t3)' };

function LabResultsHistory({ labResults, labRequests }) {
  const [openId, setOpenId] = useState(null);
  const allRequests = [...labRequests].sort((a,b) =>
    (b.requestedAt?.seconds||0) - (a.requestedAt?.seconds||0));

  if (!allRequests.length) return (
    <div className="card">
      <div className="card-body" style={{ textAlign:'center', fontSize:12, fontWeight:700,
        color:'var(--t3)', padding:24 }}>
        <i className="ti ti-microscope" style={{ fontSize:28, display:'block', marginBottom:8, opacity:.4 }} />
        No lab requests yet for this patient
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-test-pipe" />Lab Requests & Results</div>
        <span style={{ fontSize:11, fontWeight:600, color:'var(--t3)' }}>
          {allRequests.length} request{allRequests.length!==1?'s':''}
        </span>
      </div>
      {allRequests.map(req => {
        const isOpen = openId === req.id;
        const result = labResults.find(r => r.requestId === req.id);
        return (
          <div key={req.id} style={{ borderBottom:'1px solid var(--border)' }}>
            <div onClick={() => setOpenId(isOpen ? null : req.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                cursor:'pointer', background: isOpen ? 'var(--accent-bg)' : 'transparent', transition:'background .15s' }}>
              <div style={{ width:34, height:34, borderRadius:8, flexShrink:0,
                background: req.status==='completed' ? 'rgba(22,163,74,.15)' : 'rgba(14,116,144,.12)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <i className={`ti ${req.status==='completed' ? 'ti-circle-check' : 'ti-microscope'}`}
                  style={{ fontSize:16, color: req.status==='completed' ? 'var(--success)' : '#0E7490' }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  {(req.tests||[]).slice(0,3).join(' · ')}
                  {req.tests?.length > 3 && <span style={{color:'var(--t3)'}}>+{req.tests.length-3} more</span>}
                  <span className={`badge ${URGENCY_BADGE_L[req.urgency]||'badge-info'}`} style={{fontSize:9}}>
                    {req.urgency?.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                  {formatTs(req.requestedAt)} · {req.requestedBy}
                </div>
              </div>
              <span className={`badge ${STATUS_BADGE_L[req.status]||'badge-neutral'}`} style={{fontSize:10}}>
                {req.status}
              </span>
              <i className={`ti ${isOpen?'ti-chevron-up':'ti-chevron-down'}`}
                style={{ fontSize:16, color:'var(--t3)', flexShrink:0 }} />
            </div>

            {isOpen && (
              <div style={{ padding:'0 14px 14px', background:'var(--accent-bg)' }}>
                <div style={{ fontSize:11, color:'var(--t3)', marginBottom:10, display:'flex', gap:16, flexWrap:'wrap' }}>
                  <span><strong style={{color:'var(--t2)'}}>Ordered by:</strong> {req.requestedBy}</span>
                  <span><strong style={{color:'var(--t2)'}}>On:</strong> {formatTs(req.requestedAt)}</span>
                  {req.notes && <span><strong style={{color:'var(--t2)'}}>Note:</strong> {req.notes}</span>}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                  {(req.tests||[]).map(t => (
                    <span key={t} style={{ padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:600,
                      background:'rgba(14,116,144,.1)', color:'#0E7490', border:'1px solid rgba(14,116,144,.2)' }}>{t}</span>
                  ))}
                </div>
                {result ? (
                  <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <div style={{ padding:'6px 12px', background:'rgba(22,163,74,.1)',
                      borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--success)' }}>
                        <i className="ti ti-circle-check" style={{ marginRight:4 }} />
                        Results by {result.resultEnteredBy}
                      </span>
                      <span style={{ fontSize:10, color:'var(--t3)' }}>{formatTs(result.completedAt)}</span>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'rgba(0,0,0,.03)' }}>
                          {['Test','Result','Unit','Ref Range','Flag'].map(h => (
                            <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9,
                              fontWeight:700, color:'var(--t3)', textTransform:'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(result.results||{}).map(([test, r], i) => (
                          <tr key={test} style={{ borderTop:'1px solid var(--border)',
                            background: i%2===0 ? 'transparent' : 'rgba(0,0,0,.015)' }}>
                            <td style={{ padding:'7px 10px', fontWeight:700 }}>{test}</td>
                            <td style={{ padding:'7px 10px', fontWeight:800,
                              color: r.flag==='high'?'#dc2626':r.flag==='low'?'#d97706':'var(--t1)' }}>
                              {r.value||'—'}
                            </td>
                            <td style={{ padding:'7px 10px', color:'var(--t3)' }}>{r.unit||'—'}</td>
                            <td style={{ padding:'7px 10px', color:'var(--t3)' }}>{r.referenceRange||'—'}</td>
                            <td style={{ padding:'7px 10px' }}>
                              {r.flag ? (
                                <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
                                  background: r.flag==='high'?'#fee2e2':r.flag==='low'?'#ffedd5':'rgba(22,163,74,.1)',
                                  color: FLAG_COLOR_L[r.flag]||'var(--t3)' }}>
                                  {r.flag.toUpperCase()}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:'var(--t3)', fontWeight:700,
                    padding:'10px', textAlign:'center', background:'rgba(0,0,0,.02)', borderRadius:8 }}>
                    <i className="ti ti-clock" style={{ marginRight:4 }} />
                    {req.status==='processing' ? 'Lab is processing…' : 'Awaiting lab processing'}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


