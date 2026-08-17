// src/components/patients/DischargeSummary.jsx
// Auto-compiles admission data into a structured discharge summary
// (diagnosis, hospital course, discharge meds, follow-up), editable before
// confirming discharge. Prints and shares like CareSummaryDocument.
import React, { useMemo, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { dischargePatient, formatTs, formatDateTime } from '../../lib/emr';
import { calculateNEWS2 } from './NewsScore';

const tsMs = (ts) => {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

export default function DischargeSummary({
  open, onClose, patient, emrNumber, visitId,
  vitals = [], glucose = [], fluid = [], rx = [],
  compiledBy, onDischarged,
}) {
  const printRef = useRef(null);
  const [saving, setSaving] = useState(false);

  // ── Auto-compiled hospital course ──
  const auto = useMemo(() => {
    const admittedAt = patient?.admittedAt || patient?.registeredAt;
    const admittedMs = tsMs(admittedAt);
    const days = admittedMs ? Math.max(1, Math.ceil((Date.now() - admittedMs) / (24 * 3600 * 1000))) : null;

    const sortedVitals = [...vitals].sort((a, b) => tsMs(a.recordedAt) - tsMs(b.recordedAt));
    const firstV = sortedVitals[0];
    const lastV = sortedVitals[sortedVitals.length - 1];
    const firstNews = firstV ? calculateNEWS2(firstV) : null;
    const lastNews = lastV ? calculateNEWS2(lastV) : null;

    const glucoseVals = glucose.map(g => parseFloat(g.reading)).filter(v => !isNaN(v));
    const glucoseSummary = glucoseVals.length
      ? `${glucose.length} glucose readings recorded, most recent ${glucose[glucose.length - 1]?.reading} ${glucose[glucose.length - 1]?.unit || 'mmol/L'}.`
      : null;

    const totalIn = fluid.reduce((s, f) => s + (parseInt(f.intakeAmt) || 0), 0);
    const totalOut = fluid.reduce((s, f) => s + (parseInt(f.outputAmt) || 0), 0);
    const fluidSummary = fluid.length
      ? `Fluid balance monitored: total intake ${totalIn}ml, total output ${totalOut}ml, net ${totalIn - totalOut >= 0 ? '+' : ''}${totalIn - totalOut}ml.`
      : null;

    const activeMeds = [];
    rx.forEach(r => (r.drugs || []).forEach(d => {
      if (d.drug?.trim()) activeMeds.push(`${d.drug} ${d.dose || ''} ${d.frequency || ''}`.trim());
    }));

    const courseLines = [];
    if (days) courseLines.push(`Patient was admitted for ${days} day${days > 1 ? 's' : ''}.`);
    if (firstNews && lastNews) {
      courseLines.push(`Initial NEWS2 score ${firstNews.total} (${firstNews.risk} risk), most recent NEWS2 score ${lastNews.total} (${lastNews.risk} risk).`);
    } else if (lastNews) {
      courseLines.push(`Most recent NEWS2 score ${lastNews.total} (${lastNews.risk} risk).`);
    }
    if (glucoseSummary) courseLines.push(glucoseSummary);
    if (fluidSummary) courseLines.push(fluidSummary);

    return {
      hospitalCourse: courseLines.join(' '),
      activeMeds,
      lastNews,
    };
  }, [patient, vitals, glucose, fluid, rx]);

  const [diagnosis, setDiagnosis] = useState(patient?.primaryDiagnosis || '');
  const [hospitalCourse, setHospitalCourse] = useState('');
  const [condition, setCondition] = useState('Stable, improved');
  const [dischargeMeds, setDischargeMeds] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [instructions, setInstructions] = useState('');

  // Populate editable fields from auto-compiled data the first time the modal opens
  const [populated, setPopulated] = useState(false);
  if (open && !populated) {
    setHospitalCourse(auto.hospitalCourse);
    setDischargeMeds(auto.activeMeds.join('\n'));
    setPopulated(true);
  }
  if (!open && populated) setPopulated(false);

  if (!open) return null;

  const patientName = `${patient?.surname || ''} ${patient?.firstName || ''} ${patient?.otherNames || ''}`.trim();

  const buildSummaryText = () => {
    const L = [];
    L.push(`DISCHARGE SUMMARY`);
    L.push(`Patient: ${patientName}  (${emrNumber})`);
    L.push(`DOB: ${patient?.dob || '—'}   Sex: ${patient?.sex || '—'}`);
    L.push(`Admitted: ${formatTs(patient?.admittedAt || patient?.registeredAt)}`);
    L.push(`Discharged: ${formatDateTime(new Date())}`);
    L.push('');
    L.push(`DIAGNOSIS: ${diagnosis || '—'}`);
    L.push('');
    L.push(`HOSPITAL COURSE:`);
    L.push(hospitalCourse || '—');
    L.push('');
    L.push(`CONDITION ON DISCHARGE: ${condition || '—'}`);
    L.push('');
    L.push(`DISCHARGE MEDICATIONS:`);
    L.push(dischargeMeds?.trim() ? dischargeMeds : 'None');
    L.push('');
    L.push(`FOLLOW-UP: ${followUp || '—'}`);
    if (instructions?.trim()) { L.push(''); L.push(`INSTRUCTIONS: ${instructions}`); }
    L.push('');
    L.push(`Compiled by: ${compiledBy || '—'}`);
    return L.join('\n');
  };

  const handleShare = async () => {
    const text = buildSummaryText();
    if (navigator.share) {
      try { await navigator.share({ title: `Discharge Summary — ${patientName}`, text }); return; } catch (_) {}
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open('', '_blank', 'width=860,height=900');
    if (!w) { toast.error('Pop-up blocked — allow pop-ups to print'); return; }
    w.document.write(`
      <html><head><title>Discharge Summary — ${patientName}</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111;line-height:1.5}
        h2{margin-bottom:4px} .section{margin-top:14px}
        .label{font-weight:800;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#555}
        .val{font-size:13px;white-space:pre-wrap}
        @media print{body{padding:8px}}
      </style></head><body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  const handleConfirmDischarge = async () => {
    if (patient.status !== 'sickbay') { toast.error('Only patients admitted to the sick bay can be discharged'); return; }
    if (!window.confirm('Confirm discharge with this summary?')) return;
    setSaving(true);
    try {
      await dischargePatient(emrNumber, visitId, buildSummaryText(), compiledBy, patient?.role);
      toast.success('Patient discharged with summary');
      onDischarged?.();
      onClose?.();
    } catch (e) { console.error('handleConfirmDischarge', e); toast.error(e?.message || 'Failed'); }
    setSaving(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '20px 12px',
    }}>
      <div style={{ background: 'var(--card-bg)', borderRadius: 14, width: '100%', maxWidth: 640, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Discharge Summary</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <i className="ti ti-x" style={{ fontSize: 20 }} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t3)', marginBottom: 14 }}>
          {patientName} · {emrNumber} · Admitted {formatTs(patient?.admittedAt || patient?.registeredAt)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Diagnosis</label>
            <input className="form-input" value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary diagnosis" />
          </div>
          <div className="form-group">
            <label className="form-label">Hospital course <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(auto-drafted from vitals, glucose, fluid — edit as needed)</span></label>
            <textarea className="form-textarea full-width" rows={4} value={hospitalCourse} onChange={e => setHospitalCourse(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Condition on discharge</label>
            <select className="form-select" value={condition} onChange={e => setCondition(e.target.value)}>
              {['Stable, improved', 'Stable, unchanged', 'Fully recovered', 'Discharged against medical advice', 'Referred for further management'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Discharge medications <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(auto-filled from active prescriptions — one per line)</span></label>
            <textarea className="form-textarea full-width" rows={3} value={dischargeMeds} onChange={e => setDischargeMeds(e.target.value)} placeholder="None" />
          </div>
          <div className="form-group">
            <label className="form-label">Follow-up plan</label>
            <input className="form-input" value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="e.g. Review in clinic in 1 week" />
          </div>
          <div className="form-group">
            <label className="form-label">Additional instructions</label>
            <textarea className="form-textarea full-width" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} />
          </div>
        </div>

        {/* Hidden printable view */}
        <div ref={printRef} style={{ display: 'none' }}>
          <h2>Discharge Summary</h2>
          <div>{patientName} ({emrNumber})</div>
          <div>DOB: {patient?.dob || '—'} &nbsp; Sex: {patient?.sex || '—'}</div>
          <div>Admitted: {formatTs(patient?.admittedAt || patient?.registeredAt)}</div>
          <div>Discharged: {formatDateTime(new Date())}</div>
          <div className="section"><div className="label">Diagnosis</div><div className="val">{diagnosis || '—'}</div></div>
          <div className="section"><div className="label">Hospital Course</div><div className="val">{hospitalCourse || '—'}</div></div>
          <div className="section"><div className="label">Condition on Discharge</div><div className="val">{condition}</div></div>
          <div className="section"><div className="label">Discharge Medications</div><div className="val">{dischargeMeds?.trim() || 'None'}</div></div>
          <div className="section"><div className="label">Follow-up</div><div className="val">{followUp || '—'}</div></div>
          {instructions?.trim() && <div className="section"><div className="label">Instructions</div><div className="val">{instructions}</div></div>}
          <div className="section"><div className="label">Compiled by</div><div className="val">{compiledBy || '—'}</div></div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" onClick={handlePrint}><i className="ti ti-printer" /> Print</button>
          <button className="btn btn-sm" onClick={handleShare}><i className="ti ti-brand-whatsapp" /> Share</button>
          <button className="btn btn-success" onClick={handleConfirmDischarge} disabled={saving}>
            <i className="ti ti-door-exit" /> Confirm discharge
          </button>
        </div>
      </div>
    </div>
  );
}
