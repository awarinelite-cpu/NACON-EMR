// src/lib/clinicStats.js
// Clinic Statistics: one-shot, date-ranged reads (no live listeners) and
// pure aggregation helpers. Every query is a single-field range, so no
// composite indexes are needed.
import {
  collection, getDocs, query, where, Timestamp, getCountFromServer,
} from 'firebase/firestore';
import { db } from './firebase';
import { COL, normalizeClassSet } from './emr';

// ── date helpers ─────────────────────────────
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export function rangeFor(key, custom) {
  const now = new Date();
  if (key === 'today') return { from: startOfDay(now), to: endOfDay(now) };
  if (key === 'week') {
    const f = startOfDay(now);
    f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); // Monday
    return { from: f, to: endOfDay(now) };
  }
  if (key === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
  if (key === 'semester') {
    const f = startOfDay(now); f.setDate(f.getDate() - 180);
    return { from: f, to: endOfDay(now) };
  }
  const f = custom?.from ? startOfDay(new Date(custom.from)) : startOfDay(now);
  const t = custom?.to   ? endOfDay(new Date(custom.to))     : endOfDay(now);
  return { from: f, to: t };
}

const toDate = (ts) => (!ts ? null : ts.toDate ? ts.toDate() : new Date(ts));

const inRange = (ts, from, to) => {
  const d = toDate(ts);
  return !!d && d >= from && d <= to;
};

