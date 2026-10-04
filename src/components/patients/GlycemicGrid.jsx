// src/components/patients/GlycemicGrid.jsx
// Editable glycemic chart table — same layout and behaviour as the Blood
// Glucose chart in the 68-drug-course app: type straight into the table
// (Date, Time, 6 time points, Remark), mg/dL only, 6-Point / 3-Point toggle,
// + Add Row / − Remove Row / Save, auto-save, out-of-range values flagged red.
import React, { useEffect, useRef, useState } from 'react';
import { GRID_DEFS, isAbnormalGlucose, legacyToRows } from '../../lib/glycemicGrid';

const INITIAL_BLANK_ROWS = 10;
let blankCounter = 0;
const blankRow = (chartType) => ({
  key: `blank_${++blankCounter}`, id: null, chartType,
  date: '', time: '', cells: Array(GRID_DEFS[chartType].columns.length).fill(''), remark: '', order: 0, isNew: true,
});
const padCells = (cells, n) => Array.from({ length: n }, (_, i) => (cells && cells[i] != null ? String(cells[i]) : ''));
const hasContent = (r) => !!(r.date || r.time || r.remark || r.cells.some(c => c !== ''));

// Mobile opens the OS picker on any tap; desktop only opens it from the tiny
// icon. showPicker() on click makes desktop match "tap anywhere to pick".
function openPicker(el) {
  if (!el || typeof el.showPicker !== 'function') return;
  try { el.showPicker(); } catch (_) { /* typing still works */ }
}

function fillEmpty(localRow, migRow) {
  const cells = localRow.cells.map((c, i) => (c !== '' ? c : (migRow.cells[i] || '')));
  const remark = migRow.remark && !localRow.remark.includes(migRow.remark)
    ? [localRow.remark, migRow.remark].filter(Boolean).join('; ') : localRow.remark;
  return { ...localRow, cells, remark, time: localRow.time || migRow.time };
}

