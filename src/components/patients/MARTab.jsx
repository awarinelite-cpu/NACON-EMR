// src/components/patients/MARTab.jsx
// ─────────────────────────────────────────────
// MAR tab, laid out like the Drug Course Chart page of the 68 NARHY ward-chart
// app: a numbered Drugs table (route, frequency, action, duration, next due)
// above an administration chart (Date, Drug S/N, Time, Dose, Route, Nurses Name,
// Remark) where the nurse picks the drug number(s) given — or documents a reason
// a drug was not given — for each row.
// ─────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../lib/AuthContext';
import {
  listenMAR, saveMarRows, deleteMarRow, migrateLegacyMar, newMarRowId,
  updateDrugStatus, updateDrugFields,
} from '../../lib/emr';
import {
  ROUTE_OPTIONS, REMARK_OPTIONS, ACTION_OPTIONS, actionColor, actionOfStatus, statusOfAction,
  buildDrugList, dueLabelFor, parseDoseSequence, parseWeeklyFrequency,
  administrationTimesFor, weeklyDosesGivenThisWeek, buildSnoSegments, buildSnoText,
  computeRouteFromGiven, abbreviateReason, formatHHMM12, legacyToChartRows,
} from '../../lib/marChart';
import TimePicker from './TimePicker';

const INITIAL_BLANK_ROWS = 10;
let blankCounter = 0;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const blankRow = () => ({
  key: `blank_${++blankCounter}`, id: null, date: '', time: '', given: [], skipped: [],
  dose: 'AP', route: '', nurse: '', remark: '', order: 0, isNew: true,
});
const rowHasContent = (r) => !!(r.date || r.time || r.given.length || r.skipped.length || r.remark || r.route);
const itemOf = (d) => ({ key: d.key, rxId: d.rxId, idx: d.idx, name: d.name, dose: d.dose, freq: d.frequency, num: d.num });

function SkipReasonPopup({ nums, reason, onClose }) {
  return (
    <div className="mar68-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mar68-popup">
        <div className="mar68-popup-head"><span>{`Drug ${nums.join(', ')} — Not Given`}</span><button type="button" onClick={onClose} aria-label="Close">&times;</button></div>
        <div className="mar68-popup-body">{reason}</div>
      </div>
    </div>
  );
}

