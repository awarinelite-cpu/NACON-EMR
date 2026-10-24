// src/components/nurse/ShiftPatientCards.jsx
// One dropdown card per patient seen during the shift (1700hrs → 0600hrs next
// day). Closed card = patient name. Open card = patient info + everything that
// shows on that patient's visit timeline during the shift. Clicking outside
// the open card closes it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { listenPatients, listenShiftActivity, formatTime, formatTs } from '../../lib/emr';

const COLOR = { note:'#2E7FDB', vitals:'#E53935', rx:'#1A7A4A', fluid:'#0288D1', glucose:'#F57C00', lab:'#0E7490', upload:'#6C3CE1', admit:'#a855f7', discharge:'#64748B', referral:'#F59E0B' };
const ICON  = { note:'ti-notes-medical', vitals:'ti-heart-rate-monitor', rx:'ti-pill', fluid:'ti-droplet', glucose:'ti-activity', lab:'ti-microscope', upload:'ti-upload', admit:'ti-bed', discharge:'ti-door-exit', referral:'ti-transfer' };
const TITLE = { note:'Clinical note', vitals:'Vitals recorded', rx:'Prescription', fluid:'Fluid entry', glucose:'Glucose reading', lab:'Lab result', upload:'File uploaded', admit:'Admitted to sick bay', discharge:'Discharged', referral:'Transferred / referred' };

function describe(item) {
  const d = item.data;
  switch (item.type) {
    case 'note':
      return `${d.authorRole === 'doctor' ? "Doctor's note" : 'Nursing note'}: ${d.text || ''}`;
    case 'vitals':
      return [d.sbp != null && `BP ${d.sbp}/${d.dbp}`, d.hr != null && `HR ${d.hr}`, d.temp != null && `Temp ${d.temp}°C`,
              d.rr != null && `RR ${d.rr}`, d.spo2 != null && `SpO₂ ${d.spo2}%`, d.weight && `Wt ${d.weight}kg`].filter(Boolean).join(' · ');
    case 'rx':
      return (d.drugs || []).map(x => [x.drug, x.dose, x.frequency, x.duration].filter(Boolean).join(' ')).join('\n');
    case 'fluid':
      return `In: ${d.intakeAmt || 0}ml${d.intakeType ? ` (${d.intakeType})` : ''} · Out: ${d.outputAmt || 0}ml${d.outputType ? ` (${d.outputType})` : ''}`;
    case 'glucose':
      return `${d.reading} ${d.unit || 'mmol/L'}${d.context ? ` (${d.context})` : ''}${d.remark ? ` — ${d.remark}` : ''}`;
    case 'lab': {
      const entries = Object.entries(d.results || {});
      if (!entries.length) return (d.tests || []).join(', ');
      return entries.map(([t, r]) => `${t} ${r.value ?? '—'}${r.unit ? ' ' + r.unit : ''}${r.flag === 'high' || r.flag === 'low' ? ` (${r.flag})` : ''}`).join(' · ');
    }
    case 'upload':
      return `File: ${d.fileName}`;
    case 'admit':
      return 'Admitted to sick bay';
    case 'discharge':
      return d.dischargeNote ? `Discharge note: ${d.dischargeNote}` : 'Discharged from sick bay';
    case 'referral':
      return [d.to && `To: ${d.to}`, d.purpose && `Purpose: ${d.purpose}`, d.clinicalNotes && `Notes: ${d.clinicalNotes}`].filter(Boolean).join('\n') || 'Transferred / referred';
    default: return '';
  }
}
const byOf = (item) => item.type === 'note' ? item.data.authorName
  : item.data.recordedBy || item.data.prescribedBy || item.data.resultEnteredBy || item.data.uploadedBy || item.data.admittedBy || item.data.dischargedBy || item.data.referredBy || '';

