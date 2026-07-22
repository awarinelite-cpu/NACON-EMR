// src/components/patients/CareSummaryDocument.jsx
// ─────────────────────────────────────────────
// Compiles everything recorded for a patient into one document:
//   - "24-Hour Report"  → all care events in the last 24 hours
//   - "Full Summary"    → everything from admission to discharge
//     (or admission-to-now if still on admission)
// Can be viewed on screen, printed, and shared via WhatsApp / any
// share target the device supports.
// ─────────────────────────────────────────────
import React, { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getVisits, formatTs, formatTime, formatDateTime } from '../../lib/emr';

const tsMs = (ts) => {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

const age = (dob) => {
  if (!dob) return '';
  const a = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
  return isNaN(a) ? '' : a;
};

export default function CareSummaryDocument({
  open, onClose, patient, emrNumber, compiledBy,
  notes = [], vitals = [], rx = [], fluid = [], glucose = [],
  carePlans = [], labRequests = [], labResults = [], marRecords = [], uploads = [],
}) {
  const wasAdmitted = !!patient?.admittedAt;
  const [scope, setScope] = useState(patient?.status === 'discharged' ? 'full' : '24h');
  const [visit, setVisit] = useState(null); // most recent visit doc — for dischargedAt
  const printRef = useRef(null);

  useEffect(() => {
    if (!open || !wasAdmitted) return;
    (async () => {
      try {
        const visits = await getVisits(emrNumber);
        const relevant = visits.find(v => v.status === 'discharged' || v.status === 'sickbay') || visits[0];
        setVisit(relevant || null);
      } catch (e) {
        console.error('CareSummaryDocument: getVisits failed', e);
      }
    })();
  }, [open, wasAdmitted, emrNumber]);

  if (!open) return null;

  const now = Date.now();
  const rangeStart = scope === '24h' ? now - 24 * 3600 * 1000 : (tsMs(patient?.admittedAt) || 0);
  const rangeEnd   = scope === '24h' ? now : (patient?.status === 'discharged' ? (tsMs(visit?.dischargedAt) || now) : now);

  const inRange = (ts) => {
    const t = tsMs(ts);
    return t >= rangeStart && t <= rangeEnd;
  };

  const fNotes    = notes.filter(n => inRange(n.createdAt)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fVitals   = vitals.filter(v => inRange(v.recordedAt)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fRx       = rx.filter(r => inRange(r.createdAt)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fFluid    = fluid.filter(f => inRange(f.recordedAt)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fGlucose  = glucose.filter(g => inRange(g.recordedAt)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fCarePlans= carePlans.filter(c => inRange(c.createdAt)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fMAR      = marRecords.filter(m => inRange(m.createdAt)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fLabReq   = labRequests.filter(l => inRange(l.createdAt)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fUploads  = uploads.filter(u => inRange(u.uploadedAt)).sort((a,b)=>tsMs(a.uploadedAt)-tsMs(b.uploadedAt));

  const patientName = `${patient?.surname || ''} ${patient?.firstName || ''} ${patient?.otherNames || ''}`.trim();
  const docTitle = scope === 'full'
    ? (patient?.status === 'discharged' ? 'Discharge Summary' : 'Full Admission Summary')
    : '24-Hour Care Report';

  const periodLabel = scope === '24h'
    ? `${formatDateTime(rangeStart)} — ${formatDateTime(rangeEnd)}`
    : (wasAdmitted ? `${formatDateTime(patient.admittedAt)} — ${patient?.status==='discharged' && visit?.dischargedAt ? formatDateTime(visit.dischargedAt) : 'Present'}` : 'No admission on record');

  // ── Plain-text version, for WhatsApp / native share ──
  const buildShareText = () => {
    const L = [];
    L.push(`*${docTitle} — ${patientName}*`);
    L.push(`EMR: ${emrNumber}  ·  ${patient?.classSet || ''}`);
    L.push(`Period: ${periodLabel}`);
    L.push('');
    if (fVitals.length) {
      L.push('*Vitals*');
      fVitals.forEach(v => L.push(`${formatDateTime(v.recordedAt)} — BP ${v.sbp}/${v.dbp}, HR ${v.hr}, Temp ${v.temp}°C, SpO2 ${v.spo2}%, RR ${v.rr || '-'}`));
      L.push('');
    }
    if (fNotes.length) {
      L.push('*Clinical Notes*');
      fNotes.forEach(n => L.push(`${formatDateTime(n.createdAt)} (${n.authorRole}, ${n.authorName}): ${n.text}`));
      L.push('');
    }
    if (fCarePlans.length) {
      L.push('*Nursing Care Plans*');
      fCarePlans.forEach(c => L.push(`- ${c.nursingDiagnosis} — Goal: ${c.goal} — Status: ${c.status}`));
      L.push('');
    }
    if (fRx.length) {
      L.push('*Prescriptions*');
      fRx.forEach(r => (r.drugs||[]).forEach(d => L.push(`${d.drug} ${d.dose} ${d.frequency} x${d.duration} (by ${r.prescribedBy})`)));
      L.push('');
    }
    if (fMAR.length) {
      L.push('*Medication Administration*');
      fMAR.forEach(m => L.push(`${formatDateTime(m.createdAt)} — ${m.drug} ${m.dose} ${m.route} — ${m.status} (${m.administeredBy})`));
      L.push('');
    }
    if (fFluid.length) {
      L.push('*Fluid I/O*');
      fFluid.forEach(f => L.push(`${formatDateTime(f.recordedAt)} — In: ${f.intakeAmt||0}ml ${f.intakeType||''} / Out: ${f.outputAmt||0}ml ${f.outputType||''}`));
      L.push('');
    }
    if (fGlucose.length) {
      L.push('*Blood Glucose*');
      fGlucose.forEach(g => L.push(`${formatDateTime(g.recordedAt)} — ${g.reading} ${g.unit||'mmol/L'} (${g.context||''})`));
      L.push('');
    }
    if (fLabReq.length) {
      L.push('*Lab*');
      fLabReq.forEach(l => L.push(`${formatDateTime(l.createdAt)} — ${(l.tests||[]).join(', ')} — ${l.status}`));
      L.push('');
    }
    if (fUploads.length) {
      L.push('*Uploaded Files*');
      fUploads.forEach(u => L.push(`${u.fileName} (${u.category}) — ${formatDateTime(u.uploadedAt)}`));
      L.push('');
    }
    L.push(`Compiled by ${compiledBy || 'NACON-EMR'} on ${formatDateTime(new Date())}`);
    return L.join('\n');
  };

  const handleShare = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({ title: `${docTitle} — ${patientName}`, text });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // user cancelled — do nothing
      }
    }
    // Fallback: open WhatsApp with the text pre-filled
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank', 'width=860,height=900');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>${docTitle} — ${patientName}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:24px;background:#fff}
        h1{font-size:18px;margin:0 0 2px}
        h2{font-size:13px;margin:18px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}
        table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}
        th,td{border:1px solid #999;padding:4px 6px;text-align:left;vertical-align:top}
        th{background:#eee}
        .meta{font-size:11px;color:#333;margin-bottom:2px}
        .entry{font-size:11px;padding:5px 0;border-bottom:1px solid #ddd}
        .tag{display:inline-block;font-size:9px;font-weight:bold;padding:1px 6px;border:1px solid #999;border-radius:10px;margin-right:6px}
        @media print{body{padding:8px}}
      </style></head><body>${el.innerHTML}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => w.print(), 400);
  };

  const Section = ({ title, children }) => (
    <>
      <h2>{title}</h2>
      {children}
    </>
  );

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:200,
      display:'flex', alignItems:'center', justifyContent:'center', padding:12,
    }}>
      <div style={{
        background:'var(--card-bg,#fff)', borderRadius:12, width:'100%', maxWidth:760,
        maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          display:'flex', alignItems:'center', gap:8, padding:'10px 14px',
          borderBottom:'1px solid var(--border)', flexWrap:'wrap',
        }}>
          <div style={{ fontWeight:800, fontSize:13, color:'var(--t1)', flex:'1 1 auto' }}>
            <i className="ti ti-file-description" /> {docTitle}
          </div>
          {wasAdmitted && (
            <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
              <button onClick={() => setScope('24h')} style={{
                border:'none', padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                background: scope==='24h' ? 'var(--accent)' : 'transparent',
                color: scope==='24h' ? '#fff' : 'var(--t2)',
              }}>24-Hour</button>
              <button onClick={() => setScope('full')} style={{
                border:'none', padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
                background: scope==='full' ? 'var(--accent)' : 'transparent',
                color: scope==='full' ? '#fff' : 'var(--t2)',
              }}>{patient?.status==='discharged' ? 'Full Stay' : 'Since Admission'}</button>
            </div>
          )}
          <button onClick={handlePrint} className="btn btn-sm">
            <i className="ti ti-printer" /> Print
          </button>
          <button onClick={handleShare} className="btn btn-sm">
            <i className="ti ti-brand-whatsapp" /> Share
          </button>
          <button onClick={onClose} style={{
            background:'none', border:'1px solid var(--border)', borderRadius:8,
            padding:'5px 10px', cursor:'pointer', color:'var(--t2)', fontWeight:700, fontSize:11,
          }}>
            <i className="ti ti-x" /> Close
          </button>
        </div>

        {/* Document preview */}
        <div style={{ overflowY:'auto', padding:'16px 18px', background:'#fff', color:'#111' }}>
          <div ref={printRef}>
            <h1>{docTitle}</h1>
            <div className="meta">{patientName} &nbsp;·&nbsp; EMR {emrNumber} &nbsp;·&nbsp; {patient?.classSet} &nbsp;·&nbsp; {patient?.folderNumber}</div>
            <div className="meta">DOB: {patient?.dob || '—'} ({age(patient?.dob)}) &nbsp;·&nbsp; Sex: {patient?.sex || '—'} &nbsp;·&nbsp; Blood Group: {patient?.bloodGroup || '—'}</div>
            {patient?.allergies && <div className="meta" style={{ color:'#b91c1c', fontWeight:700 }}>Allergies: {patient.allergies}</div>}
            <div className="meta" style={{ marginTop:4, fontWeight:700 }}>Period covered: {periodLabel}</div>
            {wasAdmitted && (
              <div className="meta">
                Admitted: {formatDateTime(patient.admittedAt)} by {patient.admittedBy || '—'}
                {patient?.status === 'discharged' && visit?.dischargedAt && <> &nbsp;·&nbsp; Discharged: {formatDateTime(visit.dischargedAt)} by {visit.dischargedBy || '—'}</>}
                {patient?.dischargeNote && <div>Discharge note: {patient.dischargeNote}</div>}
              </div>
            )}

            <Section title="Vitals">
              {fVitals.length ? (
                <table><thead><tr><th>Time</th><th>BP</th><th>HR</th><th>Temp</th><th>SpO₂</th><th>RR</th><th>By</th></tr></thead>
                  <tbody>{fVitals.map((v,i)=>(
                    <tr key={i}><td>{formatDateTime(v.recordedAt)}</td><td>{v.sbp}/{v.dbp}</td><td>{v.hr}</td><td>{v.temp}°C</td><td>{v.spo2}%</td><td>{v.rr||'—'}</td><td>{v.recordedBy}</td></tr>
                  ))}</tbody></table>
              ) : <div className="entry">No vitals recorded in this period.</div>}
            </Section>

            <Section title="Clinical Notes">
              {fNotes.length ? fNotes.map((n,i)=>(
                <div className="entry" key={i}><span className="tag">{n.authorRole}</span>{formatDateTime(n.createdAt)} — {n.authorName}<br/>{n.text}</div>
              )) : <div className="entry">No clinical notes in this period.</div>}
            </Section>

            <Section title="Nursing Care Plans">
              {fCarePlans.length ? fCarePlans.map((c,i)=>(
                <div className="entry" key={i}>
                  <b>{c.nursingDiagnosis}</b> — {c.status}<br/>
                  Assessment: {c.assessment}<br/>
                  Goal: {c.goal}<br/>
                  Interventions: {c.interventions}<br/>
                  {(c.evaluationLog||[]).map((e,j)=>(<div key={j}>Eval ({formatDateTime(e.at)}, {e.by}): {e.note}</div>))}
                </div>
              )) : <div className="entry">No care plans in this period.</div>}
            </Section>

            <Section title="Prescriptions">
              {fRx.length ? (
                <table><thead><tr><th>Time</th><th>Drug</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>By</th></tr></thead>
                  <tbody>{fRx.flatMap((r,i)=>(r.drugs||[]).map((d,j)=>(
                    <tr key={`${i}-${j}`}><td>{formatDateTime(r.createdAt)}</td><td>{d.drug}</td><td>{d.dose}</td><td>{d.frequency}</td><td>{d.duration}</td><td>{r.prescribedBy}</td></tr>
                  )))}</tbody></table>
              ) : <div className="entry">No prescriptions in this period.</div>}
            </Section>

            <Section title="Medication Administration Record (MAR)">
              {fMAR.length ? (
                <table><thead><tr><th>Time</th><th>Drug</th><th>Dose</th><th>Route</th><th>Status</th><th>By</th></tr></thead>
                  <tbody>{fMAR.map((m,i)=>(
                    <tr key={i}><td>{formatDateTime(m.createdAt)}</td><td>{m.drug}</td><td>{m.dose}</td><td>{m.route}</td><td>{m.status}</td><td>{m.administeredBy}</td></tr>
                  ))}</tbody></table>
              ) : <div className="entry">No medication administration recorded in this period.</div>}
            </Section>

            <Section title="Fluid Intake / Output">
              {fFluid.length ? (
                <table><thead><tr><th>Time</th><th>Intake</th><th>Output</th><th>By</th></tr></thead>
                  <tbody>{fFluid.map((f,i)=>(
                    <tr key={i}><td>{formatDateTime(f.recordedAt)}</td><td>{f.intakeAmt||0}ml {f.intakeType||''}</td><td>{f.outputAmt||0}ml {f.outputType||''}</td><td>{f.recordedBy}</td></tr>
                  ))}</tbody></table>
              ) : <div className="entry">No fluid chart entries in this period.</div>}
            </Section>

            <Section title="Blood Glucose">
              {fGlucose.length ? (
                <table><thead><tr><th>Time</th><th>Reading</th><th>Context</th><th>By</th></tr></thead>
                  <tbody>{fGlucose.map((g,i)=>(
                    <tr key={i}><td>{formatDateTime(g.recordedAt)}</td><td>{g.reading} {g.unit||'mmol/L'}</td><td>{g.context||'—'}</td><td>{g.recordedBy}</td></tr>
                  ))}</tbody></table>
              ) : <div className="entry">No glucose readings in this period.</div>}
            </Section>

            <Section title="Lab Requests & Results">
              {fLabReq.length ? fLabReq.map((l,i)=>{
                const result = labResults.find(r => r.requestId === l.id);
                return (
                  <div className="entry" key={i}>
                    {formatDateTime(l.createdAt)} — {(l.tests||[]).join(', ')} ({l.urgency}) — <b>{l.status}</b>
                    {result && <div>Result: {JSON.stringify(result.results)}</div>}
                  </div>
                );
              }) : <div className="entry">No lab requests in this period.</div>}
            </Section>

            <Section title="Uploaded Documents">
              {fUploads.length ? fUploads.map((u,i)=>(
                <div className="entry" key={i}>{u.fileName} ({u.category}) — {formatDateTime(u.uploadedAt)} — {u.uploadedBy}</div>
              )) : <div className="entry">No files uploaded in this period.</div>}
            </Section>

            <div className="meta" style={{ marginTop:16, fontStyle:'italic' }}>
              Compiled by {compiledBy || 'NACON-EMR'} on {formatDateTime(new Date())}. System-generated — NACON-EMR.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
