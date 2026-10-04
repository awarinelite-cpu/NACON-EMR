// src/lib/marChart.js
// Helpers for the Drug Course Chart style MAR tab (ported from the 68 Nigerian
// Army Reference Hospital "Drug Course Chart" page).
//
// Drugs come from the patient's prescriptions (numbered 1..N, oldest first).
// A chart row = Date, Drug S/N (drugs given + drugs documented "not given"),
// Time, Dose, Route, Nurse, Remark. Drugs are referenced by key
// "rxId:drugIndex", so a row keeps pointing at the same drug even if the
// numbering later changes.

export const ROUTE_OPTIONS = ['', 'Oral', 'IV', 'IM', 'SC', 'Sublingual', 'Topical', 'Rectal', 'Suppository', 'Inhalation', 'NG Tube', 'Other'];
export const REMARK_OPTIONS = ['', 'Given', 'Not Given'];

// EMR drug status <-> 68-chart "Action"
export const ACTION_OPTIONS = ['Ongoing', 'Completed', 'Discontinued', 'Withheld'];
const STATUS_TO_ACTION = { active: 'Ongoing', completed: 'Completed', discontinued: 'Discontinued', withheld: 'Withheld' };
const ACTION_TO_STATUS = { Ongoing: 'active', Completed: 'completed', Discontinued: 'discontinued', Withheld: 'withheld' };
export const actionOfStatus = (s) => STATUS_TO_ACTION[s || 'active'] || 'Ongoing';
export const statusOfAction = (a) => ACTION_TO_STATUS[a] || 'active';
const ACTION_COLORS = { Ongoing: '#2563eb', Completed: '#16a34a', Discontinued: '#dc2626', Withheld: '#d97706' };
export const actionColor = (a) => ACTION_COLORS[a] || '#9ca3af';

export const drugKey = (rxId, idx) => `${rxId}:${idx}`;

const tsDate = (ts) => {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  return isNaN(d) ? null : d;
};
const tsSeconds = (ts) => { const d = tsDate(ts); return d ? d.getTime() / 1000 : 0; };

// Flat, numbered drug list. Oldest prescription first so a new prescription
// never renumbers drugs already on the chart.
export function buildDrugList(prescriptions) {
  const rxs = [...(prescriptions || [])].sort((a, b) => tsSeconds(a.createdAt) - tsSeconds(b.createdAt) || String(a.id).localeCompare(String(b.id)));
  const list = [];
  rxs.forEach(rx => {
    (rx.drugs || []).forEach((d, idx) => {
      list.push({
        key: drugKey(rx.id, idx), num: list.length + 1, rxId: rx.id, idx,
        name: d.drug || '', dose: d.dose || '', route: d.route || '',
        frequency: d.frequency || '', duration: d.duration || '',
        status: d.status || 'active', action: actionOfStatus(d.status),
        prescribedBy: rx.prescribedBy, prescribedByRole: rx.prescribedByRole,
        requiresCountersign: rx.requiresCountersign, countersigned: rx.countersigned,
        startedAt: tsDate(rx.createdAt),
      });
    });
  });
  return list;
}

// ── Frequency / due-time maths (same rules as the 68 chart) ──────────────────
const INTERVAL_HOURS = { OD: 24, MANE: 24, NOCTE: 24, AM: 24, PM: 24, HS: 24, BD: 12, TDS: 8, QDS: 6, QOD: 48,
  Q4H: 4, Q6H: 6, Q8H: 8, Q12H: 12, WEEKLY: 168, MONTHLY: 720,
  'STAT THEN Q4H': 4, 'STAT THEN Q6H': 6, 'STAT THEN Q8H': 8, 'STAT THEN Q12H': 12 };
