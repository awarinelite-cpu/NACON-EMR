// src/components/patients/CareSummaryDocument.jsx
// ─────────────────────────────────────────────
// Compiles a patient's care record into separate documents:
//   - One "Admission Summary" document per admission→discharge episode
//     (an ongoing admission summarises admission-to-date).
//   - Within each episode, one dated 24-hour document per calendar day
//     spent on admission. Discharge details (discharged at/by, discharge
//     note) only appear on the final day-document of a discharged episode
//     — never on earlier days.
//   - Any care recorded outside an admission (never admitted, or between
//     episodes) is grouped into its own dated 24-hour documents too.
// Every document can be viewed, printed, and shared via WhatsApp / any
// share target the device supports.
// ─────────────────────────────────────────────
import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getVisits, formatTs, formatDateTime } from '../../lib/emr';

const DAY_MS = 24 * 3600 * 1000;

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

// Split [start, end] into calendar-day buckets. First/last buckets are
// clipped to start/end rather than snapped to midnight, so nothing outside
// the actual admission window is ever included.
function buildDayBuckets(start, end) {
  const buckets = [];
  let cursor = start;
  while (cursor < end) {
    const d = new Date(cursor);
    d.setHours(24, 0, 0, 0); // next local midnight after cursor
    const bucketEnd = Math.min(d.getTime(), end);
    buckets.push({ start: cursor, end: bucketEnd });
    cursor = bucketEnd;
  }
  return buckets.length ? buckets : [{ start, end }];
}

