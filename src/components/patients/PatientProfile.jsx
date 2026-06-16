// src/components/patients/PatientProfile.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  getPatient, listenNotes, listenVitals, listenPrescriptions,
  listenFluidChart, listenGlucoseChart, listenUploads,
  addNote, addVitals, addPrescription, addFluidEntry,
  addGlucoseReading, uploadPatientFile, createReferral,
  dischargePatient, emrToFolderNumber, formatDateTime,
  ROLES,
  requestLabTest, listenPatientLabRequests, listenPatientLabResults,
  LAB_TESTS,
} from '../../lib/emr';
import toast from 'react-hot-toast';

// ── TABS ─────────────────────────────────────
const TABS = [
  { id:'visit',        label:'Visit',          icon:'ti-clipboard-list' },
  { id:'vitals',       label:'Vitals',         icon:'ti-heart-rate-monitor' },
  { id:'prescription', label:'Prescription',   icon:'ti-pill' },
  { id:'fluid',        label:'Fluid Chart',    icon:'ti-droplet' },
  { id:'glucose',      label:'Glucose',        icon:'ti-activity' },
  { id:'nursing',      label:'Nursing',        icon:'ti-notes-medical' },
  { id:'doctor',       label:"Doctor's Report",icon:'ti-stethoscope' },
  { id:'labs',         label:'Labs',           icon:'ti-microscope' },
  { id:'uploads',      label:'Uploads',        icon:'ti-upload' },
  { id:'referral',     label:'Refer/Discharge',icon:'ti-file-export' },
];

// Avatar colour palette
const COLORS = [
  { bg:'#B5D4F4',tc:'#0C447C' },{ bg:'#9FE1CB',tc:'#085041' },
  { bg:'#FAEEDA',tc:'#633806' },{ bg:'#F7C1C1',tc:'#791F1F' },
  { bg:'#CECBF6',tc:'#3C3489' },{ bg:'#C0DD97',tc:'#27500A' },
];
const colorFor = (emr) => COLORS[(emr?.charCodeAt(emr.length-1) || 0) % COLORS.length];

const initials = (s='', f='') =>
  `${(s[0]||'').toUpperCase()}${(f[0]||'').toUpperCase()}`;