const FREQ_SYNONYMS = {
  DAILY: 'OD', 'ONCE DAILY': 'OD', 'ONCE A DAY': 'OD', 'DAILY AT NIGHT': 'NOCTE', 'AT NIGHT': 'NOCTE', 'MORNING': 'MANE',
  'TWICE DAILY': 'BD', 'TWICE A DAY': 'BD', BID: 'BD', '12HRLY': 'Q12H', '12 HRLY': 'Q12H', '12HOURLY': 'Q12H', '12 HOURLY': 'Q12H',
  'THRICE DAILY': 'TDS', 'THREE TIMES DAILY': 'TDS', 'THREE TIMES A DAY': 'TDS', TID: 'TDS', '8HRLY': 'Q8H', '8 HRLY': 'Q8H', '8HOURLY': 'Q8H', '8 HOURLY': 'Q8H',
  'FOUR TIMES DAILY': 'QDS', 'FOUR TIMES A DAY': 'QDS', QID: 'QDS', '6HRLY': 'Q6H', '6 HRLY': 'Q6H', '6HOURLY': 'Q6H', '6 HOURLY': 'Q6H',
  '4HRLY': 'Q4H', '4 HRLY': 'Q4H', '4HOURLY': 'Q4H', '4 HOURLY': 'Q4H', 'ALTERNATE DAYS': 'QOD', 'EVERY OTHER DAY': 'QOD',
};
export function normalizeFrequency(freq) {
  const k = (freq || '').trim().toUpperCase().replace(/\s+/g, ' ');
  return FREQ_SYNONYMS[k] || k;
}

