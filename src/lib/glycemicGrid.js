// src/lib/glycemicGrid.js
// Shared definitions + helpers for the editable glycemic chart grid.
// Layout, columns and abnormal-value flagging mirror the 68-drug-course
// Blood Glucose chart (Date, Time, 6 time points, Remark — all mg/dL).

export const GRID_DEFS = {
  '6point': {
    title: '6 Points Glycemic Chart',
    columns: [
      { label: 'FBS',                glucoseType: 'fasting' },
      { label: '2hrs Post Prandial', glucoseType: 'post' },
      { label: 'Pre-Lunch',          glucoseType: 'fasting' },
      { label: '2hrs Post Lunch',    glucoseType: 'post' },
      { label: 'Pre-Dinner',         glucoseType: 'fasting' },
      { label: '2hrs Post Dinner',   glucoseType: 'post' },
    ],
  },
  '3point': {
    title: '3 Points Glycemic Chart',
    columns: [
      { label: 'FBS', glucoseType: 'fasting' },
      { label: 'RBS', glucoseType: 'random' },
      { label: 'RBS', glucoseType: 'random' },
    ],
  },
};

// Context names stamped onto the flattened per-reading view (3-point has two
// RBS columns, so the second one gets a distinct context).
const CONTEXT_LABELS = {
  '6point': GRID_DEFS['6point'].columns.map(c => c.label),
  '3point': ['FBS', 'RBS', 'RBS (2)'],
};

// Fasting / pre-meal 70–99 mg/dL, 2hrs post-meal < 140 mg/dL, random 70–180.
export function isAbnormalGlucose(v, glucoseType) {
  const n = parseFloat(v);
  if (isNaN(n)) return false;
  if (glucoseType === 'fasting') return n < 70 || n > 99;
  if (glucoseType === 'post') return n < 70 || n >= 140;
  return n < 70 || n > 180;
}

// Same slot names the older one-reading-at-a-time form used
const LEGACY_SLOT_NAMES = [
  ['FBS', 'Fasting', 'Pre-breakfast'],
  ['2hrs Post Prandial', '2 hours post-breakfast'],
  ['Pre-Lunch', 'Pre-lunch'],
  ['2hrs Post Lunch', '2 hours post-lunch'],
  ['Pre-Dinner', 'Pre-dinner'],
  ['2hrs Post Dinner', '2 hours post-dinner'],
];
const legacySlotIndex = (ctx) => LEGACY_SLOT_NAMES.findIndex(names => names.includes(ctx));

const msOf = (ts) => {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return isNaN(d) ? 0 : d.getTime();
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyOfLegacy(r) {
  if (ISO_DATE.test(r.date || '')) return r.date;
  const ms = msOf(r.recordedAt) || Date.now();
  return new Date(ms).toISOString().slice(0, 10);
}

function rowTimestamp(row) {
  if (!ISO_DATE.test(row.date || '')) return null;
  const ms = new Date(`${row.date}T${row.time || '12:00'}:00`).getTime();
  if (isNaN(ms)) return null;
  return { seconds: Math.floor(ms / 1000), toDate: () => new Date(ms) };
}

// Turns raw glucose_charts docs into the flat per-reading list the rest of the
// app (timeline, care summary, discharge summary, trend chart) already uses.
// Grid rows (kind:'row') expand to one reading per filled cell; old
// one-reading docs pass straight through unless already moved into the grid.
export function flattenGlucoseDocs(docs) {
  const out = [];
  for (const d of docs) {
    if (d.kind === 'row') {
      const labels = CONTEXT_LABELS[d.chartType] || CONTEXT_LABELS['6point'];
      const recordedAt = rowTimestamp(d) || d.recordedAt;
      (d.cells || []).forEach((v, i) => {
        const n = parseFloat(v);
        if (i >= labels.length || isNaN(n)) return;
        out.push({
          id: `${d.id}#${i}`, emrNumber: d.emrNumber, visitId: d.visitId || null,
          reading: String(v).trim(), unit: 'mg/dL', context: labels[i],
          date: d.date || '', time: d.time || '', remark: d.remark || '',
          recordedBy: d.recordedBy, recordedAt,
        });
      });
    } else if (!d.migratedToGrid) {
      out.push(d);
    }
  }
  out.sort((a, b) => msOf(a.recordedAt) - msOf(b.recordedAt));
  return out;
}

// Groups old one-reading-at-a-time docs into one grid row per calendar day.
// Readings that don't fit a 6-point column (e.g. "Random") are kept as text in
// the row's Remark so nothing is lost. Values convert to mg/dL.
// existingRowsById lets a later legacy doc for an already-migrated day fill
// only still-empty cells instead of overwriting anything typed in the grid.
export function legacyToRows(legacyDocs, existingRowsById = {}, emrNumber = '') {
  const byDay = new Map();
  for (const r of legacyDocs) {
    const key = dateKeyOfLegacy(r);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }
  const rows = [];
  for (const [dateKey, list] of byDay) {
    list.sort((a, b) => msOf(a.recordedAt) - msOf(b.recordedAt));
    const id = `mig_${emrNumber}_${dateKey}`;
    const existing = existingRowsById[id];
    const cells = existing ? [...(existing.cells || [])] : [];
    while (cells.length < 6) cells.push('');
    let time = existing?.time || '';
    const remarkParts = existing?.remark ? [existing.remark] : [];
    for (const r of list) {
      const n = parseFloat(r.reading);
      if (!time && r.time) time = r.time;
      if (r.remark && !remarkParts.includes(r.remark)) remarkParts.push(r.remark);
      if (isNaN(n)) { remarkParts.push(`${r.context || 'Reading'}: ${r.reading}`); continue; }
      const mg = (r.unit || 'mmol/L') === 'mg/dL' ? n : n * 18;
      const val = String(Math.round(mg));
      const idx = legacySlotIndex(r.context);
      if (idx >= 0 && !cells[idx]) cells[idx] = val;
      else remarkParts.push(`${r.context || 'Reading'} ${val} mg/dL`);
    }
    rows.push({
      id, chartType: '6point', date: dateKey, time, cells,
      remark: remarkParts.join('; '),
      order: new Date(`${dateKey}T00:00:00`).getTime(),
      isNew: !existing,
    });
  }
  return rows;
}
