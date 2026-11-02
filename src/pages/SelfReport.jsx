// src/pages/SelfReport.jsx
// Public page — no login required. Reached by scanning the clinic QR / barcode.
// Flow: matric → (not registered? self-register) → "report sick?" → complaint | congratulations
import React, { useState } from 'react';
import { submitSelfReport, submitSelfRegistration, isMatricRegistered } from '../lib/emr';

const INPUT = {
  width:'100%', padding:'12px 14px', borderRadius:8, background:'#0f172a',
  border:'1px solid #334155', color:'#fff', fontSize:14, outline:'none',
  boxSizing:'border-box', fontFamily:'inherit',
};
const LABEL = { fontSize:11, fontWeight:700, color:'#94a3b8', display:'block', marginBottom:6, marginTop:14 };
const BTN   = { padding:'13px', border:'none', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer', color:'#fff' };

const SEVERITY = [
  { value:'mild',     label:'Mild',     desc:'Manageable, not urgent',        color:'#22c55e' },
  { value:'moderate', label:'Moderate', desc:'Affecting daily activities',    color:'#f59e0b' },
  { value:'severe',   label:'Severe',   desc:'Very unwell, need urgent help', color:'#ef4444' },
];

const REG0 = {
  surname:'', firstName:'', otherNames:'', dob:'', sex:'', patientIdentity:'Civilian',
  classSet:'', level:'', department:'Nursing Science', tel:'',
  nextOfKin:'', nextOfKinRel:'', nextOfKinTel:'', bloodGroup:'', allergies:'',
};

export default function SelfReport() {
  const via = new URLSearchParams(window.location.search).get('via') === 'barcode' ? 'barcode' : 'qr';

  // 'matric' | 'register' | 'ask' | 'complaint' | 'submitted' | 'congrats'
  const [view,   setView]   = useState('matric');
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [matricNo, setMatricNo] = useState('');
  const [reg,    setReg]    = useState(REG0);
  const [justRegistered, setJustRegistered] = useState(false);
  const [sick,   setSick]   = useState({ complaint:'', duration:'', severity:'moderate' });
  const [result, setResult] = useState(null);

  const setR = (k, v) => { setReg(f => ({ ...f, [k]: v })); setError(''); };
  const setS = (k, v) => { setSick(f => ({ ...f, [k]: v })); setError(''); };

  const handleMatric = async () => {
    if (!matricNo.trim()) { setError('Enter your matric number'); return; }
    setSaving(true); setError('');
    try {
      const registered = await isMatricRegistered(matricNo);
      setView(registered ? 'complaint' : 'register');
    } catch (e) {
      setError('Could not connect. Check your internet and try again.');
    }
    setSaving(false);
  };

  const handleRegister = async () => {
    const need = [['surname','Surname'],['firstName','First name'],['dob','Date of birth'],['sex','Sex'],['classSet','Class / SET']];
    for (const [k, label] of need) {
      if (!String(reg[k] || '').trim()) { setError(`${label} is required`); return; }
    }
    setSaving(true); setError('');
    try {
      await submitSelfRegistration({ ...reg, matricNo, via });
      setJustRegistered(true);
      setView('ask');
    } catch (e) {
      setError(e.message || 'Registration failed. Please try again.');
    }
    setSaving(false);
  };

  const handleSubmitSick = async () => {
    if (!sick.complaint.trim()) { setError('Describe your complaint'); return; }
    setSaving(true); setError('');
    try {
      const res = await submitSelfReport({ matricNo, ...sick, via, justRegistered, firstName: reg.firstName });
      setResult(res);
      setView('submitted');
    } catch (e) {
      setError(e.message || 'Submission failed. Please try again.');
    }
    setSaving(false);
  };

  const field = (id, label, props = {}) => (
    <div key={id}>
      <label style={LABEL}>{label}</label>
      {props.options ? (
        <select style={INPUT} value={reg[id]} onChange={e => setR(id, e.target.value)}>
          <option value="">Select…</option>
          {props.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input style={INPUT} type={props.type || 'text'} placeholder={props.ph || ''}
          value={reg[id]} onChange={e => setR(id, e.target.value)} />
      )}
    </div>
  );

  const errBox = error && <div style={{ color:'#f87171', fontSize:12, fontWeight:600, marginTop:10 }}>{error}</div>;

  return (
    <div style={{
      minHeight:'calc(100vh / 1.0625)',
      background:'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'flex-start', padding:'24px 16px 40px',
      fontFamily:'"Inter", system-ui, sans-serif',
    }}>
      <div style={{ textAlign:'center', marginBottom:24, maxWidth:420, width:'100%' }}>
        <div style={{
          width:64, height:64, borderRadius:16, background:'#1d4ed8',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 12px', boxShadow:'0 4px 20px rgba(29,78,216,0.4)',
        }}><span style={{ fontSize:28 }}>🏥</span></div>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>NACON Clinic</div>
        <div style={{ fontSize:13, color:'#94a3b8' }}>Student self-service · Registration &amp; report sick</div>
      </div>

      <div style={{
        background:'#1e293b', borderRadius:16, padding:'24px 20px', width:'100%', maxWidth:440,
        boxShadow:'0 8px 32px rgba(0,0,0,0.4)', border:'1px solid #334155',
      }}>

        {/* ── Matric ── */}
        {view === 'matric' && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', marginBottom:4 }}>Your details</div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              Enter your matric number. If you are not on the system yet, you will be asked to register first.
            </div>
            <label style={LABEL}>MATRIC / REGISTRATION NUMBER *</label>
            <input style={{ ...INPUT, fontWeight:600 }} placeholder="e.g. NACON/2023/0041"
              value={matricNo} onChange={e => { setMatricNo(e.target.value); setError(''); }} />
            {errBox}
            <button onClick={handleMatric} disabled={saving}
              style={{ ...BTN, width:'100%', marginTop:20, background:'#1d4ed8', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Checking…' : 'Continue →'}
            </button>
          </>
        )}

        {/* ── Self-registration ── */}
        {view === 'register' && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', marginBottom:4 }}>Register with the clinic</div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              You are not on the system yet. Fill in your details once — fields marked * are required.
            </div>
            <div style={{ background:'#0f172a', border:'1px solid #1d4ed8', borderRadius:8, padding:'10px 12px', marginTop:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#64748b' }}>MATRIC NUMBER</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{matricNo.trim()}</div>
            </div>
            {field('surname', 'SURNAME *', { ph:'e.g. OKONKWO' })}
            {field('firstName', 'FIRST NAME *', { ph:'e.g. Adaeze' })}
            {field('otherNames', 'OTHER NAMES', { ph:'e.g. Chioma' })}
            {field('dob', 'DATE OF BIRTH *', { type:'date' })}
            {field('sex', 'SEX *', { options:['Male','Female'] })}
            {field('patientIdentity', 'CATEGORY', { options:['Civilian','Soldier'] })}
            {field('classSet', 'CLASS / SET *', { ph:'e.g. SET 49' })}
            {field('level', 'LEVEL / YEAR', { ph:'e.g. Year 2' })}
            {field('department', 'DEPARTMENT', { ph:'e.g. Nursing Science' })}
            {field('tel', 'PHONE', { ph:'e.g. 08031234567', type:'tel' })}
            {field('nextOfKin', 'NEXT OF KIN — NAME', { ph:'e.g. Mrs. Ngozi Okonkwo' })}
            {field('nextOfKinRel', 'RELATIONSHIP', { ph:'e.g. Mother' })}
            {field('nextOfKinTel', 'NEXT OF KIN — PHONE', { ph:'e.g. 08057891234', type:'tel' })}
            {field('bloodGroup', 'BLOOD GROUP', { options:['A+','A-','B+','B-','AB+','AB-','O+','O-','Unknown'] })}
            {field('allergies', 'KNOWN ALLERGIES', { ph:'e.g. Penicillin — or leave blank if none' })}
            {errBox}
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => { setView('matric'); setError(''); }} style={{ ...BTN, flex:1, background:'#334155' }}>← Back</button>
              <button onClick={handleRegister} disabled={saving}
                style={{ ...BTN, flex:2, background:'#16a34a', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Registering…' : 'Register'}
              </button>
            </div>
          </>
        )}

        {/* ── Ask: report sick? ── */}
        {view === 'ask' && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:10 }}>📝</div>
            <div style={{ fontWeight:800, fontSize:18, color:'#fff', marginBottom:8 }}>Details received</div>
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.7, marginBottom:22 }}>
              Thank you, <strong style={{ color:'#fff' }}>{reg.firstName}</strong>. Your registration has been sent to the records office for approval.
              Do you want to report sick now?
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setView('congrats')} style={{ ...BTN, flex:1, background:'#334155' }}>No</button>
              <button onClick={() => setView('complaint')} style={{ ...BTN, flex:2, background:'#dc2626' }}>Yes, report sick</button>
            </div>
          </div>
        )}

        {/* ── Complaint ── */}
        {view === 'complaint' && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', marginBottom:4 }}>What's wrong?</div>
            <div style={{ fontSize:12, color:'#94a3b8' }}>
              Describe your symptoms. The nurse will see this when you arrive.
            </div>
            <label style={LABEL}>CHIEF COMPLAINT *</label>
            <textarea rows={4} style={{ ...INPUT, fontSize:13, resize:'vertical' }}
              placeholder="e.g. I have headache and fever since yesterday morning. Also having body pain."
              value={sick.complaint} onChange={e => setS('complaint', e.target.value)} />
            <label style={LABEL}>HOW LONG?</label>
            <input style={{ ...INPUT, fontSize:13 }} placeholder="e.g. 2 days, since this morning"
              value={sick.duration} onChange={e => setS('duration', e.target.value)} />
            <label style={{ ...LABEL, marginBottom:8 }}>HOW BAD IS IT?</label>
            <div style={{ display:'flex', gap:8 }}>
              {SEVERITY.map(s => (
                <button key={s.value} onClick={() => setS('severity', s.value)} style={{
                  flex:1, padding:'10px 6px', borderRadius:8, cursor:'pointer', textAlign:'center',
                  border: sick.severity === s.value ? `2px solid ${s.color}` : '2px solid #334155',
                  background: sick.severity === s.value ? `${s.color}22` : '#0f172a',
                }}>
                  <div style={{ fontSize:11, fontWeight:800, color: sick.severity===s.value ? s.color : '#94a3b8' }}>{s.label}</div>
                  <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>{s.desc}</div>
                </button>
              ))}
            </div>
            {errBox}
            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => { setView(justRegistered ? 'ask' : 'matric'); setError(''); }}
                style={{ ...BTN, flex:1, background:'#334155', fontSize:13 }}>← Back</button>
              <button onClick={handleSubmitSick} disabled={saving}
                style={{ ...BTN, flex:2, background:'#1d4ed8', fontSize:13, opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Submitting…' : '🏥 Report to clinic'}
              </button>
            </div>
          </>
        )}

        {/* ── Report submitted ── */}
        {view === 'submitted' && result && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:18, color:'#fff', marginBottom:8 }}>Report submitted!</div>
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.7, marginBottom:20 }}>
              Hello <strong style={{ color:'#fff' }}>{result.patient.firstName || 'student'}</strong>,
              your report has been received. Please come to the clinic — the nurse will attend to you.
            </div>
            <div style={{ background:'#0f172a', borderRadius:10, padding:'14px 16px', border:'1px solid #1d4ed8', marginBottom:20, textAlign:'left' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#64748b', marginBottom:6 }}>YOUR MATRIC NUMBER</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{result.patient.matricNo}</div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
                Severity: <span style={{
                  color: sick.severity==='severe'?'#ef4444':sick.severity==='moderate'?'#f59e0b':'#22c55e',
                  fontWeight:700, textTransform:'capitalize',
                }}>{sick.severity}</span>
              </div>
            </div>
            <div style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>
              ⚠ If this is a medical emergency, go directly to the clinic or call for help.
            </div>
          </div>
        )}

        {/* ── Congratulations (registered, not sick) ── */}
        {view === 'congrats' && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <div style={{ fontWeight:800, fontSize:20, color:'#fff', marginBottom:8 }}>Congratulations!</div>
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.7 }}>
              <strong style={{ color:'#fff' }}>{reg.firstName}</strong>, your registration has been submitted. The records office will approve it, and then you are on the clinic list.
              If you ever feel unwell, scan the clinic code again and report sick.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