const WEEKLY_WORD_MULTIPLIERS = { once: 1, twice: 2, thrice: 3, four: 4, five: 5, six: 6, seven: 7 };
export function parseWeeklyFrequency(freqText) {
  const t = (freqText || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (t === 'weekly') return 1;
  if (WEEKLY_WORD_MULTIPLIERS[t.replace(/\s*weekly$/, '')] && / weekly$/.test(t)) return WEEKLY_WORD_MULTIPLIERS[t.replace(/\s*weekly$/, '')];
  let m = t.match(/^(\d+)\s*(?:x|times)\s*weekly$/);
  if (m) return parseInt(m[1], 10);
  m = t.match(/^(\d+)\s*\/\s*week(?:ly)?$/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function parseDoseSequence(freqText) {
  if (!freqText) return null;
  const text = freqText.trim();
  const statThen = text.match(/^stat\b[,\s]*then\b.*?(\d+)\s*(?:hrly|hourly|hr|hrs|hours?)\b.*?(\d+)\s*(?:hr|hrs|hours?)\b/i);
  if (statThen) {
    const interval = parseInt(statThen[1], 10);
    const total = parseInt(statThen[2], 10);
    if (interval > 0 && total >= interval) {
      const nums = [];
      for (let h = 0; h <= total; h += interval) nums.push(h);
      if (nums.length >= 2) return nums;
    }
  }
  const hourMatches = [...text.matchAll(/(\d+)\s*(?:hrs?|hours?)\b/gi)];
  if (hourMatches.length >= 2) {
    const nums = [...new Set(hourMatches.map(m => parseInt(m[1], 10)))].sort((a, b) => a - b);
    if (nums.length >= 2) return nums;
  }
  const compact = text.replace(/\s+/g, '');
  const m = compact.match(/^(\d+(?:,\d+)+)(hrs?|hours?|h)?$/i);
  if (!m) return null;
  const nums = [...new Set(m[1].split(',').map(n => parseInt(n, 10)))].sort((a, b) => a - b);
  return nums.length >= 2 ? nums : null;
}

const toLocalDate = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d) ? null : d;
};

// Times a drug was given (rows referencing it in `given`), oldest first
export function administrationTimesFor(rows, key) {
  const times = [];
  rows.forEach(r => {
    if (!(r.given || []).some(g => g.key === key)) return;
    const dt = toLocalDate(r.date, r.time);
    if (dt) times.push(dt);
  });
  return times.sort((a, b) => a - b);
}
// Times a drug was documented "not given"
export function skipTimesFor(rows, key) {
  const times = [];
  rows.forEach(r => {
    if (!(r.skipped || []).some(s => s.key === key)) return;
    const dt = toLocalDate(r.date, r.time);
    if (dt) times.push(dt);
  });
  return times.sort((a, b) => a - b);
}
function lastDrugEventFor(rows, key) {
  const all = [
    ...administrationTimesFor(rows, key).map(time => ({ time, skipped: false })),
    ...skipTimesFor(rows, key).map(time => ({ time, skipped: true })),
  ].sort((a, b) => a.time - b.time);
  return all.length ? all[all.length - 1] : null;
}

function startOfWeek(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  return d;
}
export function weeklyDosesGivenThisWeek(rows, key, now) {
  const weekStart = startOfWeek(now || new Date());
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
  return [...administrationTimesFor(rows, key), ...skipTimesFor(rows, key)].filter(t => t >= weekStart && t < weekEnd).length;
}

export function computeDueAt(d, rows) {
  if (d.action !== 'Ongoing') return null;
  const seq = parseDoseSequence(d.frequency);
  if (seq) {
    const givenCount = administrationTimesFor(rows, d.key).length;
    if (givenCount >= seq.length) return null;
    if (givenCount === 0) return d.startedAt || null;
    const last = lastDrugEventFor(rows, d.key);
    if (!last) return null;
    return new Date(last.time.getTime() + (seq[givenCount] - seq[givenCount - 1]) * 3600 * 1000);
  }
  const freq = normalizeFrequency(d.frequency);
  let intervalHours = INTERVAL_HOURS[freq];
  if (!intervalHours) {
    const weeklyN = parseWeeklyFrequency(d.frequency);
    if (weeklyN) intervalHours = (7 * 24) / weeklyN;
  }
  if (!intervalHours) return null; // STAT / PRN / custom text — not covered
  const last = lastDrugEventFor(rows, d.key);
  if (last) return new Date(last.time.getTime() + intervalHours * 3600 * 1000);
  return d.startedAt || null;
}

export function formatHHMM12(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return hhmm || '';
  const [h, m] = hhmm.split(':').map(Number);
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
const clock = (d) => d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

export function dueLabelFor(d, rows, now) {
  const dueAt = computeDueAt(d, rows);
  if (!dueAt) return { text: '—', overdue: false, skippedPending: false };
  const last = lastDrugEventFor(rows, d.key);
  const skippedPending = !!(last && last.skipped) && dueAt > now;
  const sameDay = dueAt.toDateString() === now.toDateString();
  const dayPart = sameDay ? '' : (dueAt.toDateString() === new Date(now.getTime() + 86400000).toDateString() ? 'Tmrw ' : dueAt.toLocaleDateString([], { weekday: 'short' }) + ' ');
  if (dueAt <= now) return { text: 'Overdue ' + dayPart + clock(dueAt), overdue: true, skippedPending: false };
  return { text: dayPart + clock(dueAt), overdue: false, skippedPending };
}

// ── Drug S/N cell text ───────────────────────────────────────────────────────
export function abbreviateReason(text) {
  const t = (text || '').trim();
  if (!t) return '';
  const words = t.split(/\s+/).filter(Boolean);
  const abbr = words.length === 1
    ? words[0].replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()
    : words.map(w => (w.match(/[a-zA-Z]/) || [''])[0]).join('').toUpperCase();
  return (abbr || t.replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase()).slice(0, 6);
}

// numOf(item) -> current drug number (falls back to the number saved with the row)
export function buildSnoSegments(row, numOf) {
  const segments = [];
  const givenNums = (row.given || []).map(numOf).filter(n => n != null).sort((a, b) => a - b);
  if (givenNums.length) segments.push({ type: 'given', text: givenNums.join(', ') });
  const groups = [];
  (row.skipped || []).filter(s => s && (s.reason || '').trim()).forEach(s => {
    const full = s.reason.trim();
    const k = full.toLowerCase().replace(/\s+/g, ' ');
    let g = groups.find(x => x.k === k);
    if (!g) { g = { k, reason: full, nums: [] }; groups.push(g); }
    g.nums.push(numOf(s));
  });
  groups.forEach(g => {
    const nums = g.nums.filter(n => n != null).sort((a, b) => a - b);
    segments.push({ type: 'skip', text: `(${nums.join(',')} ${abbreviateReason(g.reason)})`, nums, fullReason: g.reason });
  });
  return segments;
}
export function buildSnoText(row, numOf) {
  const segs = buildSnoSegments(row, numOf);
  const given = segs.filter(s => s.type === 'given').map(s => s.text).join(', ');
  const skip = segs.filter(s => s.type === 'skip').map(s => s.text).join('. ');
  return given && skip ? `${given} | ${skip}` : (given || skip);
}
export function computeRouteFromGiven(given, drugsByKey) {
  const routes = [];
  (given || []).forEach(g => { const r = drugsByKey[g.key]?.route; if (r && !routes.includes(r)) routes.push(r); });
  return routes.join('/');
}

// ── Stored docs (kind:'row' in mar_records) <-> per-drug administration records ─
// The tab edits one doc per chart row; MARPage, the medication log and the care
// summary still read one record per drug, so listenMAR expands rows for them.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const rowStamp = (r) => {
  if (!ISO_DATE.test(r.date || '')) return null;
  const ms = new Date(`${r.date}T${r.time || '12:00'}:00`).getTime();
  return isNaN(ms) ? null : { seconds: Math.floor(ms / 1000), toDate: () => new Date(ms) };
};

export function flattenMarDocs(docs) {
  const out = [];
  docs.forEach(d => {
    if (d.kind !== 'row') { if (!d.migratedToChart) out.push(d); return; }
    const createdAt = rowStamp(d) || d.createdAt;
    const base = {
      emrNumber: d.emrNumber, route: d.route || '', administeredAt: d.time || '',
      administeredBy: d.nurse || d.administeredBy, administeredByRole: d.administeredByRole, createdAt,
    };
    (d.given || []).forEach(g => out.push({ ...base, id: `${d.id}#${g.key}`, rxId: g.rxId, drug: g.name, dose: (d.dose && d.dose !== 'AP') ? d.dose : (g.dose || ''), scheduledFreq: g.freq || '', status: 'given', notes: d.remark || '' }));
    (d.skipped || []).forEach(s => out.push({ ...base, id: `${d.id}#${s.key}#skip`, rxId: s.rxId, drug: s.name, dose: s.dose || '', scheduledFreq: '', status: 'held', notes: s.reason || '' }));
  });
  return out.sort((a, b) => tsSeconds(a.createdAt) - tsSeconds(b.createdAt));
}

// Older one-drug-at-a-time records -> chart rows (one row per record)
export function legacyToChartRows(legacyDocs, drugs, emrNumber) {
  const rows = [];
  legacyDocs.forEach(m => {
    const created = tsDate(m.createdAt) || new Date();
    const date = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
    const time = /^\d{2}:\d{2}$/.test(m.administeredAt || '') ? m.administeredAt : `${String(created.getHours()).padStart(2, '0')}:${String(created.getMinutes()).padStart(2, '0')}`;
    const match = drugs.find(d => d.rxId === m.rxId && d.name === m.drug) || drugs.find(d => d.name === m.drug);
    const item = { key: match ? match.key : `legacy:${m.id}`, rxId: match?.rxId || m.rxId || '', idx: match?.idx ?? -1, name: m.drug || '', dose: m.dose || '', freq: m.scheduledFreq || match?.frequency || '', num: match?.num ?? null };
    const isGiven = String(m.status).toLowerCase() === 'given';
    rows.push({
      id: `mig_${m.id}`, kind: 'row', emrNumber, date, time,
      given: isGiven ? [item] : [],
      skipped: isGiven ? [] : [{ ...item, reason: (m.notes || '').trim() || String(m.status || 'Not given') }],
      dose: m.dose || 'AP', route: m.route || '', nurse: m.administeredBy || '',
      remark: isGiven ? (m.notes || '') : '', administeredByRole: m.administeredByRole || null,
      order: created.getTime(), isNew: true,
    });
  });
  return rows;
}