export default function MARTab({ emrNumber, visitId, prescriptions, patient, readOnly = false }) {
  const { profile } = useAuth();
  const nurseName = profile?.displayName || profile?.email || '';
  const actor = () => profile?.displayName || profile?.email || 'Unknown';

  const [rawDocs, setRawDocs] = useState(null);
  const [rowsState, setRowsState] = useState(null);       // null until first load
  const [drugsEdit, setDrugsEdit] = useState(false);
  const [chartEdit, setChartEdit] = useState(false);
  const [editingRows, setEditingRows] = useState({});     // row key -> true
  const [saveStatus, setSaveStatus] = useState('');
  const [statusSaving, setStatusSaving] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [timePickerRow, setTimePickerRow] = useState(-1);
  const [skipPopup, setSkipPopup] = useState(null);
  // Drug S/N picker
  const [pickerRow, setPickerRow] = useState(-1);
  const [pickerSel, setPickerSel] = useState([]);          // drug keys
  const [pickerSkipped, setPickerSkipped] = useState({});  // key -> reason
  const [pickerEditKey, setPickerEditKey] = useState('');
  const [pickerEditText, setPickerEditText] = useState('');

  const drugs = useMemo(() => buildDrugList(prescriptions), [prescriptions]);
  const drugsByKey = useMemo(() => Object.fromEntries(drugs.map(d => [d.key, d])), [drugs]);
  const numOf = (item) => drugsByKey[item.key]?.num ?? item.num ?? '?';

  const rows = rowsState || [];
  const rowsRef = useRef(rows);            rowsRef.current = rows;
  const drugsRef = useRef(drugs);          drugsRef.current = drugs;
  const dirty = useRef(new Set());
  const deleted = useRef(new Set());
  const migrating = useRef(new Set());
  const savedGiven = useRef({});           // rowId -> given keys as last saved
  const snapshots = useRef({});            // row key -> row at unlock time
  const timer = useRef(null);
  const initDone = useRef(false);
  const cb = useRef({});                   cb.current = { visitId };

  // tick so "Overdue" labels stay current
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!emrNumber) return undefined;
    return listenMAR(emrNumber, (_flat, raw) => setRawDocs(raw));
  }, [emrNumber]);

  const fromDoc = (d) => ({
    key: d.id, id: d.id, date: d.date || '', time: d.time || '',
    given: d.given || [], skipped: d.skipped || [],
    dose: d.dose || 'AP', route: d.route || '', nurse: d.nurse || d.administeredBy || '',
    remark: d.remark || '', order: d.order || 0, administeredByRole: d.administeredByRole || null, isNew: false,
  });

  // ── Load rows from Firestore, fold in later arrivals, migrate older records ──
  useEffect(() => {
    if (!rawDocs) return;
    const rowDocs = rawDocs.filter(d => d.kind === 'row');
    const legacy = rawDocs.filter(d => d.kind !== 'row' && !d.migratedToChart);
    rowDocs.forEach(d => { savedGiven.current[d.id] = (d.given || []).map(g => g.key); });

    // older one-drug-at-a-time records need the drug list to match names; migrate once it's loaded
    const fresh = legacy.filter(d => !migrating.current.has(d.id));
    let migRows = [];
    if (fresh.length && drugsRef.current.length) {
      migRows = legacyToChartRows(fresh, drugsRef.current, emrNumber);
      if (!readOnly) {
        fresh.forEach(d => migrating.current.add(d.id));
        Promise.resolve(migrateLegacyMar(emrNumber, cb.current.visitId || null, migRows, fresh.map(d => d.id), actor(), profile?.role))
          .catch(e => { console.error('MAR migrate', e); fresh.forEach(d => migrating.current.delete(d.id)); });
      }
    }

    setRowsState(prev => {
      let next = prev ? [...prev] : [];
      const known = new Set(next.map(r => r.id).filter(Boolean));
      const incoming = rowDocs.filter(d => !deleted.current.has(d.id));
      if (!initDone.current) {
        initDone.current = true;
        next = incoming.map(fromDoc).sort((a, b) => a.order - b.order);
      } else {
        // rows added elsewhere since we loaded; refresh untouched rows from the server
        incoming.filter(d => !known.has(d.id)).map(fromDoc).forEach(r => next.push(r));
        next = next.map(r => (r.id && !dirty.current.has(r.key) && !editingRows[r.key])
          ? (incoming.find(d => d.id === r.id) ? fromDoc(incoming.find(d => d.id === r.id)) : r) : r);
        next.sort((a, b) => (a.order || Infinity) - (b.order || Infinity));
      }

      // older one-drug-at-a-time records → one chart row each (computed above)
      migRows.forEach(m => { if (!next.some(r => r.id === m.id)) next.push({ ...m, key: m.id }); });
      if (migRows.length) next.sort((a, b) => (a.order || Infinity) - (b.order || Infinity));

      const blanks = next.filter(r => !r.id && !rowHasContent(r));
      if (!next.length) for (let i = 0; i < INITIAL_BLANK_ROWS; i++) next.push(blankRow());
      else if (blanks.length === 0 && !prev) next.push(blankRow());
      return next;
    });
    // eslint-disable-next-line
  }, [rawDocs, drugs.length]);

  // ── Saving ──
  async function flush(manual = false) {
    clearTimeout(timer.current);
    if (readOnly) return;
    const all = rowsRef.current;
    const candidates = all.filter(r => dirty.current.has(r.key) && (r.id || rowHasContent(r)));
    const incomplete = candidates.filter(r => (r.given.length || r.skipped.length) && (!r.date || !r.time));
    const toSave = candidates.filter(r => !incomplete.includes(r));
    if (!toSave.length) {
      if (incomplete.length) setSaveStatus('Set Date and Time on the row to save it');
      else if (manual) setSaveStatus('All changes saved');
      return;
    }
    const payload = toSave.map(r => ({ ...r, nurse: r.nurse || nurseName, administeredByRole: r.administeredByRole || profile?.role || null }));
    try {
      const { inventory } = await saveMarRows(emrNumber, cb.current.visitId || null, payload, savedGiven.current, actor(), profile?.role);
      payload.forEach(p => { dirty.current.delete(p.key); savedGiven.current[p.id] = p.given.map(g => g.key); });
      setRowsState(cur => (cur || []).map(r => (payload.some(p => p.key === r.key) ? { ...r, isNew: false } : r)));
      const missed = (inventory || []).filter(i => i.found === false);
      if (missed.length) toast(`Saved. Pharmacy stock not adjusted for: ${missed.map(m => m.drug).join(', ')}`, { icon: 'ℹ️' });
      setSaveStatus(incomplete.length ? 'Saved — set Date and Time on the highlighted row(s) to save them'
        : 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('MAR save', e);
      setSaveStatus('Save failed: ' + (e?.code || e?.message || 'unknown error'));
      if (e?.code === 'permission-denied') toast.error('Failed to record — your account may not be active. Ask an admin to check your staff profile.');
    }
  }
  const flushRef = useRef(flush); flushRef.current = flush;
  function scheduleSave() {
    if (readOnly) return;
    setSaveStatus('Saving…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), 800);
  }
  useEffect(() => () => { if (dirty.current.size) flushRef.current(); }, []);

  // ── Row editing ──
  function updateRow(i, patch) {
    setRowsState(cur => (cur || []).map((r, idx) => {
      if (idx !== i) return r;
      const next = { ...r, ...patch };
      if (!next.nurse && nurseName) next.nurse = nurseName;
      if (!next.id) { next.id = newMarRowId(); next.order = Date.now() + idx; }
      dirty.current.add(next.key);
      return next;
    }));
    scheduleSave();
  }
  function unlockRow(i) {
    const r = rowsRef.current[i];
    snapshots.current[r.key] = { ...r };
    setEditingRows(e => ({ ...e, [r.key]: true }));
  }
  function lockRow(i) {
    const r = rowsRef.current[i];
    const before = new Set((snapshots.current[r.key]?.given || []).map(g => g.key));
    const blocked = r.given.filter(g => !before.has(g.key) && drugsByKey[g.key] && drugsByKey[g.key].action !== 'Ongoing');
    if (blocked.length) {
      alert(blocked.map(g => `Drug ${numOf(g)} (${g.name}) is ${drugsByKey[g.key].action}`).join('\n') + '\n\nPlease correct the Drug S/N before continuing.');
      return;
    }
    if ((r.given.length || r.skipped.length) && (!r.date || !r.time)) { alert('Set the Date and Time for this row before finishing it.'); return; }
    delete snapshots.current[r.key];
    setEditingRows(e => { const n = { ...e }; delete n[r.key]; return n; });
    flush();
  }
  function enterChartEdit() { setChartEdit(true); }
  function exitChartEdit() {
    const bad = rowsRef.current.find(r => editingRows[r.key] && (r.given.length || r.skipped.length) && (!r.date || !r.time));
    if (bad) { alert('Set the Date and Time on the row you are editing before saving.'); return; }
    setChartEdit(false); setEditingRows({}); snapshots.current = {};
    flush(true);
  }
  function addRow() {
    const r = { ...blankRow(), date: todayISO() };
    setRowsState(cur => [...(cur || []), r]);
    snapshots.current[r.key] = { ...r };
    setEditingRows(e => ({ ...e, [r.key]: true }));
    setChartEdit(true);
  }
  async function removeRow() {
    const cur = rowsRef.current;
    if (!cur.length) return;
    const last = cur[cur.length - 1];
    if (last.id && rowHasContent(last) && !window.confirm('Remove the last row and its record?')) return;
    setRowsState(c => c.slice(0, -1));
    dirty.current.delete(last.key);
    setEditingRows(e => { const n = { ...e }; delete n[last.key]; return n; });
    if (last.id) {
      deleted.current.add(last.id);
      try { await deleteMarRow(emrNumber, last.id, last, actor(), profile?.role); setSaveStatus('Row removed'); }
      catch (e) { console.error('MAR delete', e); setSaveStatus('Remove failed: ' + (e?.code || e?.message || 'unknown error')); }
    }
  }

  // ── Drug S/N picker ──
  const activeDrugs = drugs.filter(d => d.action === 'Ongoing');
  function openPicker(i) {
    const r = rowsRef.current[i];
    const activeKeys = new Set(activeDrugs.map(d => d.key));
    setPickerSel(r.given.map(g => g.key).filter(k => activeKeys.has(k)));
    const m = {}; r.skipped.forEach(s => { m[s.key] = s.reason; });
    setPickerSkipped(m); setPickerEditKey(''); setPickerEditText('');
    setPickerRow(i);
  }
  function closePicker() { setPickerRow(-1); setPickerSel([]); setPickerSkipped({}); setPickerEditKey(''); setPickerEditText(''); }
  function togglePick(key) {
    setPickerSel(sel => {
      const was = sel.includes(key);
      if (!was) setPickerSkipped(s => { if (!s[key]) return s; const { [key]: _x, ...rest } = s; return rest; });
      return was ? sel.filter(k => k !== key) : [...sel, key];
    });
  }
  function saveSkipReason() {
    const key = pickerEditKey; const text = pickerEditText.trim();
    setPickerSkipped(s => { const n = { ...s }; if (text) n[key] = text; else delete n[key]; return n; });
    if (text) setPickerSel(sel => sel.filter(k => k !== key));
    setPickerEditKey(''); setPickerEditText('');
  }
  function applyPicker() {
    const i = pickerRow;
    const given = drugs.filter(d => pickerSel.includes(d.key)).map(itemOf);
    const skipped = drugs.filter(d => (pickerSkipped[d.key] || '').trim()).map(d => ({ ...itemOf(d), reason: pickerSkipped[d.key].trim() }));
    updateRow(i, { given, skipped, route: computeRouteFromGiven(given, drugsByKey) });
    closePicker();
  }

  // ── Drugs table edits ──
  async function changeAction(d, action) {
    if (action === d.action) return;
    setStatusSaving(d.key);
    try {
      await updateDrugStatus(d.rxId, d.idx, statusOfAction(action), actor(), profile?.role);
      toast.success(`${d.name} marked ${action}`);
    } catch (err) { console.error('[MARTab] updateDrugStatus failed:', err); toast.error('Failed to update drug status'); }
    setStatusSaving(null);
  }
  async function changeRoute(d, route) {
    if (route === d.route) return;
    setStatusSaving(d.key);
    try { await updateDrugFields(d.rxId, d.idx, { route }, actor(), profile?.role); }
    catch (err) { console.error('[MARTab] updateDrugFields failed:', err); toast.error('Failed to update route'); }
    setStatusSaving(null);
  }

  const chartRowsForDue = rows.filter(r => r.date && r.time);
  const dueOf = (d) => dueLabelFor(d, chartRowsForDue, now);
  const dueStyle = (due) => (due.overdue ? { color: '#ef4444', fontWeight: 800 } : due.skippedPending ? { color: '#d97706', fontWeight: 800 } : undefined);
  const drugTone = (d, due) => ({
    fontWeight: 700,
    ...(d.action !== 'Ongoing' ? { opacity: 0.55 } : {}),
    ...(due.overdue ? { color: '#ef4444' } : due.skippedPending ? { color: '#d97706' } : {}),
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {patient?.knownAllergies && (
        <div style={{
          padding: '10px 16px', borderRadius: 10, background: 'var(--danger-bg)', border: '1.5px solid var(--danger)',
          display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 12, color: 'var(--danger)',
        }}>
          <i className="ti ti-alert-triangle" style={{ fontSize: 16 }} />
          ALLERGY ALERT: {patient.knownAllergies}
        </div>
      )}

      {/* ── Drugs ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-pill" />Drugs Course Chart — Drugs</div>
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{drugs.length} drug{drugs.length !== 1 ? 's' : ''}</span>
        </div>
        {drugs.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>
            <i className="ti ti-pill-off" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
            <div style={{ fontWeight: 700 }}>No prescriptions yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Add a prescription in the Prescription tab first</div>
          </div>
        ) : (
          <>
            <div className="mar-table-scroll">
              <table className="chart-table mar68-table mar68-drugs">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>No.</th><th className="mar68-left">Drug Name</th><th>Dose</th>
                    <th>Route</th><th>Frequency</th><th>Action</th><th>Duration</th><th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {drugs.map(d => {
                    const due = dueOf(d);
                    const seq = parseDoseSequence(d.frequency);
                    const weeklyN = parseWeeklyFrequency(d.frequency);
                    const weeklyGiven = weeklyN ? weeklyDosesGivenThisWeek(chartRowsForDue, d.key, now) : 0;
                    const givenCount = seq ? administrationTimesFor(chartRowsForDue, d.key).length : 0;
                    const busy = statusSaving === d.key;
                    return (
                      <tr key={d.key}>
                        <td>{d.num}</td>
                        <td className="mar68-left" style={drugTone(d, due)}>
                          {d.name || '—'}
                          {d.requiresCountersign && !d.countersigned && <span className="mar68-nurse-rx">Nurse Rx</span>}
                        </td>
                        <td style={drugTone(d, due)}>{d.dose || '—'}</td>
                        <td style={drugTone(d, due)}>
                          {drugsEdit && !readOnly ? (
                            <select className="mar68-select" value={d.route} disabled={busy} onChange={e => changeRoute(d, e.target.value)}>
                              {ROUTE_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                            </select>
                          ) : (d.route || '—')}
                        </td>
                        <td style={drugTone(d, due)}>
                          {d.frequency || '—'}
                          {seq && (
                            <div className="mar68-pills">
                              {seq.map((hr, i) => <span key={i} className={'mar68-pill ' + (i < givenCount ? 'given' : 'pending')}>{hr}h{i < givenCount ? ' ✓' : ''}</span>)}
                            </div>
                          )}
                          {weeklyN && weeklyGiven > 0 && (
                            <div className="mar68-pills" title={`${weeklyGiven} of ${weeklyN} doses given this week`}>
                              <span className="mar68-pill given">{'✅'.repeat(Math.min(weeklyGiven, weeklyN))}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          {drugsEdit && !readOnly ? (
                            <select className="mar68-select" value={d.action} disabled={busy}
                              style={{ background: actionColor(d.action), color: '#fff', fontWeight: 700 }}
                              onChange={e => changeAction(d, e.target.value)}>
                              {ACTION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <span className="mar68-action" style={{ background: actionColor(d.action) }}>{d.action}</span>
                          )}
                        </td>
                        <td style={drugTone(d, due)}>{d.duration || '—'}</td>
                        <td style={dueStyle(due)} title={due.skippedPending ? 'Last due dose was documented as not given' : undefined}>{due.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!readOnly && (
              <div className="mar68-actions">
                {!drugsEdit
                  ? <button type="button" className="btn btn-purple" onClick={() => setDrugsEdit(true)}>Edit</button>
                  : <button type="button" className="btn btn-success" onClick={() => setDrugsEdit(false)}>Save</button>}
                <span className="mar68-hint">Add or change prescribed drugs in the Prescription tab.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Administration chart ── */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><i className="ti ti-clipboard-list" />Drug Administration Chart</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {!readOnly && (!chartEdit
              ? <button type="button" className="btn btn-sm btn-purple" onClick={enterChartEdit}>Edit</button>
              : (<>
                <button type="button" className="btn btn-sm btn-success" onClick={exitChartEdit}>Save</button>
                <button type="button" className="btn btn-sm btn-success" onClick={addRow}>+ Add Row</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={removeRow}>− Remove Row</button>
              </>))}
            <span style={{ fontSize: 11, color: 'var(--t3)' }}>{rows.filter(r => r.given.length || r.skipped.length).length} entries</span>
          </div>
        </div>
        <div className="mar-table-scroll">
          <table className="chart-table mar68-table mar68-chart">
            <thead>
              <tr>
                {chartEdit && !readOnly && <th style={{ width: 44 }}></th>}
                <th>Date</th><th>Drug S/N</th><th>Time</th><th>Dose</th><th>Route</th><th>Nurses Name</th><th>Remark</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const editing = chartEdit && !readOnly && editingRows[row.key];
                const showPencil = chartEdit && !readOnly && !editing;
                const needsTime = (row.given.length || row.skipped.length) && (!row.date || !row.time);
                if (editing) {
                  return (
                    <tr key={row.key} className={needsTime ? 'mar68-incomplete' : undefined}>
                      <td><button type="button" className="mar68-row-btn" title="Done editing this row" onClick={() => lockRow(i)}>✓</button></td>
                      <td><input type="date" className="mar68-input" value={row.date} onChange={e => updateRow(i, { date: e.target.value })} onClick={e => { try { e.currentTarget.showPicker?.(); } catch (_) { /* typing still works */ } }} /></td>
                      <td><button type="button" className="mar68-sno-btn" onClick={() => openPicker(i)}>
                        <span className="mar68-sno-text">{buildSnoText(row, numOf) || 'Select drug(s)'}</span><span>▾</span>
                      </button></td>
                      <td><button type="button" className={'mar68-time-btn' + (row.time ? '' : ' placeholder')} onClick={() => setTimePickerRow(i)}>{row.time ? formatHHMM12(row.time) : 'Set time'}</button></td>
                      <td><input type="text" className="mar68-input" value={row.dose} onChange={e => updateRow(i, { dose: e.target.value })} /></td>
                      <td><input type="text" className="mar68-input" value={row.route} onChange={e => updateRow(i, { route: e.target.value })} /></td>
                      <td><input type="text" className="mar68-input" readOnly value={row.nurse} /></td>
                      <td>
                        <select className="mar68-select" value={row.remark} onChange={e => updateRow(i, { remark: e.target.value })}>
                          {REMARK_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                          {row.remark && !REMARK_OPTIONS.includes(row.remark) && <option value={row.remark}>{row.remark}</option>}
                        </select>
                      </td>
                    </tr>
                  );
                }
                const segs = buildSnoSegments(row, numOf);
                const given = segs.filter(s => s.type === 'given');
                const skip = segs.filter(s => s.type === 'skip');
                return (
                  <tr key={row.key}>
                    {showPencil && <td><button type="button" className="mar68-row-btn" title="Edit this row" onClick={() => unlockRow(i)}>🖊️</button></td>}
                    <td>{row.date || '\u00A0'}</td>
                    <td>
                      {!segs.length ? '\u00A0' : (
                        <>
                          {given.map((s, k) => <span key={'g' + k}>{s.text}</span>)}
                          {given.length > 0 && skip.length > 0 && <br />}
                          {skip.map((s, k) => (
                            <span key={'s' + k} className="mar68-skip" onClick={() => setSkipPopup({ nums: s.nums, reason: s.fullReason })}>{(k > 0 ? '. ' : '') + s.text}</span>
                          ))}
                        </>
                      )}
                    </td>
                    <td>{row.time ? formatHHMM12(row.time) : '\u00A0'}</td>
                    <td>{row.dose || 'AP'}</td>
                    <td>{row.route || '\u00A0'}</td>
                    <td>{row.nurse || '\u00A0'}</td>
                    <td>{row.remark || '\u00A0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {saveStatus && <div className="mar68-status">{saveStatus}</div>}
      </div>

      {timePickerRow !== -1 && (
        <TimePicker title="Set Time" value={rows[timePickerRow]?.time || ''}
          onChange={val => updateRow(timePickerRow, { time: val })} onClose={() => setTimePickerRow(-1)} />
      )}

      {skipPopup && <SkipReasonPopup nums={skipPopup.nums} reason={skipPopup.reason} onClose={() => setSkipPopup(null)} />}

      {pickerRow !== -1 && (
        <div className="mar68-overlay" onClick={e => { if (e.target === e.currentTarget) closePicker(); }}>
          <div className="mar68-modal">
            <div className="mar68-modal-head"><h3>Select Drug(s) Given</h3><button type="button" onClick={closePicker} aria-label="Close">&times;</button></div>
            <div className="mar68-modal-body">
              {activeDrugs.length === 0 && <p style={{ color: 'var(--t3)', fontSize: 13, margin: 0 }}>No active drugs on this chart yet.</p>}
              {activeDrugs.map(d => {
                const due = dueOf(d);
                const reason = pickerSkipped[d.key];
                const editingThis = pickerEditKey === d.key;
                return (
                  <div className="mar68-pick-row" key={d.key}>
                    <label className="mar68-pick-opt">
                      <input type="checkbox" checked={pickerSel.includes(d.key)} onChange={() => togglePick(d.key)} />
                      <span className="mar68-pick-text" style={due.overdue ? { color: '#ef4444', fontWeight: 800 } : reason ? { color: '#d97706' } : undefined}>
                        {d.num}{d.name ? ' - ' + d.name : ''}{d.dose ? ' ' + d.dose : ''}{d.route ? ' (' + d.route + ')' : ''}
                      </span>
                      {due.overdue && <span className="mar68-due-tag">Due {due.text.replace('Overdue ', '')}</span>}
                      <button type="button" className="mar68-pencil" title="Not given — write a reason" aria-label="Not given — write a reason"
                        onClick={e => { e.preventDefault(); setPickerEditText(pickerSkipped[d.key] || ''); setPickerEditKey(d.key); }}>✏️</button>
                    </label>
                    {reason && !editingThis && (
                      <div className="mar68-skip-note" onClick={() => { setPickerEditText(reason); setPickerEditKey(d.key); }}>{d.num + ' ' + abbreviateReason(reason)}</div>
                    )}
                    {editingThis && (
                      <div className="mar68-skip-editor">
                        <textarea rows={2} placeholder="Reason not given, e.g. No IV line" value={pickerEditText} onChange={e => setPickerEditText(e.target.value)} autoFocus />
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveSkipReason}>Save</button>
                          {reason && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPickerSkipped(s => { const n = { ...s }; delete n[d.key]; return n; }); setPickerEditKey(''); setPickerEditText(''); }}>Clear</button>}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setPickerEditKey(''); setPickerEditText(''); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mar68-modal-foot"><button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={applyPicker}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