export default function GlycemicGrid({ emrNumber, rawDocs, readOnly, newId, onSaveRows, onDeleteRow, onMigrate }) {
  const [currentType, setCurrentType] = useState('6point');
  const [rowsCache, setRowsCache] = useState({ '6point': [], '3point': [] });
  const [saveStatus, setSaveStatus] = useState('—');

  const rowsRef = useRef(rowsCache);       rowsRef.current = rowsCache;
  const typeRef = useRef(currentType);     typeRef.current = currentType;
  const cb = useRef({});                   cb.current = { newId, onSaveRows, onDeleteRow, onMigrate };
  const initRef = useRef(false);
  const dirtyRef = useRef(new Set());      // row keys with unsaved edits
  const deletedRef = useRef(new Set());    // ids removed here, so a snapshot can't resurrect them
  const migratingRef = useRef(new Set());  // legacy doc ids already sent for migration
  const timerRef = useRef(null);

  const fromDoc = (d) => {
    const type = GRID_DEFS[d.chartType] ? d.chartType : '6point';
    return {
      key: d.id, id: d.id, chartType: type, date: d.date || '', time: d.time || '',
      cells: padCells(d.cells, GRID_DEFS[type].columns.length), remark: d.remark || '',
      order: d.order || 0, isNew: false,
    };
  };
  const fromMig = (r) => ({ ...r, key: r.id, cells: padCells(r.cells, 6) });

  // ── Load from Firestore (first snapshot), then fold in later arrivals ──
  useEffect(() => {
    if (!rawDocs) return;
    const rowDocs = rawDocs.filter(d => d.kind === 'row');
    const legacy = rawDocs.filter(d => d.kind !== 'row' && !d.migratedToGrid);
    const byId = Object.fromEntries(rowDocs.map(d => [d.id, d]));

    setRowsCache(prev => {
      const next = { '6point': [...prev['6point']], '3point': [...prev['3point']] };
      const known = new Set([...next['6point'], ...next['3point']].map(r => r.id).filter(Boolean));

      if (!initRef.current) {
        initRef.current = true;
        next['6point'] = []; next['3point'] = [];
        rowDocs.filter(d => !deletedRef.current.has(d.id)).map(fromDoc)
          .sort((a, b) => a.order - b.order)
          .forEach(r => { next[r.chartType].push(r); known.add(r.id); });
      } else {
        // rows another user added since we loaded
        rowDocs.filter(d => !known.has(d.id) && !deletedRef.current.has(d.id)).map(fromDoc)
          .sort((a, b) => a.order - b.order)
          .forEach(r => { next[r.chartType].push(r); known.add(r.id); });
      }

      // older one-reading-at-a-time entries → one grid row per day
      const fresh = legacy.filter(d => !migratingRef.current.has(d.id));
      if (fresh.length) {
        const migRows = legacyToRows(fresh, byId, emrNumber);
        migRows.forEach(m => {
          const idx = next['6point'].findIndex(r => r.id === m.id);
          if (idx >= 0) next['6point'][idx] = fillEmpty(next['6point'][idx], m);
          else next['6point'].push(fromMig(m));
        });
        next['6point'].sort((a, b) => (a.order || Infinity) - (b.order || Infinity));
        if (!readOnly) {
          fresh.forEach(d => migratingRef.current.add(d.id));
          Promise.resolve(cb.current.onMigrate(migRows, fresh.map(d => d.id)))
            .catch(e => { console.error('glycemic migrate', e); fresh.forEach(d => migratingRef.current.delete(d.id)); });
        }
      }

      if (!next['6point'].length) for (let i = 0; i < INITIAL_BLANK_ROWS; i++) next['6point'].push(blankRow('6point'));
      return next;
    });

    if (!initRef.current) return;
    setSaveStatus(s => (s === '—' ? (readOnly ? 'Read-only' : 'Changes save automatically — tap Save to confirm') : s));
    // start on the 3-point chart only when that's the only one with data
    const only3 = rowDocs.length && rowDocs.every(d => d.chartType === '3point');
    if (only3 && typeRef.current === '6point' && !dirtyRef.current.size) setCurrentType('3point');
  }, [rawDocs]);

  // ── Saving ──
  async function flush(manual = false) {
    clearTimeout(timerRef.current);
    if (readOnly) return;
    const all = [...rowsRef.current['6point'], ...rowsRef.current['3point']];
    const toSave = all.filter(r => dirtyRef.current.has(r.key) && (r.id || hasContent(r)));
    if (!toSave.length) { if (manual) setSaveStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); return; }
    const payload = toSave.map(r => ({ ...r }));
    try {
      await cb.current.onSaveRows(payload);
      payload.forEach(p => dirtyRef.current.delete(p.key));
      setRowsCache(c => {
        const mark = (list) => list.map(r => (payload.some(p => p.key === r.key) ? { ...r, isNew: false } : r));
        return { '6point': mark(c['6point']), '3point': mark(c['3point']) };
      });
      setSaveStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('glycemic save', e);
      setSaveStatus('Save failed: ' + (e?.code || e?.message || 'unknown error'));
    }
  }
  const flushRef = useRef(flush); flushRef.current = flush;

  function scheduleSave() {
    if (readOnly) return;
    setSaveStatus('Saving…');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), 600);
  }
  // push out any pending edit when leaving the tab
  useEffect(() => () => { if (dirtyRef.current.size) flushRef.current(); }, []);

  // ── Editing ──
  function updateRow(rowIdx, patch) {
    if (readOnly) return;
    const type = typeRef.current;
    setRowsCache(cache => {
      const rows = cache[type].map((r, i) => {
        if (i !== rowIdx) return r;
        const next = { ...r, ...patch };
        if (!next.id) { next.id = cb.current.newId(); next.order = Date.now() + i; }
        dirtyRef.current.add(next.key);
        return next;
      });
      return { ...cache, [type]: rows };
    });
    scheduleSave();
  }
  const updateCell = (rowIdx, colIdx, value) => {
    const row = rowsRef.current[typeRef.current][rowIdx];
    const cells = row.cells.map((c, i) => (i === colIdx ? value : c));
    updateRow(rowIdx, { cells });
  };

  function addRow() {
    setRowsCache(c => ({ ...c, [currentType]: [...c[currentType], blankRow(currentType)] }));
  }
  async function removeRow() {
    const rows = rowsRef.current[currentType];
    if (!rows.length) return;
    const last = rows[rows.length - 1];
    if (last.id && hasContent(last) && !window.confirm('Remove the last row and its saved readings?')) return;
    setRowsCache(c => ({ ...c, [currentType]: c[currentType].slice(0, -1) }));
    dirtyRef.current.delete(last.key);
    if (last.id) {
      deletedRef.current.add(last.id);
      try { await cb.current.onDeleteRow(last.id, last); setSaveStatus('Row removed'); }
      catch (e) { console.error('glycemic delete', e); setSaveStatus('Remove failed: ' + (e?.code || e?.message || 'unknown error')); }
    }
  }

  const def = GRID_DEFS[currentType];
  const rows = rowsCache[currentType] || [];

  return (
    <div className="card glyc-grid-card">
      <div className="card-header">
        <div className="card-title"><i className="ti ti-activity" /> {def.title}</div>
      </div>
      <div className="glyc-grid-notes">
        <div>All glucose readings in mg/dL</div>
        <div>Normal: Fasting/Pre-meal 70–99 &nbsp;•&nbsp; 2hrs Post-meal &lt;140 &nbsp;•&nbsp; readings outside these ranges are flagged red</div>
      </div>

      <div className="glyc-toggle-row">
        {['6point', '3point'].map(t => (
          <button key={t} type="button" className={'glyc-toggle-btn' + (currentType === t ? ' active' : '')}
            onClick={() => setCurrentType(t)}>{t === '6point' ? '6-Point' : '3-Point'}</button>
        ))}
      </div>

      <div className="table-scroll">
        <table className="chart-table glyc-grid">
          <thead>
            <tr>
              <th>Date</th><th>Time</th>
              {def.columns.map((c, i) => <th key={i}>{c.label}</th>)}
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={row.key}>
                <td className="glyc-c-date">
                  <input type="date" value={row.date} readOnly={readOnly}
                    onChange={e => updateRow(rIdx, { date: e.target.value })}
                    onClick={e => openPicker(e.currentTarget)} />
                </td>
                <td className="glyc-c-time">
                  <input type="time" value={row.time} readOnly={readOnly}
                    onChange={e => updateRow(rIdx, { time: e.target.value })}
                    onClick={e => openPicker(e.currentTarget)} />
                </td>
                {def.columns.map((col, cIdx) => {
                  const val = row.cells[cIdx] || '';
                  const abnormal = isAbnormalGlucose(val, col.glucoseType);
                  return (
                    <td key={cIdx} className={'glyc-c-val' + (abnormal ? ' glyc-abnormal' : '')}>
                      <input type="text" value={val} readOnly={readOnly}
                        onChange={e => updateCell(rIdx, cIdx, e.target.value)} />
                    </td>
                  );
                })}
                <td className="glyc-c-remark">
                  <input type="text" value={row.remark} readOnly={readOnly}
                    onChange={e => updateRow(rIdx, { remark: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="glyc-grid-actions">
          <button type="button" className="btn btn-success" onClick={addRow}>+ Add Row</button>
          <button type="button" className="btn btn-secondary" onClick={removeRow}>− Remove Row</button>
          <button type="button" className="btn btn-primary" onClick={() => { setSaveStatus('Saving…'); flush(true); }}>
            <i className="ti ti-device-floppy" /> Save
          </button>
        </div>
      )}
      <div className="glyc-grid-status">{saveStatus}</div>
    </div>
  );
}
