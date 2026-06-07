// src/pages/RegisterPatient.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import { registerPatient, emrToFolderNumber } from '../lib/emr';

const EMPTY = {
  surname:'', firstName:'', otherNames:'',
  dob:'', sex:'', maritalStatus:'', religion:'', tribe:'',
  placeOfOrigin:'', occupation:'Student',
  matricNo:'', classSet:'', level:'', department:'Nursing Science',
  hmo:'', homeAddress:'', tel:'', email:'',
  nextOfKin:'', nextOfKinRel:'', nextOfKinTel:'', nextOfKinAddress:'',
  allergies:'', bloodGroup:'',
};

const STEP_LABELS = ['Identity', 'Academic Info', 'Contact', 'Medical Background'];

export default function RegisterPatient() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [step,    setStep]    = useState(0);
  const [form,    setForm]    = useState(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [preview, setPreview] = useState(null); // { emrNumber, folderNumber }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep = () => {
    if (step === 0 && (!form.surname || !form.firstName || !form.dob || !form.sex)) {
      toast.error('Fill in Surname, First name, Date of birth and Sex');
      return false;
    }
    if (step === 1 && (!form.matricNo || !form.classSet)) {
      toast.error('Matric number and Class/SET are required');
      return false;
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, 3)); };
  const back = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSaving(true);
    try {
      const result = await registerPatient(form, profile?.displayName);
      setPreview(result);
      toast.success(`Patient registered! EMR: ${result.emrNumber}`);
    } catch (err) {
      toast.error('Registration failed. Please try again.');
      console.error(err);
    }
    setSaving(false);
  };

  // ── Success screen after registration
  if (preview) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
        <div className="topbar">
          <div className="topbar-title">Patient Registered Successfully</div>
        </div>
        <div className="page-content" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div className="card" style={{ maxWidth:480, width:'100%' }}>
            <div style={{ background:'var(--success-bg)', padding:'20px 24px', borderBottom:'1px solid var(--border)', textAlign:'center' }}>
              <i className="ti ti-circle-check" style={{ fontSize:40, color:'var(--success)', display:'block', marginBottom:8 }} />
              <div style={{ fontSize:16, fontWeight:700, color:'var(--success)' }}>Registration Complete</div>
            </div>
            <div className="card-body" style={{ textAlign:'center' }}>
              <div className="emr-banner" style={{ flexDirection:'column', textAlign:'center' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>
                  Auto-generated EMR Number
                </div>
                <div className="emr-number">{preview.emrNumber}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--t2)', marginTop:4 }}>
                  {preview.folderNumber}
                </div>
                <div style={{ fontSize:11, color:'var(--t3)', fontWeight:500, marginTop:6 }}>
                  This number is unique to this patient and cannot be changed.<br />
                  Print and attach to the physical folder card.
                </div>
              </div>

              <div style={{ background:'var(--card-bg2)', borderRadius:'var(--radius)', padding:'12px 16px', marginBottom:16, textAlign:'left' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t3)', marginBottom:8, textTransform:'uppercase' }}>Patient details</div>
                {[
                  ['Name',    `${form.surname} ${form.firstName} ${form.otherNames}`],
                  ['Class',   form.classSet],
                  ['Matric',  form.matricNo],
                  ['Sex',     form.sex],
                  ['DOB',     form.dob],
                ].map(([l,v]) => (
                  <div key={l} style={{ display:'flex', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--t3)', width:60 }}>{l}:</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--t1)' }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                <button className="btn btn-primary" onClick={() => navigate(`/patient/${preview.emrNumber}`)}>
                  <i className="ti ti-user" /> Open patient profile
                </button>
                <button className="btn" onClick={() => window.print()}>
                  <i className="ti ti-printer" /> Print folder card
                </button>
                <button className="btn" onClick={() => { setPreview(null); setForm(EMPTY); setStep(0); }}>
                  <i className="ti ti-user-plus" /> Register another
                </button>
                <button className="btn" onClick={() => navigate('/records')}>
                  <i className="ti ti-arrow-left" /> Back to dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Register New Patient</div>
        <button className="btn" onClick={() => navigate('/records')}>
          <i className="ti ti-arrow-left" /> Cancel
        </button>
      </div>

      <div className="page-content">
        {/* Step indicator */}
        <div style={{ display:'flex', gap:0, marginBottom:20 }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex:1, display:'flex', alignItems:'center' }}>
              <div style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:4, flex:1,
              }}>
                <div style={{
                  width:28, height:28, borderRadius:'50%',
                  background: i<=step ? 'var(--accent)' : 'var(--card-bg2)',
                  border: `2px solid ${i<=step ? 'var(--accent)' : 'var(--border)'}`,
                  color: i<=step ? '#fff' : 'var(--t3)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:700,
                }}>
                  {i < step ? <i className="ti ti-check" style={{fontSize:14}} /> : i+1}
                </div>
                <div style={{ fontSize:10, fontWeight:700, color: i<=step?'var(--accent)':'var(--t3)', textAlign:'center' }}>
                  {label}
                </div>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div style={{ height:2, flex:1, background: i<step?'var(--accent)':'var(--border)', margin:'0 4px', marginBottom:18 }} />
              )}
            </div>
          ))}
        </div>

        {/* EMR preview banner */}
        <div className="emr-banner">
          <div className="sb-icon" style={{ background:'var(--accent)' }}>
            <i className="ti ti-id-badge" style={{ fontSize:18, color:'#fff' }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase', letterSpacing:'.05em' }}>
              EMR number — auto-generated on save
            </div>
            <div className="emr-number" style={{ fontSize:20 }}>EMR-{new Date().getFullYear()}-XXXX</div>
            <div style={{ fontSize:10, color:'var(--t3)', fontWeight:500, marginTop:2 }}>
              Unique number assigned when you click "Save & register". Cannot be edited manually.
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)' }}>Folder no.</div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)', fontFamily:'var(--mono)' }}>FN: XXXX/{String(new Date().getFullYear()).slice(2)}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className={['ti-user','ti-school','ti-phone','ti-heart-plus'][step]} />
              Step {step+1}: {STEP_LABELS[step]}
            </div>
            <div style={{ fontSize:11, color:'var(--t3)', fontWeight:500 }}>
              Fields marked <span style={{ color:'var(--danger)' }}>*</span> are required
            </div>
          </div>
          <div className="card-body">

            {/* ── STEP 0: Identity */}
            {step === 0 && (
              <div className="form-grid-3" style={{ gap:14 }}>
                {[
                  { id:'surname',      label:'Surname',       req:true,  ph:'e.g. OKONKWO',     span:1 },
                  { id:'firstName',    label:'First name',    req:true,  ph:'e.g. Adaeze',       span:1 },
                  { id:'otherNames',   label:'Other names',   req:false, ph:'e.g. Chioma',       span:1 },
                  { id:'dob',          label:'Date of birth', req:true,  type:'date',             span:1 },
                  { id:'sex',          label:'Sex',           req:true,  select:['Male','Female'],span:1 },
                  { id:'maritalStatus',label:'Marital status',req:false, select:['Single','Married','Divorced','Widowed'], span:1 },
                  { id:'religion',     label:'Religion',      req:false, select:['Christianity','Islam','Traditional','Other'], span:1 },
                  { id:'tribe',        label:'Tribe / ethnicity', req:false, ph:'e.g. Igbo',     span:1 },
                  { id:'placeOfOrigin',label:'Place of origin',   req:false, ph:'e.g. Anambra', span:1 },
                  { id:'bloodGroup',   label:'Blood group',   req:false, select:['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'], span:1 },
                  { id:'allergies',    label:'Known allergies',req:false, ph:'e.g. Penicillin, or leave blank if none', span:3 },
                ].map(f => (
                  <div key={f.id} className={`form-group ${f.span===3?'form-span-3':f.span===2?'form-span-2':''}`}>
                    <label className="form-label" htmlFor={f.id}>
                      {f.label} {f.req && <span className="req">*</span>}
                    </label>
                    {f.select ? (
                      <select id={f.id} className="form-select" value={form[f.id]}
                        onChange={e => set(f.id, e.target.value)}>
                        <option value="">Select…</option>
                        {f.select.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input id={f.id} type={f.type||'text'} className="form-input"
                        placeholder={f.ph} value={form[f.id]}
                        onChange={e => set(f.id, e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── STEP 1: Academic info — these fields power the search */}
            {step === 1 && (
              <>
                <div className="alert alert-info" style={{ marginBottom:16 }}>
                  <i className="ti ti-search" />
                  These fields are used for patient search across the EMR — Nurses and Doctors will find this patient by their EMR number, full name, or class/SET.
                </div>
                <div className="form-grid-3" style={{ gap:14 }}>
                  {[
                    { id:'matricNo',    label:'Matric / registration number', req:true,  ph:'e.g. NACON/2023/0041' },
                    { id:'classSet',    label:'Class / SET',                  req:true,  ph:'e.g. SET 49' },
                    { id:'level',       label:'Level / year',                 req:false, ph:'e.g. Year 2' },
                    { id:'department',  label:'Department',                   req:false, ph:'e.g. Nursing Science' },
                    { id:'occupation',  label:'Occupation / status',          req:false, select:['Student','Staff','Civilian'] },
                    { id:'hmo',         label:'HMO / NHIS number',            req:false, ph:'e.g. NHIS · ZONAL/79/1661' },
                  ].map(f => (
                    <div key={f.id} className="form-group">
                      <label className="form-label" htmlFor={f.id}>
                        {f.label} {f.req && <span className="req">*</span>}
                      </label>
                      {f.select ? (
                        <select id={f.id} className="form-select" value={form[f.id]}
                          onChange={e => set(f.id, e.target.value)}>
                          {f.select.map(o => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input id={f.id} className="form-input" placeholder={f.ph}
                          value={form[f.id]} onChange={e => set(f.id, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── STEP 2: Contact */}
            {step === 2 && (
              <div className="form-grid-3" style={{ gap:14 }}>
                {[
                  { id:'homeAddress',    label:'Home address',         span:3, ph:'e.g. 14 Apapa Road, Yaba, Lagos' },
                  { id:'tel',            label:'Phone / tel',          span:1, ph:'e.g. 08031234567' },
                  { id:'email',          label:'Email',                span:2, ph:'e.g. adaeze@gmail.com' },
                  { id:'nextOfKin',      label:'Next of kin — name',   span:1, ph:'e.g. Mrs. Ngozi Okonkwo' },
                  { id:'nextOfKinRel',   label:'Relationship',         span:1, ph:'e.g. Mother' },
                  { id:'nextOfKinTel',   label:'Next of kin — tel',    span:1, ph:'e.g. 08057891234' },
                  { id:'nextOfKinAddress', label:'Next of kin — address', span:3, ph:'e.g. 22 Broad Street, Lagos' },
                ].map(f => (
                  <div key={f.id} className={`form-group ${f.span===3?'form-span-3':f.span===2?'form-span-2':''}`}>
                    <label className="form-label" htmlFor={f.id}>{f.label}</label>
                    <input id={f.id} className="form-input" placeholder={f.ph}
                      value={form[f.id]} onChange={e => set(f.id, e.target.value)} />
                  </div>
                ))}
              </div>
            )}

            {/* ── STEP 3: Medical background */}
            {step === 3 && (
              <div className="form-grid-2" style={{ gap:14 }}>
                {[
                  { id:'allergies',        label:'Known allergies',      span:2, ph:'e.g. Penicillin · Sulpha drugs — or leave blank' },
                  { id:'pastMedHistory',   label:'Past medical history', span:2, ph:'e.g. Hypertension, Diabetes, Asthma…', ta:true },
                  { id:'familyHistory',    label:'Family history',       span:2, ph:'e.g. Diabetes in family…', ta:true },
                  { id:'currentMeds',      label:'Current medications',  span:2, ph:'e.g. Lisinopril 5mg OD…', ta:true },
                  { id:'surgicalHistory',  label:'Surgical history',     span:2, ph:'e.g. Appendectomy 2020…', ta:true },
                ].map(f => (
                  <div key={f.id} className={`form-group ${f.span===2?'form-span-2':''}`}>
                    <label className="form-label" htmlFor={f.id}>{f.label}</label>
                    {f.ta
                      ? <textarea id={f.id} className="form-textarea full-width" rows={3}
                          placeholder={f.ph} value={form[f.id]||''}
                          onChange={e => set(f.id, e.target.value)} />
                      : <input id={f.id} className="form-input" placeholder={f.ph}
                          value={form[f.id]||''} onChange={e => set(f.id, e.target.value)} />
                    }
                  </div>
                ))}
              </div>
            )}

            {/* Navigation buttons */}
            <div style={{ display:'flex', gap:8, marginTop:20, paddingTop:16, borderTop:'1px solid var(--border)', justifyContent:'space-between' }}>
              <div>
                {step > 0 && (
                  <button className="btn" onClick={back}>
                    <i className="ti ti-arrow-left" /> Back
                  </button>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {step < 3 ? (
                  <button className="btn btn-primary" onClick={next}>
                    Next <i className="ti ti-arrow-right" />
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                    {saving
                      ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Saving…</>
                      : <><i className="ti ti-device-floppy" /> Save &amp; generate EMR</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