export default function PatientProfile({ backPath }) {
  const { emr }           = useParams();
  const { profile, role } = useAuth();
  const navigate          = useNavigate();

  const [patient,   setPatient]   = useState(null);
  const [notes,     setNotes]     = useState([]);
  const [vitals,    setVitals]    = useState([]);
  const [rxList,    setRxList]    = useState([]);
  const [fluids,    setFluids]    = useState([]);
  const [glucoses,  setGlucoses]  = useState([]);
  const [uploads,     setUploads]     = useState([]);
  const [labRequests, setLabRequests] = useState([]);
  const [labResults,  setLabResults]  = useState([]);
  const [activeTab,   setActiveTab]   = useState('visit');
  const [loading,     setLoading]     = useState(true);
  const fileInputRef = useRef(null);

  // Load patient once
  useEffect(() => {
    if (!emr) return;
    getPatient(emr).then(p => { setPatient(p); setLoading(false); });
  }, [emr]);

  // Real-time listeners
  useEffect(() => {
    if (!emr) return;
    const unsubs = [
      listenNotes(emr,                 setNotes),
      listenVitals(emr,                setVitals),
      listenPrescriptions(emr,         setRxList),
      listenFluidChart(emr,            setFluids),
      listenGlucoseChart(emr,          setGlucoses),
      listenUploads(emr,               setUploads),
      listenPatientLabRequests(emr,    setLabRequests),
      listenPatientLabResults(emr,     setLabResults),
    ];
    return () => unsubs.forEach(u => u());
  }, [emr]);

  // ── Build unified visit timeline ─────────────
  const timeline = [
    ...notes.map(n => ({
      type: n.authorRole === 'doctor' ? 'doctor_note' : 'nurse_note',
      text: n.text, by: n.authorName, at: n.createdAt, color: n.authorRole === 'doctor' ? '#2E7FDB' : '#9A6000',
    })),
    ...vitals.map(v => ({
      type: 'vitals', color: '#1A7A4A',
      text: `BP ${v.bp} · HR ${v.hr}bpm · Temp ${v.temp}°C · RR ${v.rr}/min · SpO₂ ${v.spo2}%`,
      by: v.recordedBy, at: v.recordedAt,
    })),
    ...rxList.map(r => ({
      type: 'prescription', color: '#1855A3',
      text: `Prescribed ${r.drugs?.length || 0} drug(s)${r.requiresCountersign ? ' — ⚠ Nurse Rx, countersign needed' : ''}`,
      by: r.prescribedBy, at: r.createdAt,
    })),
    ...fluids.map(f => ({
      type: 'fluid', color: '#085041',
      text: `Fluid — In: ${f.intake} · Out: ${f.output}`,
      by: f.recordedBy, at: f.recordedAt,
    })),
    ...glucoses.map(g => ({
      type: 'glucose', color: g.status === 'High' ? '#B82020' : '#1A7A4A',
      text: `BG ${g.reading} mmol/L — ${g.status}`,
      by: g.recordedBy, at: g.recordedAt,
    })),
    ...uploads.map(u => ({
      type: 'upload', color: '#534AB7',
      text: `File uploaded: ${u.fileName} (${u.category})`,
      by: u.uploadedBy, at: u.uploadedAt,
    })),
    ...labRequests.map(lr => ({
      type: 'lab_request', color: '#0E7490',
      text: `Lab ordered: ${(lr.tests||[]).join(', ')} [${lr.urgency?.toUpperCase()}]${lr.status === 'completed' ? ' ✓ Results available' : ' — ' + lr.status}`,
      by: lr.requestedBy, at: lr.requestedAt,
    })),
  ].sort((a, b) => {
    const ta = a.at?.seconds || 0;
    const tb = b.at?.seconds || 0;
    return tb - ta;
  });

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      height:200, gap:8, color:'var(--t3)', fontWeight:700 }}>
      <i className="ti ti-loader-2" style={{ fontSize:22, animation:'spin 1s linear infinite' }} />
      Loading patient…
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (!patient) return (
    <div style={{ padding:30, textAlign:'center' }}>
      <i className="ti ti-user-off" style={{ fontSize:36, color:'var(--t3)', display:'block', marginBottom:8 }} />
      <div style={{ fontWeight:700, color:'var(--t1)' }}>Patient not found</div>
      <div style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>EMR: {emr}</div>
      <button className="btn btn-primary mt-3" onClick={() => navigate(backPath || -1)}>← Back</button>
    </div>
  );

  const col = colorFor(emr);
  const init = initials(patient.surname, patient.firstName);
  const canPrescribe = role === ROLES.DOCTOR || role === ROLES.NURSE;
  const canAddNote   = role === ROLES.DOCTOR || role === ROLES.NURSE;
  const canOrderLab  = role === ROLES.DOCTOR || role === ROLES.NURSE;

  return (
    <div className="profile-wrapper">
      <div className="profile-scroll-body">

      {/* ── PROFILE HEADER ── */}
      <div className="profile-header">
        <div className="profile-avatar" style={{ background: col.bg, color: col.tc, border:'2px solid rgba(255,255,255,.15)' }}>
          {init}
        </div>
        <div style={{ flex:1 }}>
          <div className="profile-name">{patient.surname} {patient.firstName} {patient.otherNames}</div>
          <div className="profile-emr">{patient.emrNumber} · {patient.folderNumber}</div>
          <div className="profile-badges">
            <span className={`badge ${patient.status === 'active' ? 'badge-danger' : patient.status === 'discharged' ? 'badge-ok' : 'badge-warn'}`}
              style={{ textTransform:'capitalize' }}>
              {patient.status}
            </span>
            <span className="badge badge-info">{patient.classSet}</span>
            {patient.knownAllergies
              ? <span className="badge badge-danger">⚠ Allergy: {patient.knownAllergies}</span>
              : <span className="badge badge-ok">No known allergies</span>
            }
          </div>
        </div>
        <button className="btn" onClick={() => navigate(backPath || -1)}
          style={{ background:'rgba(255,255,255,.1)', borderColor:'rgba(255,255,255,.2)', color:'#D6E8F8' }}>
          <i className="ti ti-arrow-left" /> Back
        </button>
      </div>

      {/* ── ACTION BUTTONS BAR ── */}
      <div className="action-bar">
        <button className="action-btn" onClick={() => setActiveTab('vitals')}>
          <i className="ti ti-heart-rate-monitor" /> Add Vitals
        </button>
        {canPrescribe && (
          <button className="action-btn" onClick={() => setActiveTab('prescription')}>
            <i className="ti ti-pill" /> Prescription
          </button>
        )}
        <button className="action-btn" onClick={() => setActiveTab('fluid')}>
          <i className="ti ti-droplet" /> Fluid Chart
        </button>
        <button className="action-btn" onClick={() => setActiveTab('glucose')}>
          <i className="ti ti-activity" /> Glucose Chart
        </button>
        {canAddNote && role === ROLES.NURSE && (
          <button className="action-btn" onClick={() => setActiveTab('nursing')}>
            <i className="ti ti-notes-medical" /> Nursing Note
          </button>
        )}
        {role === ROLES.DOCTOR && (
          <button className="action-btn" onClick={() => setActiveTab('doctor')}>
            <i className="ti ti-stethoscope" /> Doctor Note
          </button>
        )}
        <button className="action-btn" onClick={() => setActiveTab('uploads')}>
          <i className="ti ti-upload" /> Upload Result
        </button>
        {canOrderLab && (
          <button className="action-btn" onClick={() => setActiveTab('labs')}
            style={{ background:'rgba(14,116,144,.15)', borderColor:'rgba(14,116,144,.35)', color:'#0E7490' }}>
            <i className="ti ti-microscope" /> Order Lab
          </button>
        )}
        <button className="action-btn" onClick={() => setActiveTab('referral')}>
          <i className="ti ti-file-export" /> Refer / Discharge
        </button>
      </div>

      {/* ── TABS ── */}
      <div className="profile-tabs">
        {TABS.map(t => (
          <div
            key={t.id}
            className={`profile-tab${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <i className={`ti ${t.icon}`} style={{ marginRight:4 }} aria-hidden="true" />
            {t.label}
          </div>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      <div className="profile-tab-content">

        {/* VISIT — bio + latest vitals + timeline */}
        {activeTab === 'visit' && (
          <>
            <BioCard patient={patient} />
            {vitals.length > 0 && <LatestVitals vitals={vitals[0]} />}
            <TimelineCard timeline={timeline} />
          </>
        )}

        {/* VITALS */}
        {activeTab === 'vitals' && (
          <>
            {vitals.length > 0 && <LatestVitals vitals={vitals[0]} />}
            <VitalsForm emr={emr} profile={profile} onSaved={() => toast.success('Vitals saved to timeline')} />
            <VitalsHistory vitals={vitals} />
          </>
        )}

        {/* PRESCRIPTION */}
        {activeTab === 'prescription' && (
          <>
            {role === ROLES.NURSE && (
              <div className="alert alert-warn">
                <i className="ti ti-alert-triangle" />
                <div>You are prescribing as a nurse. This will be flagged for doctor countersign.</div>
              </div>
            )}
            <RxForm emr={emr} profile={profile} role={role}
              onSaved={() => toast.success('Prescription saved')} />
            <RxHistory rxList={rxList} patient={patient} />
          </>
        )}

        {/* FLUID CHART */}
        {activeTab === 'fluid' && (
          <>
            <FluidForm emr={emr} profile={profile} onSaved={() => toast.success('Fluid entry saved')} />
            <FluidHistory fluids={fluids} />
          </>
        )}

        {/* GLUCOSE CHART */}
        {activeTab === 'glucose' && (
          <>
            <GlucoseForm emr={emr} profile={profile} onSaved={() => toast.success('Glucose reading saved')} />
            <GlucoseHistory glucoses={glucoses} />
          </>
        )}

        {/* NURSING NOTES */}
        {activeTab === 'nursing' && (
          <>
            <NoteForm emr={emr} profile={profile} role={role} noteRole="nurse"
              onSaved={() => toast.success('Nursing note saved')} />
            <NotesHistory notes={notes} filterRole="nurse" />
          </>
        )}

        {/* DOCTOR REPORT */}
        {activeTab === 'doctor' && (
          <>
            {role === ROLES.DOCTOR && (
              <NoteForm emr={emr} profile={profile} role={role} noteRole="doctor"
                onSaved={() => toast.success("Doctor's note saved")} />
            )}
            <NotesHistory notes={notes} filterRole="doctor" />
          </>
        )}

        {/* LABS — order + results */}
        {activeTab === 'labs' && (
          <>
            {canOrderLab && (
              <LabRequestForm
                emr={emr}
                profile={profile}
                onSaved={() => toast.success('Lab request sent to lab')}
              />
            )}
            <LabResultsHistory labResults={labResults} labRequests={labRequests} />
          </>
        )}

        {/* UPLOADS */}
        {activeTab === 'uploads' && (
          <UploadsCard
            uploads={uploads}
            fileInputRef={fileInputRef}
            emr={emr}
            profile={profile}
            onSaved={() => toast.success('File uploaded and added to timeline')}
          />
        )}

        {/* REFER / DISCHARGE */}
        {activeTab === 'referral' && (
          <ReferDischargeForm
            emr={emr}
            profile={profile}
            onSaved={() => { toast.success('Done'); navigate(backPath || -1); }}
          />
        )}
      </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════
   SUB-COMPONENTS
═══════════════════════════════════ */

function BioCard({ patient }) {
  const fields = [
    ['Full name',        `${patient.surname} ${patient.firstName} ${patient.otherNames || ''}`],
    ['Patient identity', patient.patientIdentity || patient.patientType || '—'],
    ['Date of birth',    patient.dob],
    ['Sex',              patient.sex],
    ['Marital status',   patient.maritalStatus],
    ['Class / Set',      patient.classSet],
    ['Matric no.',       patient.matricNo],
    ['HMO / NHIS',       patient.hmo],
    ['Tribe',            patient.tribe],
    ['Religion',         patient.religion],
    ['Home address',     patient.homeAddress],
    ['Next of kin / Tel',patient.nextOfKin],
    ['Phone',            patient.phone],
    ['Email',            patient.email],
    ['Registered by',    patient.registeredBy],
  ];
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-user" />Patient Details</div>
      </div>
      <div className="card-body">
        <div className="form-grid-3" style={{ gap:10 }}>
          {fields.filter(([,v]) => v).map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize:9, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:2 }}>
                {label}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>{val}</div>
            </div>
          ))}
        </div>
        {patient.knownAllergies && (
          <div className="alert alert-danger mt-3">
            <i className="ti ti-alert-triangle" />
            <div>Known allergies: <strong>{patient.knownAllergies}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}

function LatestVitals({ vitals }) {
  const flags = {
    bp:   (v) => { const [s] = (v||'').split('/'); return +s > 140 ? 'vital-high' : +s < 90 ? 'vital-low' : 'vital-ok'; },
    temp: (v) => +v > 37.5 ? 'vital-high' : +v < 36 ? 'vital-low' : 'vital-ok',
    spo2: (v) => +v < 95 ? 'vital-low' : 'vital-ok',
    hr:   (v) => +v > 100 ? 'vital-high' : +v < 60 ? 'vital-low' : 'vital-ok',
    rr:   (v) => +v > 20 ? 'vital-high' : +v < 12 ? 'vital-low' : 'vital-ok',
  };
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-heart-rate-monitor" />Latest Vitals</div>
        <span style={{ fontSize:10, color:'var(--t3)', fontWeight:500 }}>
          {formatDateTime(vitals.recordedAt)} · {vitals.recordedBy}
        </span>
      </div>
      <div className="card-body">
        <div className="vitals-grid">
          {[
            { label:'BP', value: vitals.bp, unit:'mmHg', flag: flags.bp(vitals.bp) },
            { label:'HR', value: vitals.hr, unit:'bpm',  flag: flags.hr(vitals.hr) },
            { label:'Temp', value: vitals.temp, unit:'°C', flag: flags.temp(vitals.temp) },
            { label:'RR',  value: vitals.rr,   unit:'/min', flag: flags.rr(vitals.rr) },
            { label:'SpO₂',value: vitals.spo2, unit:'%', flag: flags.spo2(vitals.spo2) },
          ].map(v => (
            <div className="vital-box" key={v.label}>
              <div className="vital-label">{v.label}</div>
              <div className={`vital-value ${v.flag}`}>{v.value}</div>
              <div className="vital-unit">{v.unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineCard({ timeline }) {
  const icons = {
    vitals:      { icon:'ti-heart-rate-monitor', color:'#1A7A4A' },
    doctor_note: { icon:'ti-stethoscope',         color:'#2E7FDB' },
    nurse_note:  { icon:'ti-notes-medical',       color:'#9A6000' },
    prescription:{ icon:'ti-pill',                color:'#1855A3' },
    fluid:       { icon:'ti-droplet',             color:'#085041' },
    glucose:     { icon:'ti-activity',            color:'#B82020' },
    upload:      { icon:'ti-upload',              color:'#534AB7' },
    lab_request: { icon:'ti-microscope',           color:'#0E7490' },
  };
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-activity" />Visit Timeline — All Events</div>
      </div>
      {timeline.length === 0
        ? <div style={{ padding:20, textAlign:'center', fontSize:12, fontWeight:700, color:'var(--t3)' }}>
            No events recorded yet
          </div>
        : <div className="timeline">
            {timeline.map((item, i) => {
              const ic = icons[item.type] || { icon:'ti-circle', color:'var(--t3)' };
              return (
                <div className="tl-item" key={i}>
                  <div className="tl-dot" style={{ background: ic.color }} />
                  <div className="tl-body">
                    <div className="tl-title" style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <i className={`ti ${ic.icon}`} style={{ color: ic.color, fontSize:14 }} />
                      {item.type.replace('_', ' ').replace(/\b\w/g,c=>c.toUpperCase())}
                    </div>
                    <div className="tl-sub">{item.text}</div>
                    <div style={{ fontSize:10, color:'var(--t3)', fontWeight:500, marginTop:2 }}>by {item.by}</div>
                  </div>
                  <div className="tl-time">{formatDateTime(item.at)}</div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

function VitalsForm({ emr, profile, onSaved }) {
  const [form, setForm] = useState({ bp:'', hr:'', temp:'', rr:'', spo2:'', weight:'', notes:'' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.bp || !form.hr || !form.temp) { toast.error('BP, HR and Temp are required'); return; }
    setSaving(true);
    try {
      await addVitals(emr, null, form, profile?.displayName);
      setForm({ bp:'', hr:'', temp:'', rr:'', spo2:'', weight:'', notes:'' });
      onSaved?.();
    } catch(e) { toast.error('Failed to save vitals'); }
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-heart-rate-monitor" />Record New Vitals</div></div>
      <div className="card-body">
        <div className="form-grid-3">
          {[['bp','Blood Pressure (mmHg)','e.g. 120/80',true],['hr','Heart Rate (bpm)','e.g. 72',true],
            ['temp','Temperature (°C)','e.g. 36.5',true],['rr','Resp. Rate (/min)','e.g. 18'],
            ['spo2','SpO₂ (%)','e.g. 99'],['weight','Weight (kg)','e.g. 65']
          ].map(([k, lbl, ph, req]) => (
            <div className="form-group" key={k}>
              <label className="form-label">{lbl}{req && <span className="req">*</span>}</label>
              <input className="form-input" placeholder={ph} value={form[k]} onChange={e=>set(k,e.target.value)} />
            </div>
          ))}
          <div className="form-group form-span-3">
            <label className="form-label">Observations / notes</label>
            <textarea className="form-textarea" rows={2} placeholder="Any clinical observations…"
              value={form.notes} onChange={e=>set('notes',e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary mt-3" onClick={save} disabled={saving}>
          {saving ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Saving…</> : <><i className="ti ti-device-floppy" /> Save to Timeline</>}
        </button>
      </div>
    </div>
  );
}

function VitalsHistory({ vitals }) {
  if (!vitals.length) return null;
  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-history" />Vitals History</div></div>
      <table className="data-table">
        <thead><tr>
          <th>Date/Time</th><th>BP</th><th>HR</th><th>Temp</th><th>RR</th><th>SpO₂</th><th>By</th>
        </tr></thead>
        <tbody>
          {vitals.map(v => (
            <tr key={v.id}>
              <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{formatDateTime(v.recordedAt)}</td>
              <td>{v.bp}</td><td>{v.hr}</td><td>{v.temp}</td><td>{v.rr}</td><td>{v.spo2}</td>
              <td style={{ fontSize:11, color:'var(--t3)' }}>{v.recordedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteForm({ emr, profile, noteRole, onSaved }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim()) { toast.error('Note cannot be empty'); return; }
    setSaving(true);
    try {
      await addNote(emr, null, { text }, profile?.displayName, noteRole);
      setText(''); onSaved?.();
    } catch(e) { toast.error('Failed to save note'); }
    setSaving(false);
  };
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <i className={`ti ${noteRole === 'doctor' ? 'ti-stethoscope' : 'ti-notes-medical'}`} />
          {noteRole === 'doctor' ? "Doctor's Consultation Note" : 'Nursing Note'}
        </div>
      </div>
      <div className="card-body">
        <div className="form-group">
          <label className="form-label">
            {noteRole === 'doctor' ? 'C/O · O/E · Dx · Plan' : 'Nursing observation / care given'}
            <span className="req">*</span>
          </label>
          <textarea className="form-textarea" rows={5}
            placeholder={noteRole === 'doctor'
              ? 'C/O: Headache × 2 days\nO/E: Temp 38.5°C, BP 110/70, PR 88bpm\nDx: ? Malaria with PUD\nPlan: IM Artemether 160mg OD × 3/7…'
              : 'IV line secured right hand. IM Artemether administered. Patient tolerated well…'}
            value={text} onChange={e => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary mt-3" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : <><i className="ti ti-device-floppy" /> Save Note to Timeline</>}
        </button>
      </div>
    </div>
  );
}

function NotesHistory({ notes, filterRole }) {
  const filtered = filterRole ? notes.filter(n => n.authorRole === filterRole) : notes;
  if (!filtered.length) return (
    <div className="card"><div className="card-body" style={{ textAlign:'center', fontSize:12, fontWeight:700, color:'var(--t3)' }}>
      No {filterRole} notes yet
    </div></div>
  );
  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-history" />Notes History</div></div>
      {filtered.map(n => (
        <div className="note-block" key={n.id}>
          <div className="note-header">
            <div className="note-avatar"
              style={{ background: n.authorRole==='doctor' ? '#9FE1CB' : '#B5D4F4',
                       color: n.authorRole==='doctor' ? '#085041' : '#0C447C' }}>
              {(n.authorName||'')[0]?.toUpperCase()}
            </div>
            <div className="note-author">{n.authorName}</div>
            <span className={`badge ${n.authorRole==='doctor' ? 'badge-info' : 'badge-warn'}`} style={{ fontSize:9 }}>
              {n.authorRole === 'doctor' ? "Doctor's note" : 'Nursing note'}
            </span>
            <div className="note-time">{formatDateTime(n.createdAt)}</div>
          </div>
          <div className="note-text" style={{ whiteSpace:'pre-line' }}>{n.text}</div>
        </div>
      ))}
    </div>
  );
}

function RxForm({ emr, profile, role, onSaved }) {
  const [drugs, setDrugs] = useState([{ name:'', dose:'', frequency:'', duration:'' }]);
  const [saving, setSaving] = useState(false);
  const addDrug = () => setDrugs(d => [...d, { name:'', dose:'', frequency:'', duration:'' }]);
  const removeDrug = (i) => setDrugs(d => d.filter((_,j) => j!==i));
  const setDrug = (i, k, v) => setDrugs(d => d.map((x,j) => j===i ? {...x,[k]:v} : x));

  const save = async () => {
    const valid = drugs.filter(d => d.name.trim());
    if (!valid.length) { toast.error('Add at least one drug'); return; }
    setSaving(true);
    try {
      await addPrescription(emr, null, valid, profile?.displayName, role);
      setDrugs([{ name:'', dose:'', frequency:'', duration:'' }]);
      onSaved?.();
    } catch(e) { toast.error('Failed to save prescription'); }
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-pill" />Rx — Prescription</div>
        <button className="btn btn-sm" onClick={addDrug}><i className="ti ti-plus" /> Add drug</button>
      </div>
      <div className="card-body">
        {drugs.map((d, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr auto', gap:8, marginBottom:8 }}>
            <div className="form-group">
              {i===0 && <label className="form-label">Drug name<span className="req">*</span></label>}
              <input className="form-input" placeholder="e.g. IM Artemether" value={d.name}
                onChange={e=>setDrug(i,'name',e.target.value)} />
            </div>
            <div className="form-group">
              {i===0 && <label className="form-label">Dose</label>}
              <input className="form-input" placeholder="e.g. 160mg" value={d.dose}
                onChange={e=>setDrug(i,'dose',e.target.value)} />
            </div>
            <div className="form-group">
              {i===0 && <label className="form-label">Frequency</label>}
              <input className="form-input" placeholder="OD / TDS / BD" value={d.frequency}
                onChange={e=>setDrug(i,'frequency',e.target.value)} />
            </div>
            <div className="form-group">
              {i===0 && <label className="form-label">Duration</label>}
              <input className="form-input" placeholder="× 3/7" value={d.duration}
                onChange={e=>setDrug(i,'duration',e.target.value)} />
            </div>
            <div style={{ display:'flex', alignItems: i===0 ? 'flex-end' : 'center', paddingBottom: i===0 ? 0 : 0 }}>
              {drugs.length > 1 && (
                <button className="btn btn-sm btn-danger btn-icon" onClick={()=>removeDrug(i)}>
                  <i className="ti ti-trash" />
                </button>
              )}
            </div>
          </div>
        ))}
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : <><i className="ti ti-device-floppy" /> Save Prescription</>}
        </button>
      </div>
    </div>
  );
}

function RxHistory({ rxList, patient }) {
  const [openId, setOpenId] = useState(null);

  if (!rxList.length) return null;

  // Group prescriptions by date string (same day + same minute = same session)
  // We group by: prescribedBy + truncated-to-minute timestamp
  const grouped = [];
  const seenKeys = {};
  rxList.forEach(rx => {
    const ts = rx.createdAt?.seconds || 0;
    // Round to nearest minute for grouping prescriptions saved in quick succession
    const minute = Math.floor(ts / 60);
    const key = `${rx.prescribedBy}__${minute}`;
    if (!seenKeys[key]) {
      seenKeys[key] = { key, at: rx.createdAt, by: rx.prescribedBy, requiresCountersign: rx.requiresCountersign, rxs: [] };
      grouped.push(seenKeys[key]);
    }
    seenKeys[key].rxs.push(rx);
  });

  const handleShare = (group) => {
    const patientName = patient ? `${patient.surname} ${patient.firstName} ${patient.otherNames||''}`.trim() : '';
    const emrNo = patient?.emrNumber || '';
    const dateStr = formatDateTime(group.at);
    const drugLines = group.rxs.flatMap(rx =>
      (rx.drugs||[]).map(d => `• ${d.name} ${d.dose} — ${d.frequency} ${d.duration}`)
    ).join('\n');
    const text =
`NACON EMR — Prescription
Patient: ${patientName}
EMR: ${emrNo}
Date: ${dateStr}
Prescribed by: ${group.by}${group.requiresCountersign ? ' (Nurse Rx — awaiting countersign)' : ''}

MEDICATIONS:
${drugLines}

— Nigerian Army College of Nursing (NACON), Yaba, Lagos`;

    if (navigator.share) {
      navigator.share({ title: `Prescription — ${patientName}`, text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => toast.success('Copied to clipboard'));
    }
  };

  const handleReprint = (group) => {
    const patientName = patient ? `${patient.surname} ${patient.firstName} ${patient.otherNames||''}`.trim() : '';
    const emrNo   = patient?.emrNumber || '';
    const folder  = patient?.folderNumber || '';
    const dateStr = formatDateTime(group.at);
    const drugRows = group.rxs.flatMap(rx =>
      (rx.drugs||[]).map(d =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${d.name}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${d.dose||'—'}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${d.frequency||'—'}</td><td style="padding:6px 8px;border-bottom:1px solid #eee">${d.duration||'—'}</td></tr>`
      )
    ).join('');
    const html = `<!DOCTYPE html><html><head><title>Prescription</title>
<style>body{font-family:Arial,sans-serif;padding:32px;max-width:700px;margin:auto}
h2{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
th{background:#1855A3;color:#fff;padding:8px;text-align:left}
.header{border-bottom:2px solid #1855A3;padding-bottom:12px;margin-bottom:16px}
.badge{display:inline-block;background:#FFF3CD;color:#856404;padding:2px 8px;border-radius:4px;font-size:11px}
@media print{button{display:none}}</style></head><body>
<div class="header">
  <h2>NACON EMR — Prescription</h2>
  <div style="font-size:13px;color:#555">Nigerian Army College of Nursing, Yaba, Lagos</div>
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;margin-bottom:16px">
  <div><strong>Patient:</strong> ${patientName}</div>
  <div><strong>EMR No:</strong> ${emrNo}</div>
  <div><strong>Folder:</strong> ${folder}</div>
  <div><strong>Date:</strong> ${dateStr}</div>
  <div><strong>Prescribed by:</strong> ${group.by}</div>
  ${group.requiresCountersign ? '<div><span class="badge">⚠ Nurse Rx — Countersign needed</span></div>' : ''}
</div>
<table>
  <thead><tr><th>Drug</th><th>Dose</th><th>Frequency</th><th>Duration</th></tr></thead>
  <tbody>${drugRows}</tbody>
</table>
<div style="margin-top:32px;font-size:11px;color:#888;border-top:1px solid #eee;padding-top:12px">
  Printed from NACON EMR · ${new Date().toLocaleString()}
</div>
<br><button onclick="window.print()">🖨 Print</button>
</body></html>`;
    const win = window.open('','_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-history" />Prescription History</div>
        <span style={{ fontSize:11, fontWeight:600, color:'var(--t3)' }}>{grouped.length} session{grouped.length!==1?'s':''}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>
        {grouped.map((group, gi) => {
          const isOpen = openId === group.key;
          const drugCount = group.rxs.reduce((s,r) => s + (r.drugs?.length||0), 0);
          return (
            <div key={group.key} style={{ borderBottom:'1px solid var(--border)' }}>
              {/* ── SESSION ROW (collapsed header) ── */}
              <div
                onClick={() => setOpenId(isOpen ? null : group.key)}
                style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  cursor:'pointer', background: isOpen ? 'var(--accent-bg)' : 'transparent',
                  transition:'background .15s',
                }}
              >
                <div style={{
                  width:32, height:32, borderRadius:8, flexShrink:0,
                  background:'#1855A3', display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <i className="ti ti-pill" style={{ fontSize:15, color:'#fff' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>
                    {formatDateTime(group.at)}
                  </div>
                  <div style={{ fontSize:11, color:'var(--t3)', fontWeight:500, marginTop:1 }}>
                    {drugCount} medication{drugCount!==1?'s':''} · {group.by}
                    {group.requiresCountersign && (
                      <span className="badge badge-warn" style={{ fontSize:9, marginLeft:6 }}>⚠ Nurse Rx</span>
                    )}
                  </div>
                </div>
                <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                  style={{ fontSize:16, color:'var(--t3)', flexShrink:0 }} />
              </div>

              {/* ── EXPANDED CONTENT ── */}
              {isOpen && (
                <div style={{ padding:'0 14px 14px', background:'var(--accent-bg)' }}>
                  {/* Drug table */}
                  <div style={{
                    background:'var(--bg)', borderRadius:8, border:'1px solid var(--border)',
                    overflow:'hidden', marginBottom:12,
                  }}>
                    <div style={{
                      display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr',
                      padding:'6px 12px', background:'rgba(24,85,163,.08)',
                      borderBottom:'1px solid var(--border)',
                    }}>
                      {['Drug','Dose','Frequency','Duration'].map(h => (
                        <div key={h} style={{ fontSize:9, fontWeight:700, color:'#1855A3', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</div>
                      ))}
                    </div>
                    {group.rxs.flatMap(rx => rx.drugs||[]).map((d, di) => (
                      <div key={di} style={{
                        display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr',
                        padding:'8px 12px', borderBottom:'1px solid var(--border)',
                        background: di%2===0 ? 'transparent' : 'rgba(0,0,0,.02)',
                      }}>
                        <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>{d.name}</div>
                        <div style={{ fontSize:12, color:'var(--t2)', fontWeight:600 }}>{d.dose||'—'}</div>
                        <div style={{ fontSize:12, color:'var(--t2)' }}>{d.frequency||'—'}</div>
                        <div style={{ fontSize:12, color:'var(--t3)' }}>{d.duration||'—'}</div>
                      </div>
                    ))}
                  </div>

                  {/* Prescription meta */}
                  <div style={{
                    padding:'8px 12px', borderRadius:8, background:'rgba(24,85,163,.05)',
                    border:'1px solid rgba(24,85,163,.12)', marginBottom:12,
                    fontSize:11, color:'var(--t3)', display:'flex', gap:16, flexWrap:'wrap',
                  }}>
                    <span><strong style={{color:'var(--t2)'}}>Prescribed by:</strong> {group.by}</span>
                    <span><strong style={{color:'var(--t2)'}}>Date:</strong> {formatDateTime(group.at)}</span>
                    {group.requiresCountersign && (
                      <span className="badge badge-warn">⚠ Nurse Rx — countersign required</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleReprint(group)}
                      style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700 }}
                    >
                      <i className="ti ti-printer" /> Reprint
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleShare(group)}
                      style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700, background:'rgba(24,85,163,.1)', borderColor:'rgba(24,85,163,.2)', color:'#1855A3' }}
                    >
                      <i className="ti ti-share" /> Share
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FluidForm({ emr, profile, onSaved }) {
  const [form, setForm] = useState({ time:'', intake:'', intakeType:'IV NS', output:'', outputType:'Urine', notes:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = async () => {
    if (!form.intake && !form.output) { toast.error('Enter intake or output'); return; }
    setSaving(true);
    try {
      await addFluidEntry(emr, null, form, profile?.displayName);
      setForm({ time:'', intake:'', intakeType:'IV NS', output:'', outputType:'Urine', notes:'' });
      onSaved?.();
    } catch(e) { toast.error('Failed to save'); }
    setSaving(false);
  };
  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-droplet" />Add Fluid Entry</div></div>
      <div className="card-body">
        <div className="form-grid-3">
          <div className="form-group"><label className="form-label">Time</label>
            <input className="form-input" type="time" value={form.time} onChange={e=>set('time',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Intake (ml)</label>
            <input className="form-input" placeholder="e.g. 500" value={form.intake} onChange={e=>set('intake',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Intake type</label>
            <select className="form-select" value={form.intakeType} onChange={e=>set('intakeType',e.target.value)}>
              {['IV NS','IV D5W','IV Ringers','Oral','NGT feed'].map(t=><option key={t}>{t}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Output (ml)</label>
            <input className="form-input" placeholder="e.g. 300" value={form.output} onChange={e=>set('output',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Output type</label>
            <select className="form-select" value={form.outputType} onChange={e=>set('outputType',e.target.value)}>
              {['Urine','Vomit','Drain','Stool','Sweat'].map(t=><option key={t}>{t}</option>)}
            </select></div>
          <div className="form-group"><label className="form-label">Notes</label>
            <input className="form-input" placeholder="Observations…" value={form.notes} onChange={e=>set('notes',e.target.value)} /></div>
        </div>
        <button className="btn btn-primary mt-3" onClick={save} disabled={saving}>
          <i className="ti ti-device-floppy" /> Save Entry
        </button>
      </div>
    </div>
  );
}

function FluidHistory({ fluids }) {
  if (!fluids.length) return null;
  const totalIn  = fluids.reduce((s,f) => s + (+f.intake||0), 0);
  const totalOut = fluids.reduce((s,f) => s + (+f.output||0), 0);
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-history" />Fluid Chart</div>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t2)' }}>
          In: <span style={{ color:'var(--info)' }}>{totalIn}ml</span> ·
          Out: <span style={{ color:'var(--warn)' }}>{totalOut}ml</span> ·
          Balance: <span style={{ color: totalIn-totalOut >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {totalIn-totalOut >= 0 ? '+' : ''}{totalIn-totalOut}ml
          </span>
        </div>
      </div>
      <table className="chart-table">
        <thead><tr><th>Time</th><th>Intake (ml)</th><th>Type</th><th>Output (ml)</th><th>Type</th><th>By</th></tr></thead>
        <tbody>
          {fluids.map(f => (
            <tr key={f.id}>
              <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{f.time || formatDateTime(f.recordedAt)}</td>
              <td style={{ color:'var(--info)' }}>{f.intake || '—'}</td>
              <td>{f.intakeType}</td>
              <td style={{ color:'var(--warn)' }}>{f.output || '—'}</td>
              <td>{f.outputType}</td>
              <td style={{ fontSize:11, color:'var(--t3)' }}>{f.recordedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GlucoseForm({ emr, profile, onSaved }) {
  const [form, setForm] = useState({ time:'', reading:'', context:'Fasting', notes:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const getStatus = (r) => +r < 4 ? 'Low' : +r > 7.8 ? 'High' : 'Normal';
  const save = async () => {
    if (!form.reading) { toast.error('Enter glucose reading'); return; }
    setSaving(true);
    try {
      await addGlucoseReading(emr, null, { ...form, status: getStatus(form.reading) }, profile?.displayName);
      setForm({ time:'', reading:'', context:'Fasting', notes:'' });
      onSaved?.();
    } catch(e) { toast.error('Failed to save'); }
    setSaving(false);
  };
  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-activity" />Add Glucose Reading</div></div>
      <div className="card-body">
        <div className="form-grid-3">
          <div className="form-group"><label className="form-label">Time</label>
            <input className="form-input" type="time" value={form.time} onChange={e=>set('time',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Reading (mmol/L)<span className="req">*</span></label>
            <input className="form-input" placeholder="e.g. 5.4" value={form.reading} onChange={e=>set('reading',e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Context</label>
            <select className="form-select" value={form.context} onChange={e=>set('context',e.target.value)}>
              {['Fasting','Post-meal (2hr)','Random','Pre-meal'].map(c=><option key={c}>{c}</option>)}
            </select></div>
          {form.reading && (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)' }}>Status:</span>
              <span className={`badge ${getStatus(form.reading)==='High'?'badge-danger':getStatus(form.reading)==='Low'?'badge-warn':'badge-ok'}`}>
                {getStatus(form.reading)}
              </span>
            </div>
          )}
        </div>
        <button className="btn btn-primary mt-3" onClick={save} disabled={saving}>
          <i className="ti ti-device-floppy" /> Save Reading
        </button>
      </div>
    </div>
  );
}

function GlucoseHistory({ glucoses }) {
  if (!glucoses.length) return null;
  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-history" />Glucose Chart</div></div>
      <table className="chart-table">
        <thead><tr><th>Time</th><th>Reading (mmol/L)</th><th>Context</th><th>Status</th><th>By</th></tr></thead>
        <tbody>
          {glucoses.map(g => (
            <tr key={g.id}>
              <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{g.time || formatDateTime(g.recordedAt)}</td>
              <td style={{ fontWeight:700 }}>{g.reading}</td>
              <td>{g.context}</td>
              <td><span className={`badge ${g.status==='High'?'badge-danger':g.status==='Low'?'badge-warn':'badge-ok'}`}>{g.status}</span></td>
              <td style={{ fontSize:11, color:'var(--t3)' }}>{g.recordedBy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UploadsCard({ uploads, category, emr, profile, fileInputRef, onSaved }) {
  const filtered = category ? uploads.filter(u => u.category === category) : uploads;
  const [saving, setSaving] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cat = file.type.includes('pdf') ? 'report' :
                file.type.includes('image') ? 'imaging' : 'lab_result';
    setSaving(true);
    try {
      await uploadPatientFile(emr, null, file, cat, profile?.displayName);
      onSaved?.();
    } catch(err) { toast.error('Upload failed: ' + err.message); }
    setSaving(false);
    e.target.value = '';
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-upload" />{category ? 'Lab Results' : 'All Uploads'}</div>
      </div>
      <div className="card-body">
        {!category && (
          <>
            <input type="file" ref={fileInputRef} style={{ display:'none' }}
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleFile} />
            <div className="upload-zone" onClick={() => fileInputRef?.current?.click()}>
              <i className="ti ti-cloud-upload" aria-hidden="true" />
              <p>{saving ? 'Uploading…' : 'Tap to upload PDF, image, scan result, or report'}</p>
              <p style={{ fontSize:11, marginTop:4 }}>PNG · JPG · PDF — max 10MB · Appears on timeline instantly</p>
            </div>
          </>
        )}
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.length === 0
            ? <div style={{ textAlign:'center', fontSize:12, fontWeight:700, color:'var(--t3)', padding:16 }}>
                No files uploaded yet
              </div>
            : filtered.map(u => (
                <div className="upload-file-row" key={u.id}>
                  <i className={`ti ${u.fileType?.includes('pdf') ? 'ti-file-text' : 'ti-photo'}`}
                    style={{ fontSize:20, color:'var(--accent)' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {u.fileName}
                    </div>
                    <div style={{ fontSize:10, color:'var(--t3)', fontWeight:500 }}>
                      {formatDateTime(u.uploadedAt)} · {u.uploadedBy}
                    </div>
                  </div>
                  <span className="badge badge-info" style={{ fontSize:9 }}>{u.category?.replace('_',' ')}</span>
                  <a href={u.downloadUrl} target="_blank" rel="noopener noreferrer"
                    className="btn btn-sm"><i className="ti ti-external-link" /> View</a>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

function ReferDischargeForm({ emr, profile, onSaved }) {
  const [form, setForm] = useState({ type:'discharge', referTo:'', purpose:'', clinicalNotes:'' });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    setSaving(true);
    try {
      if (form.type === 'refer') {
        if (!form.referTo) { toast.error('Enter referring hospital'); setSaving(false); return; }
        await createReferral(emr, null, {
          referTo: form.referTo, purpose: form.purpose, clinicalNotes: form.clinicalNotes
        }, profile?.displayName);
        toast.success('Referral letter generated');
      } else {
        await dischargePatient(emr, 'current', form.clinicalNotes, profile?.displayName);
        toast.success('Patient discharged');
      }
      onSaved?.();
    } catch(e) { toast.error('Failed to save'); }
    setSaving(false);
  };

  return (
    <div className="card">
      <div className="card-header"><div className="card-title"><i className="ti ti-file-export" />Referral / Discharge</div></div>
      <div className="card-body">
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          {['discharge','refer'].map(t => (
            <button key={t} className={`btn ${form.type===t ? 'btn-primary' : ''}`}
              onClick={() => set('type', t)}>
              <i className={`ti ${t==='discharge' ? 'ti-door-exit' : 'ti-file-export'}`} />
              {t === 'discharge' ? 'Discharge patient' : 'Refer to hospital'}
            </button>
          ))}
        </div>
        {form.type === 'refer' && (
          <div className="form-grid-2 mb-3">
            <div className="form-group">
              <label className="form-label">Referring to (hospital)<span className="req">*</span></label>
              <input className="form-input" placeholder="e.g. Lagos General Hospital"
                value={form.referTo} onChange={e=>set('referTo',e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Purpose / specialty</label>
              <input className="form-input" placeholder="e.g. Further management"
                value={form.purpose} onChange={e=>set('purpose',e.target.value)} />
            </div>
          </div>
        )}
        <div className="form-group mb-3">
          <label className="form-label">
            {form.type === 'refer' ? 'Clinical notes for receiving facility' : 'Discharge note'}
          </label>
          <textarea className="form-textarea" rows={5}
            placeholder="Clinical summary, management given, condition on discharge/referral…"
            value={form.clinicalNotes} onChange={e=>set('clinicalNotes',e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Processing…' :
            form.type === 'refer'
              ? <><i className="ti ti-file-export" /> Generate Referral Letter</>
              : <><i className="ti ti-door-exit" /> Discharge Patient</>
          }
        </button>
      </div>
    </div>
  );
}

/* ── LAB REQUEST FORM ────────────────────────── */
function LabRequestForm({ emr, profile, onSaved }) {
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
      await requestLabTest(emr, null, selected, profile?.displayName, urgency, notes);
      setSelected([]); setNotes(''); setUrgency('routine');
      onSaved?.();
    } catch(e) { toast.error('Failed to send lab request'); }
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
          <span style={{ fontSize:11, fontWeight:700, color:'#0E7490', background:'rgba(14,116,144,.1)',
            padding:'2px 8px', borderRadius:6 }}>
            {selected.length} selected
          </span>
        )}
      </div>
      <div className="card-body">
        {/* Urgency selector */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)', alignSelf:'center' }}>Priority:</span>
          {URGENCY_OPTS.map(u => (
            <button key={u.val}
              onClick={() => setUrgency(u.val)}
              className="btn btn-sm"
              style={{
                background: urgency === u.val ? u.color : 'transparent',
                color: urgency === u.val ? '#fff' : u.color,
                borderColor: u.color,
                fontWeight: 700,
              }}>
              {u.label}
            </button>
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
                  <button key={t.name}
                    onClick={() => toggle(t.name)}
                    style={{
                      padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700,
                      cursor:'pointer', border:`1.5px solid ${on ? '#0E7490' : 'var(--border)'}`,
                      background: on ? 'rgba(14,116,144,.12)' : 'var(--bg)',
                      color: on ? '#0E7490' : 'var(--t2)',
                      transition:'all .15s',
                    }}>
                    {on && <i className="ti ti-check" style={{ marginRight:4, fontSize:10 }} />}
                    {t.abbr}
                    <span style={{ fontSize:9, color:'var(--t3)', marginLeft:4 }}>
                      {t.name !== t.abbr ? t.name.replace(t.abbr,'').trim() : ''}
                    </span>
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
            <div style={{ fontSize:10, fontWeight:700, color:'#0E7490', marginBottom:4 }}>
              ORDERED TESTS
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {selected.map(s => (
                <span key={s} style={{ fontSize:11, padding:'2px 8px', borderRadius:4,
                  background:'rgba(14,116,144,.15)', color:'#0E7490', fontWeight:600 }}
                  onClick={() => toggle(s)} title="Click to remove">
                  {s} ×
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">Clinical indication / notes to lab</label>
          <textarea className="form-textarea" rows={2}
            placeholder="e.g. ? Malaria, Fever × 3/7, check FBC and MP"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving || !selected.length}>
          {saving
            ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Sending…</>
            : <><i className="ti ti-send" /> Send to Lab ({selected.length} test{selected.length !== 1 ? 's' : ''})</>
          }
        </button>
      </div>
    </div>
  );
}

/* ── LAB RESULTS HISTORY ─────────────────────── */
const URGENCY_BADGE = {
  stat:    'badge-danger',
  urgent:  'badge-warn',
  routine: 'badge-info',
};
const STATUS_BADGE = {
  pending:    'badge-warn',
  processing: 'badge-info',
  completed:  'badge-ok',
};
const FLAG_COLOR = { high:'#dc2626', low:'#d97706', normal:'var(--success)', '':'var(--t3)' };

function LabResultsHistory({ labResults, labRequests }) {
  const [openId, setOpenId] = useState(null);

  // Merge requests with their results
  const allRequests = [...labRequests].sort((a,b) =>
    (b.requestedAt?.seconds||0) - (a.requestedAt?.seconds||0));

  if (!allRequests.length) return (
    <div className="card">
      <div className="card-body" style={{ textAlign:'center', fontSize:12, fontWeight:700, color:'var(--t3)', padding:24 }}>
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
          {allRequests.length} request{allRequests.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>
        {allRequests.map(req => {
          const isOpen = openId === req.id;
          const result = labResults.find(r => r.requestId === req.id);

          return (
            <div key={req.id} style={{ borderBottom:'1px solid var(--border)' }}>
              {/* Collapsed row */}
              <div onClick={() => setOpenId(isOpen ? null : req.id)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  cursor:'pointer', background: isOpen ? 'var(--accent-bg)' : 'transparent',
                  transition:'background .15s' }}>
                <div style={{ width:34, height:34, borderRadius:8, flexShrink:0,
                  background: req.status === 'completed' ? 'rgba(22,163,74,.15)' : 'rgba(14,116,144,.12)',
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <i className={`ti ${req.status === 'completed' ? 'ti-circle-check' : 'ti-microscope'}`}
                    style={{ fontSize:16, color: req.status === 'completed' ? 'var(--success)' : '#0E7490' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    {(req.tests||[]).slice(0,3).join(' · ')}
                    {req.tests?.length > 3 && <span style={{ color:'var(--t3)' }}>+{req.tests.length - 3} more</span>}
                    <span className={`badge ${URGENCY_BADGE[req.urgency] || 'badge-info'}`} style={{ fontSize:9 }}>
                      {req.urgency?.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                    {formatDateTime(req.requestedAt)} · {req.requestedBy}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[req.status] || 'badge-neutral'}`} style={{ fontSize:10 }}>
                  {req.status}
                </span>
                <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                  style={{ fontSize:16, color:'var(--t3)', flexShrink:0 }} />
              </div>

              {/* Expanded */}
              {isOpen && (
                <div style={{ padding:'0 14px 14px', background:'var(--accent-bg)' }}>
                  {/* Request info */}
                  <div style={{ fontSize:11, color:'var(--t3)', marginBottom:10, display:'flex', gap:16, flexWrap:'wrap' }}>
                    <span><strong style={{color:'var(--t2)'}}>Ordered by:</strong> {req.requestedBy}</span>
                    <span><strong style={{color:'var(--t2)'}}>On:</strong> {formatDateTime(req.requestedAt)}</span>
                    {req.notes && <span><strong style={{color:'var(--t2)'}}>Note:</strong> {req.notes}</span>}
                  </div>

                  {/* Ordered tests list */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
                    {(req.tests||[]).map(t => (
                      <span key={t} style={{ padding:'3px 10px', borderRadius:6, fontSize:11,
                        fontWeight:600, background:'rgba(14,116,144,.1)', color:'#0E7490',
                        border:'1px solid rgba(14,116,144,.2)' }}>{t}</span>
                    ))}
                  </div>

                  {/* Results table */}
                  {result ? (
                    <div style={{ borderRadius:8, overflow:'hidden', border:'1px solid var(--border)' }}>
                      <div style={{ padding:'6px 12px', background:'rgba(22,163,74,.1)',
                        borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--success)' }}>
                          <i className="ti ti-circle-check" style={{ marginRight:4 }} />Results entered by {result.resultEnteredBy}
                        </span>
                        <span style={{ fontSize:10, color:'var(--t3)' }}>{formatDateTime(result.completedAt)}</span>
                      </div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'rgba(0,0,0,.03)' }}>
                            {['Test','Result','Unit','Ref Range','Flag'].map(h => (
                              <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9,
                                fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.04em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(result.results || {}).map(([test, r], i) => (
                            <tr key={test} style={{ borderTop:'1px solid var(--border)',
                              background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,.015)' }}>
                              <td style={{ padding:'7px 10px', fontWeight:700, color:'var(--t1)' }}>{test}</td>
                              <td style={{ padding:'7px 10px', fontWeight:800,
                                color: r.flag === 'high' ? '#dc2626' : r.flag === 'low' ? '#d97706' : 'var(--t1)' }}>
                                {r.value || '—'}
                              </td>
                              <td style={{ padding:'7px 10px', color:'var(--t3)' }}>{r.unit || '—'}</td>
                              <td style={{ padding:'7px 10px', color:'var(--t3)' }}>{r.referenceRange || '—'}</td>
                              <td style={{ padding:'7px 10px' }}>
                                {r.flag ? (
                                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:4,
                                    background: r.flag === 'high' ? '#fee2e2' : r.flag === 'low' ? '#ffedd5' : 'rgba(22,163,74,.1)',
                                    color: FLAG_COLOR[r.flag] || 'var(--t3)' }}>
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
                    <div style={{ padding:'12px 16px', borderRadius:8, textAlign:'center',
                      background:'rgba(0,0,0,.03)', border:'1px dashed var(--border)',
                      fontSize:12, fontWeight:700, color:'var(--t3)' }}>
                      <i className="ti ti-clock" style={{ fontSize:18, display:'block', marginBottom:4, opacity:.5 }} />
                      {req.status === 'pending' ? 'Awaiting processing by lab' :
                       req.status === 'processing' ? 'Lab is processing this request' :
                       'No results data found'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
