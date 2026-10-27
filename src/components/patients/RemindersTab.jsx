// src/components/patients/RemindersTab.jsx
// ─────────────────────────────────────────────
// Lets a nurse/doctor schedule reminders for this patient: medication timing
// (drug administration), IV infusion timing, and FBS/RBS glucose-check
// timing. Everything runs in the browser: due/overdue is computed from the
// clock while the app is open (refreshed every minute), and the nurse records
// the outcome right here (Given / Held / Refused, Completed / Stop, Log value).
// No Cloud Functions, no Telegram bot.
// ─────────────────────────────────────────────
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/AuthContext';
import { getAllUsers } from '../../lib/emr';
import {
  createMedReminder, listenMedReminders, cancelMedReminder, recordMedAction,
  createIvInfusion, listenIvInfusions, stopIvInfusion, closeIvInfusion,
  createGlucoseCheck, listenGlucoseSchedule, cancelGlucoseCheck, logGlucoseCheck,
} from '../../lib/reminders';

const ROUTES = ['Oral', 'IM', 'IV', 'SC', 'Topical', 'PR'];

function toLocalInputValue(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function RemindersTab({ emrNumber, patient, prescriptions }) {
  const { profile } = useAuth();
  const [nurses, setNurses] = useState([]);
  const [meds, setMeds] = useState([]);
  const [ivs, setIvs] = useState([]);
  const [glucose, setGlucose] = useState([]);

  const [medForm, setMedForm] = useState({ rxDrug: '', drug: '', dose: '', route: 'Oral', intervalHours: 8, firstDueAt: toLocalInputValue(new Date()), nurseUid: '' });
  const [ivForm, setIvForm] = useState({ fluid: '', volumeMl: '', rateMlPerHr: '', startAt: toLocalInputValue(new Date()), nurseUid: '' });
  const [glucoseForm, setGlucoseForm] = useState({ type: 'RBS', dueAt: toLocalInputValue(new Date()), nurseUid: '' });
  const [saving, setSaving] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [glucoseVals, setGlucoseVals] = useState({});
  const [busyId, setBusyId] = useState('');

  // Re-evaluate due/overdue every minute while the tab is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const staff = { uid: profile?.uid, name: profile?.displayName || profile?.email || 'Nurse', role: profile?.role || 'nurse' };
  const ms = ts => ts?.toMillis?.() ?? (ts?.toDate ? ts.toDate().getTime() : null);
  const fmt = ts => ts?.toDate?.().toLocaleString?.() || '—';
  const dueStyle = isDue => (isDue ? { color: 'var(--danger)', fontWeight: 700 } : undefined);
  const actBtn = { fontSize: 12, padding: '2px 8px', marginLeft: 4 };

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try { await fn(); toast.success(okMsg); }
    catch (err) { console.error('[RemindersTab] action failed:', err); toast.error('Could not save — try again'); }
    setBusyId('');
  };

  useEffect(() => {
    getAllUsers().then(all => setNurses(all.filter(u => u.role === 'nurse' && u.active !== false))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!emrNumber) return undefined;
    const unsubs = [
      listenMedReminders(emrNumber, setMeds),
      listenIvInfusions(emrNumber, setIvs),
      listenGlucoseSchedule(emrNumber, setGlucose),
    ];
    return () => unsubs.forEach(u => u && u());
  }, [emrNumber]);

  const drugOptions = (prescriptions || []).flatMap(rx => (rx.drugs || []).map(d => ({ ...d, rxId: rx.id })));
  const patientName = patient?.name || patient?.fullName || emrNumber;
  const nurseName = uid => nurses.find(n => n.uid === uid)?.displayName || '';

  const resetableFields = { color: 'var(--danger)', cursor: 'pointer', fontSize: 12 };

  // ── Medication reminder ──
  const submitMed = async () => {
    if (!medForm.drug || !medForm.nurseUid || !medForm.firstDueAt) { toast.error('Drug, nurse, and first due time are required'); return; }
    setSaving('med');
    try {
      const picked = drugOptions.find(d => `${d.rxId}|${d.drug}` === medForm.rxDrug);
      await createMedReminder({
        emrNumber, patientName,
        rxId: picked?.rxId || null, drugIndex: null,
        drug: medForm.drug, dose: medForm.dose, route: medForm.route,
        intervalHours: medForm.intervalHours, firstDueAt: medForm.firstDueAt,
        assignedNurseUid: medForm.nurseUid, assignedNurseName: nurseName(medForm.nurseUid),
        source: picked ? 'prescription' : 'manual',
        createdBy: profile.displayName, createdByRole: profile.role,
      });
      toast.success('Medication reminder scheduled');
      setMedForm(f => ({ ...f, drug: '', dose: '', rxDrug: '' }));
    } catch (err) {
      console.error('[RemindersTab] createMedReminder failed:', err);
      toast.error('Failed to schedule reminder');
    }
    setSaving('');
  };

  // ── IV infusion ──
  const submitIv = async () => {
    if (!ivForm.fluid || !ivForm.volumeMl || !ivForm.rateMlPerHr || !ivForm.nurseUid) { toast.error('Fluid, volume, rate, and nurse are required'); return; }
    setSaving('iv');
    try {
      await createIvInfusion({
        emrNumber, patientName,
        fluid: ivForm.fluid, volumeMl: ivForm.volumeMl, rateMlPerHr: ivForm.rateMlPerHr,
        startAt: ivForm.startAt,
        assignedNurseUid: ivForm.nurseUid, assignedNurseName: nurseName(ivForm.nurseUid),
        createdBy: profile.displayName, createdByRole: profile.role,
      });
      toast.success('IV infusion timer started');
      setIvForm(f => ({ ...f, fluid: '', volumeMl: '', rateMlPerHr: '' }));
    } catch (err) {
      console.error('[RemindersTab] createIvInfusion failed:', err);
      toast.error('Failed to start infusion timer');
    }
    setSaving('');
  };

  // ── Glucose check ──
  const submitGlucose = async () => {
    if (!glucoseForm.dueAt || !glucoseForm.nurseUid) { toast.error('Due time and nurse are required'); return; }
    setSaving('glucose');
    try {
      await createGlucoseCheck({
        emrNumber, patientName,
        type: glucoseForm.type, dueAt: glucoseForm.dueAt,
        fastingRequired: glucoseForm.type === 'FBS',
        assignedNurseUid: glucoseForm.nurseUid, assignedNurseName: nurseName(glucoseForm.nurseUid),
        createdBy: profile.displayName, createdByRole: profile.role,
      });
      toast.success(`${glucoseForm.type} check scheduled`);
    } catch (err) {
      console.error('[RemindersTab] createGlucoseCheck failed:', err);
      toast.error('Failed to schedule check');
    }
    setSaving('');
  };

  const nurseSelect = (value, onChange) => (
    <select className="form-input" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Assign nurse…</option>
      {nurses.map(n => <option key={n.uid} value={n.uid}>{n.displayName || n.email}</option>)}
    </select>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div className="alert alert-info">
        <i className="ti ti-bell" /> Reminders show as <strong>Due</strong> or <strong>Overdue</strong> here whenever the app is open. Use the buttons to record what was done.
      </div>

      {/* ── MEDICATION TIMING ── */}
      <div className="card">
        <div className="card-header"><div className="card-title"><i className="ti ti-pill" />Medication Timing</div></div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {drugOptions.length > 0 && (
            <select className="form-input" value={medForm.rxDrug}
              onChange={e => {
                const picked = drugOptions.find(d => `${d.rxId}|${d.drug}` === e.target.value);
                setMedForm(f => ({ ...f, rxDrug: e.target.value, drug: picked?.drug || '', dose: picked?.dose || '' }));
              }}>
              <option value="">— Pull from active prescription (optional) —</option>
              {drugOptions.map((d, i) => <option key={i} value={`${d.rxId}|${d.drug}`}>{d.drug} {d.dose}</option>)}
            </select>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8 }}>
            <input className="form-input" placeholder="Drug name" value={medForm.drug} onChange={e => setMedForm(f => ({ ...f, drug: e.target.value }))} />
            <input className="form-input" placeholder="Dose" value={medForm.dose} onChange={e => setMedForm(f => ({ ...f, dose: e.target.value }))} />
            <select className="form-input" value={medForm.route} onChange={e => setMedForm(f => ({ ...f, route: e.target.value }))}>
              {ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            <input type="datetime-local" className="form-input" value={medForm.firstDueAt} onChange={e => setMedForm(f => ({ ...f, firstDueAt: e.target.value }))} />
            <input type="number" min="1" className="form-input" placeholder="Repeat every (hrs)" value={medForm.intervalHours} onChange={e => setMedForm(f => ({ ...f, intervalHours: e.target.value }))} />
            {nurseSelect(medForm.nurseUid, v => setMedForm(f => ({ ...f, nurseUid: v })))}
          </div>
          <button className="btn" disabled={saving === 'med'} onClick={submitMed}>
            {saving === 'med' ? 'Scheduling…' : 'Schedule reminder'}
          </button>

          {meds.filter(m => m.status === 'pending').sort((a, b) => (ms(a.nextDueAt) || 0) - (ms(b.nextDueAt) || 0)).map(m => {
            const isDue = (ms(m.nextDueAt) || Infinity) <= now;
            return (
              <div key={m.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', padding:'6px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
                <span style={dueStyle(isDue)}>💊 <strong>{m.drug}</strong> {m.dose} — {m.assignedNurseName || 'unassigned'} — {isDue ? 'OVERDUE since' : 'next due'} {fmt(m.nextDueAt)} {m.intervalHours ? `(q${m.intervalHours}h)` : ''}</span>
                <span>
                  {isDue && ['given', 'held', 'refused'].map(st => (
                    <button key={st} className="btn btn-sm" style={actBtn} disabled={busyId === m.id}
                      onClick={() => act(m.id, () => recordMedAction(m, st, staff), `${m.drug} marked ${st}`)}>
                      {st === 'given' ? '✅ Given' : st === 'held' ? '⏸ Held' : '🚫 Refused'}
                    </button>
                  ))}
                  <span style={{ ...resetableFields, marginLeft: 8 }} onClick={() => cancelMedReminder(m.id)}>Cancel</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── IV INFUSION TIMING ── */}
      <div className="card">
        <div className="card-header"><div className="card-title"><i className="ti ti-droplet" />IV Infusion Timing</div></div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8 }}>
            <input className="form-input" placeholder="Fluid (e.g. Normal Saline 0.9%)" value={ivForm.fluid} onChange={e => setIvForm(f => ({ ...f, fluid: e.target.value }))} />
            <input type="number" className="form-input" placeholder="Volume (ml)" value={ivForm.volumeMl} onChange={e => setIvForm(f => ({ ...f, volumeMl: e.target.value }))} />
            <input type="number" className="form-input" placeholder="Rate (ml/hr)" value={ivForm.rateMlPerHr} onChange={e => setIvForm(f => ({ ...f, rateMlPerHr: e.target.value }))} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <input type="datetime-local" className="form-input" value={ivForm.startAt} onChange={e => setIvForm(f => ({ ...f, startAt: e.target.value }))} />
            {nurseSelect(ivForm.nurseUid, v => setIvForm(f => ({ ...f, nurseUid: v })))}
          </div>
          <button className="btn" disabled={saving === 'iv'} onClick={submitIv}>
            {saving === 'iv' ? 'Starting…' : 'Start infusion timer'}
          </button>

          {ivs.filter(i => i.status === 'running').map(i => {
            const finished = (ms(i.endAt) || Infinity) <= now;
            return (
              <div key={i.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', padding:'6px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
                <span style={dueStyle(finished)}>💧 <strong>{i.fluid}</strong> {i.volumeMl}ml @ {i.rateMlPerHr}ml/hr — {i.assignedNurseName || 'unassigned'} — {finished ? 'DUE TO COMPLETE since' : 'ends'} {fmt(i.endAt)}</span>
                <span>
                  {finished && (
                    <button className="btn btn-sm" style={actBtn} disabled={busyId === i.id}
                      onClick={() => act(i.id, () => closeIvInfusion(i.id, 'completed', staff), 'Infusion marked completed')}>✅ Completed</button>
                  )}
                  <span style={{ ...resetableFields, marginLeft: 8 }} onClick={() => (finished ? closeIvInfusion(i.id, 'stopped', staff) : stopIvInfusion(i.id))}>{finished ? 'Stop early' : 'Stop'}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FBS/RBS GLUCOSE CHECK TIMING ── */}
      <div className="card">
        <div className="card-header"><div className="card-title"><i className="ti ti-droplet-filled" />Glucose Check Timing (FBS/RBS)</div></div>
        <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
            <select className="form-input" value={glucoseForm.type} onChange={e => setGlucoseForm(f => ({ ...f, type: e.target.value }))}>
              <option value="RBS">RBS (Random)</option>
              <option value="FBS">FBS (Fasting)</option>
            </select>
            <input type="datetime-local" className="form-input" value={glucoseForm.dueAt} onChange={e => setGlucoseForm(f => ({ ...f, dueAt: e.target.value }))} />
            {nurseSelect(glucoseForm.nurseUid, v => setGlucoseForm(f => ({ ...f, nurseUid: v })))}
          </div>
          <button className="btn" disabled={saving === 'glucose'} onClick={submitGlucose}>
            {saving === 'glucose' ? 'Scheduling…' : 'Schedule check'}
          </button>

          {glucose.filter(g => g.status === 'pending').sort((a, b) => (ms(a.dueAt) || 0) - (ms(b.dueAt) || 0)).map(g => {
            const isDue = (ms(g.dueAt) || Infinity) <= now;
            const val = glucoseVals[g.id] ?? '';
            return (
              <div key={g.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', padding:'6px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
                <span style={dueStyle(isDue)}>🩸 <strong>{g.type}</strong> — {g.assignedNurseName || 'unassigned'} — {isDue ? 'DUE since' : 'due'} {fmt(g.dueAt)}{isDue && g.type === 'FBS' ? ' · confirm patient has fasted' : ''}</span>
                <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                  {isDue && (
                    <>
                      <input type="number" step="0.1" className="form-input" style={{ width: 90, padding: '2px 6px' }} placeholder="mmol/L"
                        value={val} onChange={e => setGlucoseVals(v => ({ ...v, [g.id]: e.target.value }))} />
                      <button className="btn btn-sm" style={actBtn} disabled={busyId === g.id || val === '' || isNaN(parseFloat(val))}
                        onClick={() => act(g.id, () => logGlucoseCheck(g, parseFloat(val), staff), `${g.type} ${val} logged`)}>📝 Log</button>
                    </>
                  )}
                  <span style={{ ...resetableFields, marginLeft: 8 }} onClick={() => cancelGlucoseCheck(g.id)}>Cancel</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