export default function ShiftPatientCards({ start, end }) {
  const [patients, setPatients] = useState([]);
  const [items,    setItems]    = useState([]);
  const [loaded,   setLoaded]   = useState(false);
  const [openEmr,  setOpenEmr]  = useState(null);
  const openRef = useRef(null);
  const startMs = start.getTime(), endMs = end.getTime();

  useEffect(() => listenPatients(setPatients), []);
  useEffect(() => {
    setLoaded(false);
    return listenShiftActivity(new Date(startMs), new Date(endMs), list => { setItems(list); setLoaded(true); });
  }, [startMs, endMs]);

  // Close the open card when clicking/tapping anywhere outside it
  useEffect(() => {
    if (!openEmr) return undefined;
    const onDown = (e) => { if (openRef.current && !openRef.current.contains(e.target)) setOpenEmr(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown); };
  }, [openEmr]);

  const cards = useMemo(() => {
    const map = new Map();
    items.forEach(it => {
      const k = it.data.emrNumber;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    });
    const pById = new Map(patients.map(p => [p.emrNumber, p]));
    return [...map.entries()].map(([emr, events]) => ({ emr, events, patient: pById.get(emr) }))
      .sort((a, b) => (a.patient?.surname || a.emr).localeCompare(b.patient?.surname || b.emr));
  }, [items, patients]);

  const nameOf = (c) => {
    if (!c.patient) return c.emr;
    const nm = `${c.patient.surname || ''} ${c.patient.firstName || ''} ${c.patient.otherNames || ''}`.replace(/\s+/g, ' ').trim();
    return c.patient.folderNumber ? `${nm} (${c.patient.folderNumber})` : nm;
  };

  const badgeOf = (c) => {
    const types = new Set(c.events.map(e => e.type));
    if (types.has('discharge')) return 'Discharge';
    if (types.has('referral'))  return 'Int Trans Out';
    const reg = c.patient?.registeredAt;
    const regMs = reg?.toDate ? reg.toDate().getTime() : (reg?.seconds ? reg.seconds * 1000 : 0);
    if (regMs >= startMs && regMs <= endMs) return 'New Patient';
    if (types.has('admit')) return 'Admitted';
    return '';
  };

  return (
    <div style={{ margin:'14px 0' }}>
      <div style={{ fontWeight:800, fontSize:13, color:'var(--t2)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:10 }}>
        Patients seen this shift {loaded ? `(${cards.length})` : ''}
      </div>
      {!loaded && <div style={{ color:'var(--t3)', fontWeight:700, padding:'8px 0' }}>Loading…</div>}
      {loaded && cards.length === 0 && (
        <div style={{ color:'var(--t3)', fontWeight:700, padding:'8px 0' }}>No patient activity recorded for this shift yet</div>
      )}
      {cards.map((c, idx) => {
        const open = openEmr === c.emr;
        const p = c.patient;
        const badge = badgeOf(c);
        return (
          <div key={c.emr} ref={open ? openRef : null} className={`shift-card${open ? ' is-open' : ''}`}>
            <button type="button" className="shift-card-head" onClick={() => setOpenEmr(open ? null : c.emr)} aria-expanded={open}>
              <span className="shift-card-num">{idx + 1}.</span>
              <span className="shift-card-name">{nameOf(c)}</span>
              {badge && <span className="shift-card-badge">{badge}</span>}
              <span className="shift-card-arrow" aria-hidden="true">▼</span>
            </button>
            {open && (
              <div className="shift-card-body">
                {p && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px', fontSize:13, margin:'12px 0', color:'var(--t2)' }}>
                    <div><b>EMR No:</b> {p.emrNumber}</div>
                    <div><b>Folder:</b> {p.folderNumber || '—'}</div>
                    <div><b>Set:</b> {p.classSet || '—'}</div>
                    <div><b>Sex:</b> {p.sex || '—'}</div>
                    <div><b>Status:</b> {p.status || '—'}</div>
                    {p.knownAllergies && <div style={{ color:'var(--danger)', fontWeight:700 }}>⚠ {p.knownAllergies}</div>}
                  </div>
                )}
                {!p && <div style={{ fontSize:13, margin:'12px 0', color:'var(--t2)' }}><b>EMR No:</b> {c.emr}</div>}
                {c.events.map((it, i) => (
                  <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderTop: i ? '1px dashed var(--border)' : 'none' }}>
                    <i className={`ti ${ICON[it.type]}`} style={{ color:COLOR[it.type], fontSize:18, marginTop:2 }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                        <span style={{ fontWeight:800, fontSize:13, color:'var(--t1)' }}>{TITLE[it.type]}</span>
                        <span style={{ fontSize:12, color:'var(--t3)', whiteSpace:'nowrap' }}>{formatTs(it.ts)} {formatTime(it.ts)}</span>
                      </div>
                      <div style={{ fontSize:13, color:'var(--t1)', whiteSpace:'pre-wrap', overflowWrap:'anywhere', marginTop:2 }}>{describe(it)}</div>
                      {byOf(it) && <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>{byOf(it)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
