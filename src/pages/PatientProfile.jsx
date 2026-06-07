// src/pages/PatientProfile.jsx
// Full patient profile — all tabs, timeline, vitals, notes, rx, fluid, glucose, uploads
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  getPatient, listenNotes, listenVitals, listenPrescriptions,
  listenFluidChart, listenGlucoseChart, listenUploads,
  addNote, addVitals, addPrescription, addFluidEntry,
  addGlucoseReading, uploadPatientFile, createReferral,
  dischargePatient, createVisit, formatTs, formatTime, ROLES,
} from '../lib/emr';

const TABS = [
  { id:'visit',    label:'Visit',         icon:'ti-clipboard-list' },
  { id:'vitals',   label:'Vitals',        icon:'ti-heart-rate-monitor' },
  { id:'rx',       label:'Prescription',  icon:'ti-pill' },
  { id:'fluid',    label:'Fluid Chart',   icon:'ti-droplet' },
  { id:'glucose',  label:'Glucose',       icon:'ti-activity' },
  { id:'nursing',  label:'Nursing',       icon:'ti-notes-medical' },
  { id:'doctor',   label:'Doctor\'s Report', icon:'ti-stethoscope' },
  { id:'labs',     label:'Labs',          icon:'ti-flask' },
  { id:'uploads',  label:'Uploads',       icon:'ti-upload' },
];

// Vital thresholds
const vitalStatus = (key, val) => {
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  if (key==='temp')  return v>37.5?'vital-high':v<36?'vital-low':'vital-ok';
  if (key==='sbp')   return v>139?'vital-high':v<90?'vital-low':'vital-ok';
  if (key==='hr')    return v>100?'vital-high':v<60?'vital-low':'vital-ok';
  if (key==='spo2')  return v<95?'vital-high':'vital-ok';
  if (key==='rr')    return v>20?'vital-high':v<12?'vital-low':'vital-ok';
  return '';
};

