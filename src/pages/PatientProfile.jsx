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
  formatDateTime, ROLES,
} from '../lib/emr';

import MARTab from '../components/patients/MARTab';

const TABS = [
  { id:'visit',    label:'Visit',           icon:'🏥',  roles: ['doctor','nurse','admin','subadmin'] },
  { id:'vitals',   label:'Vitals',          icon:'❤️',  roles: ['doctor','nurse','admin','subadmin'] },
  { id:'rx',       label:'Prescription',    icon:'💊',  roles: ['doctor','nurse'] },
  { id:'fluid',    label:'Fluid I/O',       icon:'💧',  roles: ['doctor','nurse'] },
  { id:'glucose',  label:'Glycemic',        icon:'🩸',  roles: ['doctor','nurse'] },
  { id:'nursing',  label:'Nursing',         icon:'📋',  roles: ['nurse'] },          // Nurse ONLY — doctors read via timeline
  { id:'doctor',   label:"Doctor's Report", icon:'🩺',  roles: ['doctor'] },
  { id:'mar',      label:'MAR',             icon:'💉',  roles: ['doctor','nurse'] },
  { id:'referral', label:'Transfer/D/C',    icon:'🔄',  roles: ['doctor','nurse'] },
  { id:'uploads',  label:'Documents',       icon:'📁',  roles: ['doctor','nurse','records','admin','subadmin'] },
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
  const [fluidForm, setFluidForm] = useState({ time:'', intakeAmt:'', intakeType:'', outputAmt:'', outputType:'' });
  const [glucForm,  setGlucForm]  = useState({ time:'', reading:'', context:'' });
  const [refForm,   setRefForm]   = useState({ to:'', purpose:'', clinicalNotes:'' });
  const [selectedEvent, setSelectedEvent] = useState(null); // timeline detail drawer
  const [viewOnly,       setViewOnly]       = useState(false);  // action buttons open view-only
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
      listenNotes(emrNumber,         setNotes),
      listenVitals(emrNumber,        setVitals),
      listenPrescriptions(emrNumber, setRx),
      listenFluidChart(emrNumber,    setFluid),
      listenGlucoseChart(emrNumber,  setGlucose),
      listenUploads(emrNumber,       setUploads),
    ];
    return () => unsubs.forEach(u => u && u());
  }, [emrNumber]);

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
            <div style={{ overflowY:'auto', padding:'16px', WebkitOverflowScrolling:'touch' }}>

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
      await addNote(emrNumber, vid, { text: noteText, type: isDoctor?'doctor':'nurse' }, profile.displayName, profile.role);
      setNoteText(''); toast.success('Note saved');
    } catch(e) { console.error('saveNote',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveVitals = async () => {
    if (!vitalForm.sbp && !vitalForm.temp) { toast.error('Enter at least BP or temperature'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addVitals(emrNumber, vid, vitalForm, profile.displayName);
      setVitalForm({ sbp:'', dbp:'', hr:'', temp:'', rr:'', spo2:'' });
      toast.success('Vitals recorded');
    } catch(e) { console.error('saveVitals',e); toast.error('Failed: ' + (e?.message||e)); }
    setSaving(false);
  };

  const saveRx = async () => {
    const valid = rxForm.filter(r => r.drug.trim());
    if (!valid.length) { toast.error('Add at least one medication'); return; }
    if (!profile) { toast.error('Not logged in'); return; }
    setSaving(true);
    try {
      const vid = await ensureVisitId();
      await addPrescription(emrNumber, vid, valid, profile.displayName || profile.email || 'Unknown', profile.role || 'nurse');
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
      await uploadPatientFile(emrNumber, visitId, file, 'lab_result', profile.displayName);
      toast.success(`${file.name} uploaded`);
    } catch { toast.error('Upload failed'); }
    setSaving(false);
    e.target.value = '';
  };

  const handleReferral = async () => {
    if (!refForm.to) { toast.error('Enter referral destination'); return; }
    setSaving(true);
    try {
      await createReferral(emrNumber, visitId, refForm, profile.displayName);
      toast.success('Referral created'); navigate(-1);
    } catch { toast.error('Failed'); }
    setSaving(false);
  };

  const handleDischarge = async () => {
    if (!window.confirm('Discharge this patient?')) return;
    setSaving(true);
    try {
      await dischargePatient(emrNumber, visitId, 'Discharged in good condition', profile.displayName);
      toast.success('Patient discharged'); navigate(-1);
    } catch { toast.error('Failed'); }
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

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--main-bg)' }}>

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
          <button key={t.id} onClick={() => { setActiveTab(t.id); setViewOnly(t.id !== 'nursing' && t.id !== 'doctor'); if(collapseRef.current){collapseRef.current.classList.remove('pp-collapsed'); isCollapsed.current=false; if(scrollRef.current) scrollRef.current.scrollTop=0;} }} style={{
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

      {/* ══ TAB CONTENT — scrollable ══ */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ flex:1, overflowY:'auto', padding:'14px', WebkitOverflowScrolling:'touch', overscrollBehavior:'contain' }}
      >

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
                    <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:700, color: patient.knownAllergies ? 'var(--danger)' : 'var(--success)' }}>
                      {patient.knownAllergies ? `⚠ ${patient.knownAllergies}` : '✓ No known allergies'}
                    </div>
                  </div>
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
              <div className="card-header"><div className="card-title"><i className="ti ti-history" />Prescription History</div></div>
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
            <div style={{ overflowY:'auto', padding:'16px', WebkitOverflowScrolling:'touch' }}>

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
}