export default function CareSummaryDocument({
  open, onClose, patient, emrNumber, compiledBy,
  notes = [], vitals = [], rx = [], fluid = [], glucose = [],
  carePlans = [], labRequests = [], labResults = [], marRecords = [], uploads = [],
}) {
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [documents, setDocuments] = useState([]);   // admission episode groups
  const [outpatient, setOutpatient] = useState([]); // day-documents outside any episode
  const [expanded, setExpanded] = useState({});     // which episode groups are expanded
  const [selected, setSelected] = useState(null);   // the currently-open document
  const printRef = useRef(null);

  // ── Build the document list: one per admission episode (+ its daily
  // breakdown), plus dated day-documents for anything outside an episode. ──
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoadingDocs(true);
      try {
        const visits = await getVisits(emrNumber);
        // Admission and discharge events are read as a flat timeline across
        // ALL of this patient's visit docs (not just matched pairs on a single
        // doc) — a patient's chart may have been reopened between the admit
        // and discharge actions, sending each timestamp to a different visit
        // record. Pairing chronologically here means every completed stay
        // still resolves to one correct episode either way.
        const admits = visits
          .filter(v => v.admittedAt)
          .map(v => ({ t: tsMs(v.admittedAt), by: v.admittedBy || '—' }))
          .sort((a, b) => a.t - b.t);
        const discharges = visits
          .filter(v => v.dischargedAt)
          .map(v => ({ t: tsMs(v.dischargedAt), by: v.dischargedBy || null, note: v.dischargeNote || null }))
          .sort((a, b) => a.t - b.t);

        const episodes = [];
        let dIdx = 0;
        for (let i = 0; i < admits.length; i++) {
          const admittedAt = admits[i].t;
          const nextAdmit = admits[i + 1]?.t ?? Infinity;
          while (dIdx < discharges.length && discharges[dIdx].t < admittedAt) dIdx++; // skip stale/earlier discharge events
          let matched = null;
          if (dIdx < discharges.length && discharges[dIdx].t < nextAdmit) {
            matched = discharges[dIdx];
            dIdx++;
          }
          episodes.push({
            admittedAt, admittedBy: admits[i].by,
            dischargedAt: matched?.t || null,
            dischargedBy: matched?.by || null,
            dischargeNote: matched?.note || patient?.dischargeNote || null,
            ongoing: !matched,
          });
        }

        const groups = episodes.map((ep, i) => {
          const end = ep.dischargedAt || Date.now();
          const buckets = buildDayBuckets(ep.admittedAt, end);
          const days = buckets.map((b, j) => ({
            type: 'day',
            key: `ep${i}-day${j}`,
            label: formatTs(b.start),
            sublabel: `Day ${j + 1}`,
            range: b,
            admittedAt: ep.admittedAt, admittedBy: ep.admittedBy,
            // Discharge details only surface on this episode's final day-document.
            showDischarge: !ep.ongoing && j === buckets.length - 1,
            dischargedAt: ep.dischargedAt, dischargedBy: ep.dischargedBy, dischargeNote: ep.dischargeNote,
          }));
          return {
            type: 'episode',
            key: `ep${i}`,
            label: ep.ongoing
              ? `Admission — ${formatTs(ep.admittedAt)} to date`
              : `Admission — ${formatTs(ep.admittedAt)} to ${formatTs(ep.dischargedAt)}`,
            status: ep.ongoing ? 'Ongoing' : 'Discharged',
            summaryDoc: {
              type: 'episode-summary',
              key: `ep${i}-summary`,
              label: ep.ongoing ? 'Admission Summary (to date)' : 'Discharge Summary',
              range: { start: ep.admittedAt, end },
              admittedAt: ep.admittedAt, admittedBy: ep.admittedBy,
              showDischarge: !ep.ongoing,
              dischargedAt: ep.dischargedAt, dischargedBy: ep.dischargedBy, dischargeNote: ep.dischargeNote,
            },
            days,
          };
        }).reverse(); // most recent admission first

        // Days not covered by any admission episode (outpatient care) — grouped
        // by calendar date, each its own document.
        const episodeRanges = episodes.map(ep => [ep.admittedAt, ep.dischargedAt || Date.now()]);
        const withinEpisode = (t) => episodeRanges.some(([s, e]) => t >= s && t <= e);
        const allTs = [
          ...notes.map(x => tsMs(x.createdAt)),
          ...vitals.map(x => tsMs(x.recordedAt)),
          ...rx.map(x => tsMs(x.createdAt)),
          ...fluid.map(x => tsMs(x.recordedAt)),
          ...glucose.map(x => tsMs(x.recordedAt)),
          ...carePlans.map(x => tsMs(x.createdAt)),
          ...marRecords.map(x => tsMs(x.createdAt)),
          ...labRequests.map(x => tsMs(x.createdAt)),
          ...uploads.map(x => tsMs(x.uploadedAt)),
        ].filter(t => t > 0 && !withinEpisode(t));

        const outpatientDateKeys = Array.from(new Set(allTs.map(t => {
          const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime();
        }))).sort((a, b) => b - a); // most recent first

        const outpatientDays = outpatientDateKeys.map((dayStart, j) => ({
          type: 'day',
          key: `op-day${j}`,
          label: formatTs(dayStart),
          sublabel: null,
          range: { start: dayStart, end: dayStart + DAY_MS },
          showDischarge: false,
        }));

        setDocuments(groups);
        setExpanded(groups.length ? { [groups[0].key]: true } : {});
        setOutpatient(outpatientDays);
      } catch (e) {
        console.error('CareSummaryDocument: failed to build document list', e);
        toast.error('Could not load documents');
      }
      setLoadingDocs(false);
    })();
  }, [open, emrNumber]);

  if (!open) return null;

  const inRange = (ts, r) => {
    const t = tsMs(ts);
    return t >= r.start && t <= r.end;
  };

  const openDoc = (doc) => setSelected(doc);
  const backToList = () => setSelected(null);
  const toggleGroup = (key) => setExpanded(e => ({ ...e, [key]: !e[key] }));

  // ── Filter data for the currently selected document's range ──
  const range = selected?.range || { start: 0, end: 0 };
  const fNotes     = notes.filter(n => inRange(n.createdAt, range)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fVitals    = vitals.filter(v => inRange(v.recordedAt, range)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fRx        = rx.filter(r => inRange(r.createdAt, range)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fFluid     = fluid.filter(f => inRange(f.recordedAt, range)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fGlucose   = glucose.filter(g => inRange(g.recordedAt, range)).sort((a,b)=>tsMs(a.recordedAt)-tsMs(b.recordedAt));
  const fCarePlans = carePlans.filter(c => inRange(c.createdAt, range)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fMAR       = marRecords.filter(m => inRange(m.createdAt, range)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fLabReq    = labRequests.filter(l => inRange(l.createdAt, range)).sort((a,b)=>tsMs(a.createdAt)-tsMs(b.createdAt));
  const fUploads   = uploads.filter(u => inRange(u.uploadedAt, range)).sort((a,b)=>tsMs(a.uploadedAt)-tsMs(b.uploadedAt));

  const patientName = `${patient?.surname || ''} ${patient?.firstName || ''} ${patient?.otherNames || ''}`.trim();
  const docTitle = selected ? (selected.type === 'episode-summary' ? selected.label : `24-Hour Report — ${selected.label}`) : '';
  const periodLabel = selected ? `${formatDateTime(range.start)} — ${formatDateTime(range.end)}` : '';

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
    if (selected?.showDischarge) {
      L.push('*Discharge*');
      L.push(`Discharged: ${formatDateTime(selected.dischargedAt)} by ${selected.dischargedBy || '—'}`);
      if (selected.dischargeNote) L.push(`Note: ${selected.dischargeNote}`);
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
          {selected && (
            <button onClick={backToList} style={{
              background:'none', border:'1px solid var(--border)', borderRadius:8,
              padding:'5px 10px', cursor:'pointer', color:'var(--t2)', fontWeight:700, fontSize:11,
            }}>
              <i className="ti ti-arrow-left" /> Documents
            </button>
          )}
          <div style={{ fontWeight:800, fontSize:13, color:'var(--t1)', flex:'1 1 auto' }}>
            <i className="ti ti-file-description" /> {selected ? docTitle : 'Patient Care Documents'}
          </div>
          {selected && (
            <>
              <button onClick={handlePrint} className="btn btn-sm">
                <i className="ti ti-printer" /> Print
              </button>
              <button onClick={handleShare} className="btn btn-sm">
                <i className="ti ti-brand-whatsapp" /> Share
              </button>
            </>
          )}
          <button onClick={onClose} style={{
            background:'none', border:'1px solid var(--border)', borderRadius:8,
            padding:'5px 10px', cursor:'pointer', color:'var(--t2)', fontWeight:700, fontSize:11,
          }}>
            <i className="ti ti-x" /> Close
          </button>
        </div>

        {/* ── DOCUMENT LIST (picker) ── */}
        {!selected && (
          <div style={{ overflowY:'auto', padding:'12px 14px' }}>
            {loadingDocs && <div style={{ textAlign:'center', color:'var(--t3)', padding:20 }}>Loading documents…</div>}

            {!loadingDocs && documents.length === 0 && outpatient.length === 0 && (
              <div style={{ textAlign:'center', color:'var(--t3)', padding:20 }}>Nothing recorded for this patient yet.</div>
            )}

            {documents.map(group => (
              <div key={group.key} className="card" style={{ marginBottom:10 }}>
                <div className="card-header" style={{ cursor:'pointer' }} onClick={() => toggleGroup(group.key)}>
                  <div className="card-title">
                    <i className={`ti ${group.status==='Ongoing' ? 'ti-bed' : 'ti-logout'}`} />
                    {group.label}
                    <span className="badge" style={{ marginLeft:8 }}>{group.status}</span>
                  </div>
                  <i className={`ti ${expanded[group.key] ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
                </div>
                {expanded[group.key] && (
                  <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <button onClick={() => openDoc(group.summaryDoc)} className="btn btn-sm" style={{ justifyContent:'flex-start' }}>
                      <i className="ti ti-file-text" /> {group.summaryDoc.label}
                    </button>
                    {group.days.map(d => (
                      <button key={d.key} onClick={() => openDoc(d)} className="btn btn-sm"
                        style={{ justifyContent:'flex-start', background:'none', border:'1px solid var(--border)', color:'var(--t2)' }}>
                        <i className="ti ti-calendar-event" /> {d.sublabel} — {d.label}
                        {d.showDischarge && <span className="badge badge-info" style={{ marginLeft:6 }}>Discharge day</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {outpatient.length > 0 && (
              <div className="card">
                <div className="card-header"><div className="card-title"><i className="ti ti-stethoscope" />Outpatient Records</div></div>
                <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {outpatient.map(d => (
                    <button key={d.key} onClick={() => openDoc(d)} className="btn btn-sm"
                      style={{ justifyContent:'flex-start', background:'none', border:'1px solid var(--border)', color:'var(--t2)' }}>
                      <i className="ti ti-calendar-event" /> {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DOCUMENT PREVIEW ── */}
        {selected && (
          <div style={{ overflowY:'auto', padding:'16px 18px', background:'#fff', color:'#111' }}>
            <div ref={printRef}>
              <h1>{docTitle}</h1>
              <div className="meta">{patientName} &nbsp;·&nbsp; EMR {emrNumber} &nbsp;·&nbsp; {patient?.classSet} &nbsp;·&nbsp; {patient?.folderNumber}</div>
              <div className="meta">DOB: {patient?.dob || '—'} ({age(patient?.dob)}) &nbsp;·&nbsp; Sex: {patient?.sex || '—'} &nbsp;·&nbsp; Blood Group: {patient?.bloodGroup || '—'}</div>
              {patient?.allergies && <div className="meta" style={{ color:'#b91c1c', fontWeight:700 }}>Allergies: {patient.allergies}</div>}
              <div className="meta" style={{ marginTop:4, fontWeight:700 }}>Period covered: {periodLabel}</div>
              {selected.admittedAt != null && (
                <div className="meta">Admitted: {formatDateTime(selected.admittedAt)} by {selected.admittedBy || '—'}</div>
              )}
              {selected.showDischarge && (
                <div className="meta">
                  Discharged: {formatDateTime(selected.dischargedAt)} by {selected.dischargedBy || '—'}
                  {selected.dischargeNote && <div>Discharge note: {selected.dischargeNote}</div>}
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
        )}
      </div>
    </div>
  );
}