export default function PatientProfile() {
  const { emrNumber } = useParams();
  const { profile }   = useAuth();
  const navigate      = useNavigate();

  const [patient,    setPatient]    = useState(null);
  const [activeTab,  setActiveTab]  = useState('visit');
  const [notes,      setNotes]      = useState([]);
  const [vitals,     setVitals]     = useState([]);
  const [rx,         setRx]         = useState([]);
  const [fluid,      setFluid]      = useState([]);
  const [glucose,    setGlucose]    = useState([]);
  const [uploads,    setUploads]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [visitId,    setVisitId]    = useState(null);

  // Form states
  const [noteText,   setNoteText]   = useState('');
  const [vitalForm,  setVitalForm]  = useState({ sbp:'', dbp:'', hr:'', temp:'', rr:'', spo2:'' });
  const [rxForm,     setRxForm]     = useState([{ drug:'', dose:'', frequency:'', duration:'' }]);
  const [fluidForm,  setFluidForm]  = useState({ time:'', intakeAmt:'', intakeType:'', outputAmt:'', outputType:'' });
  const [glucForm,   setGlucForm]   = useState({ time:'', reading:'', context:'' });
  const [refForm,    setRefForm]    = useState({ to:'', purpose:'', clinicalNotes:'' });
  const fileInput = useRef();

  // Load patient
  useEffect(() => {
    (async () => {
      const p = await getPatient(emrNumber);
      if (!p) { toast.error('Patient not found'); navigate(-1); return; }
      setPatient(p);
      setLoading(false);

      // Create/find today's visit
      const vid = await createVisit(emrNumber, { type: 'outpatient', date: new Date().toISOString() }, profile?.displayName);
      setVisitId(vid);
    })();
  }, [emrNumber]);

  // Real-time listeners
  useEffect(() => {
    if (!emrNumber) return;
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
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
      <i className="ti ti-loader-2" style={{fontSize:32,animation:'spin 1s linear infinite',color:'var(--accent)'}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isDoctor = profile?.role === ROLES.DOCTOR;
  const isNurse  = profile?.role === ROLES.NURSE;
  const canPrescribe = isDoctor || isNurse;

  const initials = ((patient.surname?.[0]||'')+(patient.firstName?.[0]||'')).toUpperCase();

  // ── SAVE HANDLERS ──────────────────────────
  const saveNote = async () => {
    if (!noteText.trim()) { toast.error('Write a note first'); return; }
    setSaving(true);
    try {
      await addNote(emrNumber, visitId, { text: noteText, type: isDoctor?'doctor':'nurse' },
        profile.displayName, profile.role);
      setNoteText('');
      toast.success('Note saved');
    } catch { toast.error('Failed to save note'); }
    setSaving(false);
  };

  const saveVitals = async () => {
    if (!vitalForm.sbp && !vitalForm.temp) { toast.error('Enter at least BP or temperature'); return; }
    setSaving(true);
    try {
      await addVitals(emrNumber, visitId, vitalForm, profile.displayName);
      setVitalForm({ sbp:'', dbp:'', hr:'', temp:'', rr:'', spo2:'' });
      toast.success('Vitals recorded');
    } catch { toast.error('Failed to save vitals'); }
    setSaving(false);
  };

  const saveRx = async () => {
    const valid = rxForm.filter(r => r.drug.trim());
    if (!valid.length) { toast.error('Add at least one medication'); return; }
    setSaving(true);
    try {
      await addPrescription(emrNumber, visitId, valid, profile.displayName, profile.role);
      setRxForm([{ drug:'', dose:'', frequency:'', duration:'' }]);
      toast.success(isNurse ? 'Prescription saved — countersign required' : 'Prescription saved');
    } catch { toast.error('Failed to save prescription'); }
    setSaving(false);
  };

  const saveFluid = async () => {
    if (!fluidForm.time) { toast.error('Enter the time'); return; }
    setSaving(true);
    try {
      await addFluidEntry(emrNumber, visitId, fluidForm, profile.displayName);
      setFluidForm({ time:'', intakeAmt:'', intakeType:'', outputAmt:'', outputType:'' });
      toast.success('Fluid entry added');
    } catch { toast.error('Failed to add fluid entry'); }
    setSaving(false);
  };

  const saveGlucose = async () => {
    if (!glucForm.reading) { toast.error('Enter glucose reading'); return; }
    setSaving(true);
    try {
      await addGlucoseReading(emrNumber, visitId, glucForm, profile.displayName);
      setGlucForm({ time:'', reading:'', context:'' });
      toast.success('Glucose reading added');
    } catch { toast.error('Failed to add glucose reading'); }
    setSaving(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      await uploadPatientFile(emrNumber, visitId, file, 'lab_result', profile.displayName);
      toast.success(`${file.name} uploaded successfully`);
    } catch { toast.error('Upload failed. Try again.'); }
    setSaving(false);
  };

  const handleReferral = async () => {
    if (!refForm.to) { toast.error('Enter referral destination'); return; }
    setSaving(true);
    try {
      await createReferral(emrNumber, visitId, refForm, profile.displayName);
      toast.success('Referral created');
    } catch { toast.error('Failed to create referral'); }
    setSaving(false);
  };

  const handleDischarge = async () => {
    if (!window.confirm('Discharge this patient?')) return;
    setSaving(true);
    try {
      await dischargePatient(emrNumber, visitId, 'Discharged in good condition', profile.displayName);
      toast.success('Patient discharged');
      navigate(-1);
    } catch { toast.error('Failed to discharge patient'); }
    setSaving(false);
  };

  // ── STATUS COLOR ───────────────────────────
  const statusCls = (s) =>
    s==='active'?'badge-danger':s==='discharged'?'badge-ok':s==='referred'?'badge-warn':'badge-info';

  // ── TIMELINE — merge all events ────────────
  const timeline = [
    ...notes.map(n=>({ ts:n.createdAt, type:'note', data:n })),
    ...vitals.map(v=>({ ts:v.recordedAt, type:'vitals', data:v })),
    ...rx.map(r=>({ ts:r.createdAt, type:'rx', data:r })),
    ...fluid.map(f=>({ ts:f.recordedAt, type:'fluid', data:f })),
    ...glucose.map(g=>({ ts:g.recordedAt, type:'glucose', data:g })),
    ...uploads.map(u=>({ ts:u.uploadedAt, type:'upload', data:u })),
  ].sort((a,b)=>((b.ts?.seconds||0)-(a.ts?.seconds||0)));

  const tlDotColor = { note:'var(--accent)', vitals:'var(--danger)', rx:'var(--success)',
    fluid:'var(--info)', glucose:'var(--warn)', upload:'var(--accent2)' };

  const tlDescription = (item) => {
    if (item.type==='note')   return `${item.data.authorRole==='doctor'?"Doctor's note":"Nursing note"} — ${item.data.authorName}: ${item.data.text?.slice(0,120)}…`;
    if (item.type==='vitals') return `Vitals — BP ${item.data.sbp}/${item.data.dbp} · HR ${item.data.hr} · Temp ${item.data.temp}°C · SpO₂ ${item.data.spo2}% — ${item.data.recordedBy}`;
    if (item.type==='rx')     return `Prescription by ${item.data.prescribedBy} — ${item.data.drugs?.map(d=>d.drug).join(', ')}`;
    if (item.type==='fluid')  return `Fluid — In: ${item.data.intakeAmt}ml (${item.data.intakeType}) Out: ${item.data.outputAmt}ml — ${item.data.recordedBy}`;
    if (item.type==='glucose')return `Glucose ${item.data.reading} mmol/L (${item.data.context}) — ${item.data.recordedBy}`;
    if (item.type==='upload') return `File uploaded: ${item.data.fileName} (${item.data.category}) — ${item.data.uploadedBy}`;
    return '';
  };

  const tlTitle = { note:'Clinical note', vitals:'Vitals recorded', rx:'Prescription issued',
    fluid:'Fluid chart entry', glucose:'Glucose reading', upload:'File uploaded' };

  // Latest vitals
  const latestVitals = vitals[0];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Profile header */}
      <div className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div style={{ flex:1 }}>
          <div className="profile-name">{patient.surname} {patient.firstName} {patient.otherNames}</div>
          <div className="profile-emr">{patient.emrNumber} · {patient.folderNumber}</div>
          <div className="profile-badges">
            <span className={`badge ${statusCls(patient.status)}`}>{patient.status}</span>
            <span className="badge badge-info">{patient.classSet}</span>
            <span className="badge badge-neutral">
              {patient.sex} · DOB: {patient.dob}
            </span>
            {patient.allergies
              ? <span className="badge badge-danger">⚠ {patient.allergies}</span>
              : <span className="badge badge-ok">No known allergies</span>}
          </div>
        </div>
        <button className="btn" onClick={() => navigate(-1)}
          style={{ background:'rgba(255,255,255,.1)', borderColor:'rgba(255,255,255,.2)', color:'#D6E8F8' }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
      </div>

      {/* Action buttons bar */}
      <div className="action-bar">
        {[
          { tab:'vitals',  icon:'ti-heart-rate-monitor', label:'Add Vitals' },
          canPrescribe && { tab:'rx', icon:'ti-pill', label:'Prescription' },
          { tab:'fluid',   icon:'ti-droplet',            label:'Fluid Chart' },
          { tab:'glucose', icon:'ti-activity',           label:'Glucose' },
          (isNurse||isDoctor) && { tab:'nursing', icon:'ti-notes-medical', label:'Nursing Note' },
          isDoctor && { tab:'doctor', icon:'ti-stethoscope', label:'Doctor\'s Note' },
          { tab:'uploads', icon:'ti-upload',             label:'Upload Result' },
          (isDoctor||isNurse) && { tab:'referral', icon:'ti-file-export', label:'Refer / Discharge' },
        ].filter(Boolean).map(btn => (
          <button key={btn.tab} className="action-btn" onClick={() => setActiveTab(btn.tab)}>
            <i className={`ti ${btn.icon}`} aria-hidden="true" />
            {btn.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="profile-tabs">
        {TABS.map(t => (
          <div key={t.id} className={`profile-tab ${activeTab===t.id?'active':''}`}
            onClick={() => setActiveTab(t.id)} role="tab" tabIndex={0}
            onKeyDown={e => e.key==='Enter' && setActiveTab(t.id)}>
            {t.label}
          </div>
        ))}
        <div className={`profile-tab ${activeTab==='referral'?'active':''}`}
          onClick={() => setActiveTab('referral')} role="tab">
          Refer / Discharge
        </div>
      </div>

      {/* Tab content */}
      <div className="page-content" style={{ flex:1, overflow:'auto' }}>

        {/* ── VISIT TAB (overview + timeline) */}
        {activeTab==='visit' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Bio grid */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-user" />Patient Profile</div>
              </div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:10 }}>
                  {[
                    ['Full Name',      `${patient.surname} ${patient.firstName} ${patient.otherNames||''}`],
                    ['Date of Birth',  patient.dob],
                    ['Sex',            patient.sex],
                    ['Matric No.',     patient.matricNo],
                    ['Class / SET',    patient.classSet],
                    ['HMO / NHIS',     patient.hmo || '—'],
                    ['Home Address',   patient.homeAddress],
                    ['Next of Kin',    `${patient.nextOfKin} · ${patient.nextOfKinTel}`],
                    ['Allergies',      patient.allergies || 'None known'],
                  ].map(([lbl,val]) => (
                    <div key={lbl}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>{lbl}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)' }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Latest vitals snapshot */}
            {latestVitals && (
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-heart-rate-monitor" />Latest Vitals — {formatTime(latestVitals.recordedAt)}</div>
                  <span className="card-action" onClick={() => setActiveTab('vitals')}>Add new →</span>
                </div>
                <div className="card-body">
                  <div className="vitals-grid">
                    {[
                      { label:'BP', value:`${latestVitals.sbp}/${latestVitals.dbp}`, unit:'mmHg', key:'sbp' },
                      { label:'HR', value:latestVitals.hr,  unit:'bpm',  key:'hr'   },
                      { label:'Temp', value:latestVitals.temp, unit:'°C', key:'temp' },
                      { label:'RR',  value:latestVitals.rr,  unit:'/min', key:'rr'  },
                      { label:'SpO₂',value:latestVitals.spo2, unit:'%',  key:'spo2' },
                    ].map(v => (
                      <div key={v.label} className="vital-box">
                        <div className="vital-label">{v.label}</div>
                        <div className={`vital-value ${vitalStatus(v.key, v.value)}`}>{v.value}</div>
                        <div className="vital-unit">{v.unit}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-activity" />Visit Timeline — All Events</div>
                <span className="card-action">{timeline.length} events</span>
              </div>
              <div className="timeline">
                {timeline.length === 0 && (
                  <div style={{ padding:20, textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:13 }}>
                    No events yet — start by recording vitals or adding a note.
                  </div>
                )}
                {timeline.map((item, i) => (
                  <div key={i} className="tl-item">
                    <div className="tl-dot" style={{ background: tlDotColor[item.type] }} />
                    <div className="tl-body">
                      <div className="tl-title">{tlTitle[item.type]}</div>
                      <div className="tl-sub">{tlDescription(item)}</div>
                    </div>
                    <div className="tl-time">{formatTime(item.ts)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── VITALS TAB */}
        {activeTab==='vitals' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-heart-rate-monitor" />Record Vitals</div>
              </div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:12 }}>
                  {[
                    { id:'sbp',  label:'Systolic BP (mmHg)',  ph:'e.g. 120' },
                    { id:'dbp',  label:'Diastolic BP (mmHg)', ph:'e.g. 80'  },
                    { id:'hr',   label:'Heart rate (bpm)',     ph:'e.g. 72'  },
                    { id:'temp', label:'Temperature (°C)',     ph:'e.g. 36.5'},
                    { id:'rr',   label:'Resp. rate (/min)',    ph:'e.g. 18'  },
                    { id:'spo2', label:'SpO₂ (%)',             ph:'e.g. 99'  },
                  ].map(f => (
                    <div key={f.id} className="form-group">
                      <label className="form-label">{f.label}</label>
                      <input className="form-input" placeholder={f.ph}
                        value={vitalForm[f.id]}
                        onChange={e => setVitalForm(v => ({ ...v, [f.id]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group form-span-3">
                    <label className="form-label">Additional observations</label>
                    <textarea className="form-textarea" rows={2} placeholder="e.g. Patient appears pale, diaphoretic…"
                      value={vitalForm.notes||''}
                      onChange={e => setVitalForm(v => ({ ...v, notes: e.target.value }))} />
                  </div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveVitals} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save vitals to timeline
                </button>
              </div>
            </div>

            {/* History */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-history" />Vitals History</div>
              </div>
              <table className="data-table">
                <thead><tr>
                  <th>Time</th><th>BP</th><th>HR</th><th>Temp</th><th>RR</th><th>SpO₂</th><th>By</th>
                </tr></thead>
                <tbody>
                  {vitals.map(v => (
                    <tr key={v.id}>
                      <td>{formatTime(v.recordedAt)}</td>
                      <td className={vitalStatus('sbp',v.sbp)}>{v.sbp}/{v.dbp}</td>
                      <td>{v.hr}</td>
                      <td className={vitalStatus('temp',v.temp)}>{v.temp}°C</td>
                      <td>{v.rr}</td>
                      <td className={vitalStatus('spo2',v.spo2)}>{v.spo2}%</td>
                      <td className="text-muted text-sm">{v.recordedBy}</td>
                    </tr>
                  ))}
                  {vitals.length===0 && <tr><td colSpan={7} style={{textAlign:'center',color:'var(--t3)'}}>No vitals recorded yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PRESCRIPTION TAB */}
        {activeTab==='rx' && canPrescribe && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {isNurse && (
              <div className="alert alert-warn">
                <i className="ti ti-alert-triangle" />
                Nurse prescription — only when no doctor is on duty. Requires countersignature.
              </div>
            )}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-pill" />Write Prescription — Rx</div>
                <button className="btn btn-sm" onClick={() => setRxForm(r => [...r, {drug:'',dose:'',frequency:'',duration:''}])}>
                  <i className="ti ti-plus" /> Add drug
                </button>
              </div>
              <div className="card-body">
                {rxForm.map((row, i) => (
                  <div key={i} className="form-grid-3" style={{ gap:8, marginBottom:10, paddingBottom:10, borderBottom:'1px solid var(--border)' }}>
                    <div className="form-group form-span-2">
                      <label className="form-label">Drug name <span className="req">*</span></label>
                      <input className="form-input" placeholder="e.g. Artemether 160mg"
                        value={row.drug} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,drug:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Dose</label>
                      <input className="form-input" placeholder="e.g. 160mg"
                        value={row.dose} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,dose:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Frequency</label>
                      <input className="form-input" placeholder="e.g. OD, BD, TDS"
                        value={row.frequency} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,frequency:e.target.value}:x))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Duration</label>
                      <input className="form-input" placeholder="e.g. × 3/7"
                        value={row.duration} onChange={e => setRxForm(r => r.map((x,j)=>j===i?{...x,duration:e.target.value}:x))} />
                    </div>
                    <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                      {rxForm.length > 1 && (
                        <button className="btn btn-danger btn-sm" onClick={() => setRxForm(r => r.filter((_,j)=>j!==i))}>
                          <i className="ti ti-trash" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button className="btn btn-primary" onClick={saveRx} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save prescription
                </button>
              </div>
            </div>

            {/* Prescription history */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-history" />Prescription History</div>
              </div>
              {rx.map(r => (
                <div key={r.id}>
                  <div style={{ padding:'6px 16px', background:'var(--card-bg2)', borderBottom:'1px solid var(--border)',
                    fontSize:10, fontWeight:700, color:'var(--t3)', display:'flex', gap:8, alignItems:'center' }}>
                    <span>{formatTime(r.createdAt)} — {r.prescribedBy}</span>
                    {r.requiresCountersign && <span className="badge badge-warn">Needs countersign</span>}
                    {r.countersigned && <span className="badge badge-ok">Countersigned</span>}
                  </div>
                  {r.drugs?.map((d,i) => (
                    <div key={i} className="rx-row">
                      <div className="rx-drug">{d.drug} {d.dose}</div>
                      <div className="rx-dose">{d.frequency} {d.duration}</div>
                    </div>
                  ))}
                </div>
              ))}
              {rx.length===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No prescriptions yet</div>}
            </div>
          </div>
        )}

        {/* ── FLUID CHART TAB */}
        {activeTab==='fluid' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-droplet" />Add Fluid Entry</div></div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:10 }}>
                  <div className="form-group">
                    <label className="form-label">Time <span className="req">*</span></label>
                    <input type="time" className="form-input" value={fluidForm.time}
                      onChange={e=>setFluidForm(f=>({...f,time:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Intake amount (ml)</label>
                    <input className="form-input" placeholder="e.g. 500" value={fluidForm.intakeAmt}
                      onChange={e=>setFluidForm(f=>({...f,intakeAmt:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Intake type</label>
                    <select className="form-select" value={fluidForm.intakeType}
                      onChange={e=>setFluidForm(f=>({...f,intakeType:e.target.value}))}>
                      <option value="">Select…</option>
                      <option>Oral</option>
                      <option>IV Normal Saline</option>
                      <option>IV Ringers Lactate</option>
                      <option>IV Dextrose 5%</option>
                      <option>IV Dextrose Saline</option>
                      <option>Blood transfusion</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Output amount (ml)</label>
                    <input className="form-input" placeholder="e.g. 300" value={fluidForm.outputAmt}
                      onChange={e=>setFluidForm(f=>({...f,outputAmt:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Output type</label>
                    <select className="form-select" value={fluidForm.outputType}
                      onChange={e=>setFluidForm(f=>({...f,outputType:e.target.value}))}>
                      <option value="">Select…</option>
                      <option>Urine</option>
                      <option>Vomitus</option>
                      <option>Drainage</option>
                      <option>Stool</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveFluid} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save fluid entry
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-table" />Fluid Chart</div></div>
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
                  {fluid.length===0&&<tr><td colSpan={6} style={{textAlign:'center',color:'var(--t3)'}}>No fluid entries yet</td></tr>}
                </tbody>
              </table>
              {fluid.length>0 && (
                <div style={{padding:'8px 16px',fontSize:12,fontWeight:700,borderTop:'1px solid var(--border)'}}>
                  Total in: <span style={{color:'var(--info)'}}>
                    {fluid.reduce((a,f)=>a+(parseInt(f.intakeAmt)||0),0)}ml
                  </span> · Total out: <span style={{color:'var(--warn)'}}>
                    {fluid.reduce((a,f)=>a+(parseInt(f.outputAmt)||0),0)}ml
                  </span> · Balance: <span style={{color:'var(--success)'}}>
                    +{fluid.reduce((a,f)=>a+(parseInt(f.intakeAmt)||0)-(parseInt(f.outputAmt)||0),0)}ml
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── GLUCOSE TAB */}
        {activeTab==='glucose' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-activity" />Add Glucose Reading</div></div>
              <div className="card-body">
                <div className="form-grid-3" style={{ gap:10 }}>
                  <div className="form-group">
                    <label className="form-label">Time</label>
                    <input type="time" className="form-input" value={glucForm.time}
                      onChange={e=>setGlucForm(g=>({...g,time:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Blood glucose (mmol/L) <span className="req">*</span></label>
                    <input className="form-input" placeholder="e.g. 5.4" value={glucForm.reading}
                      onChange={e=>setGlucForm(g=>({...g,reading:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Context</label>
                    <select className="form-select" value={glucForm.context}
                      onChange={e=>setGlucForm(g=>({...g,context:e.target.value}))}>
                      <option value="">Select…</option>
                      <option>Fasting</option>
                      <option>Pre-meal</option>
                      <option>Post-meal (2hr)</option>
                      <option>Random</option>
                      <option>Bedtime</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary mt-3" onClick={saveGlucose} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save glucose reading
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-table" />Glucose Chart</div></div>
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
                  {glucose.length===0&&<tr><td colSpan={5} style={{textAlign:'center',color:'var(--t3)'}}>No glucose readings yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── NURSING / DOCTOR NOTES TAB */}
        {(activeTab==='nursing' || activeTab==='doctor') && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <i className={`ti ${activeTab==='doctor'?'ti-stethoscope':'ti-notes-medical'}`} />
                  {activeTab==='doctor' ? "Doctor's Consultation Note" : "Nursing Note"}
                </div>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">
                    {activeTab==='doctor'
                      ? 'C/O · O/E · Diagnosis · Plan'
                      : 'Nursing observation / intervention'}
                  </label>
                  <textarea className="form-textarea full-width" rows={5}
                    placeholder={activeTab==='doctor'
                      ? 'C/O: headache × 2 days…\nO/E: Temp 38.5°C, BP 110/70…\nDx: ? Malaria with PUD\nPlan: IM Artemether 160mg OD × 3/7…'
                      : 'Patient assessment, interventions performed, patient response…'}
                    value={noteText} onChange={e=>setNoteText(e.target.value)} />
                </div>
                <button className="btn btn-primary mt-3" onClick={saveNote} disabled={saving}>
                  <i className="ti ti-device-floppy" /> Save note to timeline
                </button>
              </div>
            </div>

            {/* All notes (both doctor + nurse) */}
            <div className="card">
              <div className="card-header">
                <div className="card-title"><i className="ti ti-history" />All Notes — Doctor & Nurse Combined</div>
              </div>
              {notes.map(n => (
                <div key={n.id} className="note-block">
                  <div className="note-header">
                    <div className="note-avatar"
                      style={{ background: n.authorRole==='doctor'?'var(--success-bg)':'var(--info-bg)',
                        color: n.authorRole==='doctor'?'var(--success)':'var(--info)' }}>
                      {(n.authorName||'').slice(0,2).toUpperCase()}
                    </div>
                    <div className="note-author">{n.authorName}</div>
                    <span className={`badge ${n.authorRole==='doctor'?'badge-ok':'badge-info'}`} style={{fontSize:9}}>
                      {n.authorRole==='doctor'?"Doctor's note":"Nursing note"}
                    </span>
                    <div className="note-time">{formatTime(n.createdAt)}</div>
                  </div>
                  <div className="note-text">{n.text}</div>
                </div>
              ))}
              {notes.length===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No notes yet</div>}
            </div>
          </div>
        )}

        {/* ── UPLOADS TAB */}
        {(activeTab==='uploads' || activeTab==='labs') && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-upload" />Upload Lab Result / Scan / Report</div></div>
              <div className="card-body">
                <div className="upload-zone" onClick={() => fileInput.current?.click()}>
                  <i className="ti ti-cloud-upload" aria-hidden="true" />
                  <p>Tap to upload PDF, image, or scan result</p>
                  <p style={{fontSize:10,marginTop:4,color:'var(--t3)'}}>PNG, JPG, PDF · Max 10MB · Appears on patient timeline</p>
                </div>
                <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg"
                  style={{display:'none'}} onChange={handleUpload} />
                {saving && <div className="alert alert-info mt-3"><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Uploading…</div>}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-files" />Uploaded Files</div></div>
              {uploads.map(u => (
                <div key={u.id} className="upload-file-row" style={{borderBottom:'1px solid var(--border)'}}>
                  <i className={`ti ${u.fileType?.includes('pdf')?'ti-file-text':'ti-photo'}`}
                    style={{fontSize:20,color:'var(--accent)'}} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--t1)'}}>{u.fileName}</div>
                    <div style={{fontSize:10,color:'var(--t3)',fontWeight:500}}>
                      {formatTs(u.uploadedAt)} · {u.uploadedBy}
                    </div>
                  </div>
                  <span className="badge badge-info">{u.category}</span>
                  <a href={u.downloadUrl} target="_blank" rel="noreferrer"
                    className="btn btn-sm"><i className="ti ti-external-link" /> View</a>
                </div>
              ))}
              {uploads.length===0 && <div style={{padding:16,textAlign:'center',color:'var(--t3)',fontWeight:700}}>No files uploaded yet</div>}
            </div>
          </div>
        )}

        {/* ── REFERRAL / DISCHARGE TAB */}
        {activeTab==='referral' && (isDoctor||isNurse) && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div className="card">
              <div className="card-header"><div className="card-title"><i className="ti ti-file-export" />Referral Letter</div></div>
              <div className="card-body">
                <div className="form-grid-2" style={{ gap:12 }}>
                  <div className="form-group">
                    <label className="form-label">Referring to (hospital / facility) <span className="req">*</span></label>
                    <input className="form-input" placeholder="e.g. Lagos University Teaching Hospital"
                      value={refForm.to} onChange={e=>setRefForm(r=>({...r,to:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Purpose</label>
                    <input className="form-input" placeholder="e.g. Further management, specialist review"
                      value={refForm.purpose} onChange={e=>setRefForm(r=>({...r,purpose:e.target.value}))} />
                  </div>
                  <div className="form-group form-span-2">
                    <label className="form-label">MOS diagnosis / clinical notes for receiving facility</label>
                    <textarea className="form-textarea full-width" rows={4}
                      placeholder="Patient presents with… Dx: … Treatment given: … Please see and manage accordingly."
                      value={refForm.clinicalNotes} onChange={e=>setRefForm(r=>({...r,clinicalNotes:e.target.value}))} />
                  </div>
                </div>
                <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
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
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
