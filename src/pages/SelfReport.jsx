// src/pages/SelfReport.jsx
// Public page — no login required
// Students access via QR code at clinic / hostel
import React, { useState } from 'react';
import { submitSelfReport } from '../lib/emr';

const STEPS = ['Your details', 'Your complaint', 'Submitted'];

export default function SelfReport() {
  const [step,      setStep]    = useState(0);
  const [saving,    setSaving]  = useState(false);
  const [result,    setResult]  = useState(null);
  const [form,      setForm]    = useState({
    matricNo:'', complaint:'', duration:'', severity:'moderate',
  });
  const [error, setError] = useState('');

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };

  const handleSubmit = async () => {
    if (!form.matricNo.trim())  { setError('Enter your matric number'); return; }
    if (!form.complaint.trim()) { setError('Describe your complaint'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await submitSelfReport(form);
      setResult(res);
      setStep(2);
    } catch (e) {
      setError(e.message || 'Submission failed. Please try again.');
    }
    setSaving(false);
  };

  const SEVERITY = [
    { value:'mild',     label:'Mild',     desc:'Manageable, not urgent',       color:'#22c55e' },
    { value:'moderate', label:'Moderate', desc:'Affecting daily activities',   color:'#f59e0b' },
    { value:'severe',   label:'Severe',   desc:'Very unwell, need urgent help', color:'#ef4444' },
  ];

  return (
    <div style={{
      minHeight:'100vh',
      background:'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
      display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'flex-start', padding:'24px 16px 40px',
      fontFamily:'"Inter", system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{ textAlign:'center', marginBottom:28, maxWidth:420, width:'100%' }}>
        <div style={{
          width:64, height:64, borderRadius:16,
          background:'#1d4ed8', display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 12px',
          boxShadow:'0 4px 20px rgba(29,78,216,0.4)',
        }}>
          <span style={{ fontSize:28 }}>🏥</span>
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:4 }}>
          NACON Clinic
        </div>
        <div style={{ fontSize:13, color:'#94a3b8' }}>
          Report sick · Student self-service
        </div>
      </div>

      {/* Step indicator */}
      <div style={{ display:'flex', gap:8, marginBottom:24, alignItems:'center' }}>
        {STEPS.slice(0,2).map((label, i) => (
          <React.Fragment key={i}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              background: i <= step ? '#1d4ed8' : '#334155',
              color: '#fff', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700, flexShrink:0,
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize:11, color: i===step ? '#fff' : '#64748b', fontWeight: i===step ? 700 : 500 }}>
              {label}
            </span>
            {i < 1 && <div style={{ width:24, height:2, background:'#334155' }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Card */}
      <div style={{
        background:'#1e293b', borderRadius:16, padding:'24px 20px',
        width:'100%', maxWidth:440,
        boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
        border:'1px solid #334155',
      }}>

        {/* ── Step 0: Identity ── */}
        {step === 0 && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', marginBottom:4 }}>Your details</div>
            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:20 }}>
              Enter your matric number to verify your identity.
            </div>
            <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', display:'block', marginBottom:6 }}>
              MATRIC / REGISTRATION NUMBER *
            </label>
            <input
              style={{
                width:'100%', padding:'12px 14px', borderRadius:8,
                background:'#0f172a', border:'1px solid #334155',
                color:'#fff', fontSize:14, fontWeight:600,
                outline:'none', boxSizing:'border-box',
              }}
              placeholder="e.g. NACON/2023/0041"
              value={form.matricNo}
              onChange={e => set('matricNo', e.target.value)}
            />
            {error && <div style={{ color:'#f87171', fontSize:12, fontWeight:600, marginTop:8 }}>{error}</div>}
            <button
              onClick={() => {
                if (!form.matricNo.trim()) { setError('Enter your matric number'); return; }
                setError(''); setStep(1);
              }}
              style={{
                width:'100%', marginTop:20, padding:'13px',
                background:'#1d4ed8', color:'#fff', border:'none',
                borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer',
              }}>
              Continue →
            </button>
          </>
        )}

        {/* ── Step 1: Complaint ── */}
        {step === 1 && (
          <>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff', marginBottom:4 }}>What's wrong?</div>
            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:20 }}>
              Describe your symptoms. The nurse will see this when you arrive.
            </div>

            <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', display:'block', marginBottom:6 }}>
              CHIEF COMPLAINT *
            </label>
            <textarea
              rows={4}
              style={{
                width:'100%', padding:'12px 14px', borderRadius:8,
                background:'#0f172a', border:'1px solid #334155',
                color:'#fff', fontSize:13, resize:'vertical',
                outline:'none', boxSizing:'border-box', fontFamily:'inherit',
              }}
              placeholder="e.g. I have headache and fever since yesterday morning. Also having body pain."
              value={form.complaint}
              onChange={e => set('complaint', e.target.value)}
            />

            <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', display:'block', marginTop:14, marginBottom:6 }}>
              HOW LONG?
            </label>
            <input
              style={{
                width:'100%', padding:'10px 14px', borderRadius:8,
                background:'#0f172a', border:'1px solid #334155',
                color:'#fff', fontSize:13, outline:'none', boxSizing:'border-box',
              }}
              placeholder="e.g. 2 days, since this morning"
              value={form.duration}
              onChange={e => set('duration', e.target.value)}
            />

            <label style={{ fontSize:11, fontWeight:700, color:'#94a3b8', display:'block', marginTop:14, marginBottom:8 }}>
              HOW BAD IS IT?
            </label>
            <div style={{ display:'flex', gap:8 }}>
              {SEVERITY.map(s => (
                <button key={s.value}
                  onClick={() => set('severity', s.value)}
                  style={{
                    flex:1, padding:'10px 6px', borderRadius:8, cursor:'pointer',
                    border: form.severity === s.value ? `2px solid ${s.color}` : '2px solid #334155',
                    background: form.severity === s.value ? `${s.color}22` : '#0f172a',
                    textAlign:'center', transition:'all .15s',
                  }}>
                  <div style={{ fontSize:11, fontWeight:800, color: form.severity===s.value ? s.color : '#94a3b8' }}>{s.label}</div>
                  <div style={{ fontSize:9, color:'#64748b', marginTop:2 }}>{s.desc}</div>
                </button>
              ))}
            </div>

            {error && <div style={{ color:'#f87171', fontSize:12, fontWeight:600, marginTop:10 }}>{error}</div>}

            <div style={{ display:'flex', gap:8, marginTop:20 }}>
              <button onClick={() => setStep(0)} style={{
                flex:1, padding:'12px', background:'#334155', color:'#fff',
                border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
              }}>← Back</button>
              <button onClick={handleSubmit} disabled={saving} style={{
                flex:2, padding:'12px', background:'#1d4ed8', color:'#fff',
                border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Submitting…' : '🏥 Report to clinic'}
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Success ── */}
        {step === 2 && result && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:800, fontSize:18, color:'#fff', marginBottom:8 }}>
              Report submitted!
            </div>
            <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.7, marginBottom:20 }}>
              Hello <strong style={{ color:'#fff' }}>{result.patient.firstName}</strong>,
              your report has been received. Please come to the clinic — the nurse will attend to you.
            </div>
            <div style={{
              background:'#0f172a', borderRadius:10, padding:'14px 16px',
              border:'1px solid #1d4ed8', marginBottom:20, textAlign:'left',
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#64748b', marginBottom:6 }}>YOUR REFERENCE</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{result.patient.emrNumber}</div>
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
                Severity: <span style={{
                  color: form.severity==='severe'?'#ef4444':form.severity==='moderate'?'#f59e0b':'#22c55e',
                  fontWeight:700, textTransform:'capitalize',
                }}>{form.severity}</span>
              </div>
            </div>
            <div style={{ fontSize:12, color:'#f59e0b', fontWeight:600 }}>
              ⚠ If this is a medical emergency, go directly to the clinic or call for help.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