async function ranged(col, field, from, to) {
  const snap = await getDocs(query(
    collection(db, col),
    where(field, '>=', Timestamp.fromDate(from)),
    where(field, '<=', Timestamp.fromDate(to)),
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

const safe = (p) => p.catch((e) => { console.error('[clinicStats]', e); return []; });

// ── fetch ────────────────────────────────────
export async function fetchClinicStats(from, to) {
  // sick reports live on the patient doc (latest report only); fetch 12 months once
  const twelve = new Date(); twelve.setMonth(twelve.getMonth() - 11); twelve.setDate(1); twelve.setHours(0, 0, 0, 0);
  const sickFrom = twelve < from ? twelve : from;

  const [
    totalPatients, visits, admits, discharges, referrals, triage, selfReports,
    labs, rx, dispense, notes, sickPatients, inventory,
  ] = await Promise.all([
    getCountFromServer(collection(db, COL.PATIENTS)).then(s => s.data().count).catch(() => 0),
    safe(ranged(COL.VISITS, 'createdAt', from, to)),
    safe(ranged(COL.VISITS, 'admittedAt', from, to)),
    safe(ranged(COL.VISITS, 'dischargedAt', from, to)),
    safe(ranged(COL.REFERRALS, 'createdAt', from, to)),
    safe(ranged(COL.TRIAGE, 'arrivedAt', from, to)),
    safe(ranged(COL.SELF_REPORT, 'submittedAt', from, to)),
    safe(ranged(COL.LAB_REQUESTS, 'requestedAt', from, to)),
    safe(ranged(COL.PRESCRIPTIONS, 'createdAt', from, to)),
    safe(ranged(COL.DISPENSE_LOG, 'dispensedAt', from, to)),
    safe(ranged(COL.NOTES, 'createdAt', from, to)),
    safe(ranged(COL.PATIENTS, 'reportedSickAt', sickFrom, new Date())),
    getDocs(collection(db, COL.INVENTORY)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
  ]);

  return {
    from, to, totalPatients, visits, admits, discharges, referrals, triage,
    selfReports, labs, rx, dispense, notes, sickPatients, inventory,
  };
}

// ── free-text cleanup ────────────────────────
// lowercase, trim, collapse spaces/punctuation, split on commas / "and" / "&" / "+" / ";" / "/"
export function cleanTerms(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[.()\[\]"'!?]/g, ' ')
    .split(/,|;|\/|\+|&|\band\b|\bwith\b|\n/)
    .map(s => s.replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 3);
}

export function countTerms(list) {
  const m = {};
  list.forEach(t => { m[t] = (m[t] || 0) + 1; });
  return m;
}

// top N entries + "Others" bucket
export function topN(map, n = 10, others = true) {
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const top = arr.slice(0, n).map(([label, value]) => ({ label, value }));
  const rest = arr.slice(n).reduce((s, [, v]) => s + v, 0);
  if (others && rest > 0) top.push({ label: 'Others', value: rest, muted: true });
  return top;
}

const titleCase = (s) => s.replace(/\b\w/g, c => c.toUpperCase());

// ── age ──────────────────────────────────────
function ageOf(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

const AGE_GROUPS = [
  ['Under 18', 0, 17], ['18–22', 18, 22], ['23–27', 23, 27],
  ['28–35', 28, 35], ['36–45', 36, 45], ['46+', 46, 200],
];

const normSex = (s) => {
  const x = String(s || '').toLowerCase();
  return x.startsWith('m') ? 'male' : x.startsWith('f') ? 'female' : 'unknown';
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

export function fmtDuration(ms) {
  if (ms == null || !isFinite(ms)) return '—';
  const mins = ms / 60000;
  if (mins < 60) return `${Math.round(mins)} min`;
  const hrs = mins / 60;
  if (hrs < 48) return `${hrs.toFixed(1)} hrs`;
  return `${(hrs / 24).toFixed(1)} days`;
}

// ── aggregate ────────────────────────────────
export function aggregate(raw) {
  const { from, to } = raw;
  const sickInRange = raw.sickPatients.filter(p => inRange(p.reportedSickAt, from, to));

  // overview
  const overview = {
    patients:   raw.totalPatients,
    visits:     raw.visits.length,
    sick:       sickInRange.length,
    admissions: raw.admits.length,
    discharges: raw.discharges.length,
    referrals:  raw.referrals.length,
    labsDone:   raw.labs.filter(l => l.status === 'completed').length,
  };

  // 2. who is falling sick
  const bySet = {};
  const sexCount = { male: 0, female: 0, unknown: 0 };
  const ageCount = Object.fromEntries(AGE_GROUPS.map(g => [g[0], 0]));
  ageCount.Unknown = 0;
  const method = { qr: 0, manual: 0, visit: 0, other: 0 };
  sickInRange.forEach(p => {
    const set = normalizeClassSet(p.classSet) || 'No set';
    const sx = normSex(p.sex);
    bySet[set] = bySet[set] || { male: 0, female: 0, other: 0, total: 0 };
    if (sx === 'male') bySet[set].male++; else if (sx === 'female') bySet[set].female++; else bySet[set].other++;
    bySet[set].total++;
    sexCount[sx]++;
    const a = ageOf(p.dob);
    const g = a == null ? null : AGE_GROUPS.find(([, lo, hi]) => a >= lo && a <= hi);
    ageCount[g ? g[0] : 'Unknown']++;
    const h = p.reportedSickHow;
    method[h === 'qr' ? 'qr' : h === 'manual' ? 'manual' : h === 'visit' ? 'visit' : 'other']++;
  });
  const setRows = Object.entries(bySet)
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.total - a.total);

  // student with the most sick episodes in each SET (one visit = one episode)
  const byId = {};
  raw.sickPatients.forEach(p => { byId[p.id || p.emrNumber] = p; });
  const perStudent = {};
  raw.visits.forEach(v => { if (v.emrNumber) perStudent[v.emrNumber] = (perStudent[v.emrNumber] || 0) + 1; });
  const bestInSet = {};
  Object.entries(perStudent).forEach(([emr, n]) => {
    const p = byId[emr];
    if (!p) return;
    const set = normalizeClassSet(p.classSet) || 'No set';
    if (!bestInSet[set] || n > bestInSet[set].value) {
      bestInSet[set] = { label: `${set} · ${titleCase(`${p.surname || ''} ${p.firstName || ''}`.trim().toLowerCase()) || emr}`, value: n };
    }
  });
  const topStudents = Object.values(bestInSet).sort((a, b) => b.value - a.value);

  // last 12 months
  const months = [];
  const base = new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      value: 0,
    });
  }
  raw.sickPatients.forEach(p => {
    const d = toDate(p.reportedSickAt);
    if (!d) return;
    const m = months.find(x => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (m) m.value++;
  });

  // 3. illness & treatment (free text → cleaned terms)
  const terms = [];
  raw.triage.forEach(t => terms.push(...cleanTerms(t.chiefComplaint)));
  raw.selfReports.forEach(s => terms.push(...cleanTerms(s.complaint)));
  sickInRange.forEach(p => terms.push(...cleanTerms(p.primaryDiagnosis)));
  const illness = topN(countTerms(terms), 10).map(r => ({ ...r, label: titleCase(r.label) }));

  const drugCount = {};
  raw.rx.forEach(r => (r.drugs || []).forEach(d => {
    const n = String(d.drug || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (n) drugCount[n] = (drugCount[n] || 0) + 1;
  }));
  const drugs = topN(drugCount, 10, false).map(r => ({ ...r, label: titleCase(r.label) }));

  const outcome = [
    { label: 'Seen / treated', value: raw.visits.filter(v => v.status === 'open' || v.status === 'closed' || v.status === 'completed').length },
    { label: 'Sick bay',       value: raw.admits.length },
    { label: 'Discharged',     value: raw.discharges.length },
    { label: 'Referred',       value: raw.referrals.length },
  ];

  // 4. workload
  const byDow = DAYS.map(l => ({ label: l, value: 0 }));
  const byHour = Array.from({ length: 24 }, (_, h) => ({ label: String(h), value: 0 }));
  raw.visits.forEach(v => {
    const d = toDate(v.createdAt);
    if (!d) return;
    byDow[d.getDay()].value++;
    byHour[d.getHours()].value++;
  });
  const prio = { P1: 0, P2: 0, P3: 0 };
  raw.triage.forEach(t => { if (prio[t.priority] !== undefined) prio[t.priority]++; });

  // stay = admittedAt → dischargedAt on the same visit (discharges in range)
  const stays = raw.discharges
    .map(v => {
      const a = toDate(v.admittedAt), d = toDate(v.dischargedAt);
      return a && d && d > a ? d - a : null;
    })
    .filter(x => x != null);
  // readmission = patient admitted more than once in range
  const admitCounts = {};
  raw.admits.forEach(v => { admitCounts[v.emrNumber] = (admitCounts[v.emrNumber] || 0) + 1; });
  const readmissions = Object.values(admitCounts).filter(n => n > 1).length;

  // 5. laboratory
  const testCount = {};
  raw.labs.forEach(l => (l.tests || []).forEach(t => { testCount[t] = (testCount[t] || 0) + 1; }));
  const labStatus = ['pending', 'processing', 'completed'].map(s => ({
    label: titleCase(s === 'pending' ? 'requested' : s),
    value: raw.labs.filter(l => (l.status || 'pending') === s).length,
  }));
  let normal = 0, abnormal = 0;
  const abnCount = {};
  raw.labs.filter(l => l.status === 'completed').forEach(l => {
    Object.entries(l.results || {}).forEach(([name, r]) => {
      if (!r || typeof r !== 'object' || !r.flag) return;
      if (r.flag === 'normal') normal++;
      else if (['high', 'low', 'abnormal'].includes(r.flag)) {
        abnormal++;
        const label = `${name}${r.flag === 'high' ? ' ↑' : r.flag === 'low' ? ' ↓' : ''}`;
        abnCount[label] = (abnCount[label] || 0) + 1;
      }
    });
  });
  const turnaround = raw.labs
    .map(l => {
      const a = toDate(l.requestedAt), b = toDate(l.resultEnteredAt);
      return a && b && b > a ? b - a : null;
    })
    .filter(x => x != null);

  // 6. referrals
  const dest = {}, reason = {};
  raw.referrals.forEach(r => {
    const t = String(r.to || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (t) dest[t] = (dest[t] || 0) + 1;
    cleanTerms(r.purpose).forEach(x => { reason[x] = (reason[x] || 0) + 1; });
  });

  // 7. pharmacy + nursing activity per shift
  const dispCount = {};
  raw.dispense.forEach(d => (d.drugs || []).forEach(x => {
    const n = String(x.drug || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (n) dispCount[n] = (dispCount[n] || 0) + 1;
  }));
  const lowStock = raw.inventory
    .filter(i => Number(i.quantity) <= Number(i.reorderAt ?? 10))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity))
    .slice(0, 10)
    .map(i => ({ label: i.name || '—', value: Number(i.quantity) || 0 }));
  const shifts = { Morning: 0, Afternoon: 0, Night: 0 };
  raw.notes.forEach(n => {
    if (n.authorRole !== 'nurse') return;
    const d = toDate(n.createdAt);
    if (!d) return;
    const h = d.getHours();
    shifts[h >= 7 && h < 14 ? 'Morning' : h >= 14 && h < 20 ? 'Afternoon' : 'Night']++;
  });

  return {
    overview,
    who: {
      setRows,
      sex: [
        { label: 'Male', value: sexCount.male },
        { label: 'Female', value: sexCount.female },
        ...(sexCount.unknown ? [{ label: 'Unknown', value: sexCount.unknown }] : []),
      ],
      topStudents,
      age: Object.entries(ageCount).filter(([, v]) => v > 0).map(([label, value]) => ({ label, value })),
      months,
    },
    illness: { top: illness, drugs, outcome },
    workload: {
      byDow, byHour,
      prio: Object.entries(prio).map(([label, value]) => ({ label, value })),
      avgStay: avg(stays), readmissions,
      method: [
        { label: 'QR', value: method.qr },
        { label: 'Manual', value: method.manual },
        { label: 'On visit', value: method.visit },
        ...(method.other ? [{ label: 'Other', value: method.other }] : []),
      ],
    },
    lab: {
      tests: topN(testCount, 10, false),
      status: labStatus,
      nv: [{ label: 'Normal', value: normal }, { label: 'Abnormal', value: abnormal }],
      abnormal: topN(abnCount, 10, false),
      turnaround: avg(turnaround),
    },
    referrals: {
      dest: topN(dest, 10).map(r => ({ ...r, label: titleCase(r.label) })),
      reason: topN(reason, 10).map(r => ({ ...r, label: titleCase(r.label) })),
    },
    pharmacy: {
      dispensed: topN(dispCount, 10, false).map(r => ({ ...r, label: titleCase(r.label) })),
      lowStock,
      shifts: Object.entries(shifts).map(([label, value]) => ({ label, value })),
    },
  };
}
