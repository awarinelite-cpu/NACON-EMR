// src/lib/emr.js
// ─────────────────────────────────────────────
// All Firestore operations for NACON MRS EMR
// ─────────────────────────────────────────────
import {
  doc, collection, getDocs, getDoc,
  query, where,
  orderBy, onSnapshot, runTransaction,
  serverTimestamp, Timestamp, limit, getCountFromServer,
} from 'firebase/firestore';
// Offline-safe writes: saved on the device instantly, uploaded when back online
import { setDoc, addDoc, updateDoc, deleteDoc, writeBatch } from './offlineWrites';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { enqueuePendingWrite } from './offlineDB';
import { flattenGlucoseDocs } from './glycemicGrid';
import { flattenMarDocs, courseDoseCount } from './marChart';

// ── OFFLINE-FIRST WRITE HELPER ───────────────
/**
 * Try a Firestore write; if offline, queue it for later sync.
 * @param {string}      colName   - collection name (from COL)
 * @param {string}      operation - 'add' | 'set' | 'update'
 * @param {string|null} docId     - existing doc ID (null for new docs)
 * @param {object}      data      - payload (use '__serverTimestamp__' as placeholder)
 * @param {function}    onlineFn  - async fn that does the real Firestore write
 */
// Firestore hard-rejects any field set to `undefined` (as opposed to null),
// and it does so identically every time — not a transient/network failure.
// This most commonly bites when a value comes from a user profile field
// that was never set (e.g. an account with no displayName saved). Rather
// than let a single missing field silently kill an entire clinical write
// forever, replace undefined with null so the write still goes through.
function stripUndefined(obj) {
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    clean[k] = v === undefined ? null : v;
  }
  return clean;
}

// stripUndefined only cleans top-level keys. Nested arrays/objects — like
// a prescription's `drugs` array, where individual drug entries can have
// unset fields (qty, dose, route left blank on the Rx form) — still reach
// Firestore with raw `undefined` inside them, which addDoc()/updateDoc()
// reject outright ("Unsupported field value: undefined"), failing the
// entire write. This recurses into arrays/objects so nested undefineds
// are nulled out too.
function deepStripUndefined(value) {
  if (Array.isArray(value)) return value.map(deepStripUndefined);
  // Only rebuild plain objects. Firestore values (serverTimestamp(), Timestamp, Date, refs...) must pass
  // through untouched — copying them turned serverTimestamp() into a junk map, so createdAt was never a real date.
  const proto = value && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (value && typeof value === 'object' && (proto === Object.prototype || proto === null)) {
    const clean = {};
    for (const [k, v] of Object.entries(value)) {
      clean[k] = v === undefined ? null : deepStripUndefined(v);
    }
    return clean;
  }
  return value;
}

export async function offlineWrite(colName, operation, docId, data, onlineFn) {
  if (!navigator.onLine) {
    await enqueuePendingWrite(colName, operation, docId, data);
    return { offline: true };
  }
  try {
    const result = await onlineFn();
    return { offline: false, result };
  } catch (err) {
    // Network-ish failures — queue for later sync rather than losing the record.
    // Permission/auth errors are real problems and should surface to the user.
    const networkish = ['unavailable', 'deadline-exceeded', 'internal', 'cancelled'];
    if (networkish.includes(err.code) || !navigator.onLine) {
      await enqueuePendingWrite(colName, operation, docId, data);
      return { offline: true };
    }
    throw err;
  }
}

// ── FIRESTORE COLLECTIONS ───────────────────
export const COL = {
  COUNTER:      'counters',
  PATIENTS:     'patients',
  VISITS:       'visits',
  NOTES:        'notes',
  VITALS:       'vitals',
  PRESCRIPTIONS:'prescriptions',
  FLUIDS:       'fluid_charts',
  GLUCOSE:      'glucose_charts',
  UPLOADS:      'uploads',
  REFERRALS:    'referrals',
  USERS:        'users',
  AUDIT:        'audit_log',
  TRIAGE:       'triage_queue',
  MAR:          'mar_records',
  INVENTORY:    'pharmacy_inventory',
  DISPENSE_LOG: 'dispense_log',
  SELF_REPORT:  'self_reports',
  LAB_REQUESTS: 'lab_requests',
  LAB_RESULTS:  'lab_results',
  CARE_PLANS:   'nursing_care_plans',
  ALERTS:       'clinical_alerts',
  MED_REMINDERS:    'med_reminders',
  IV_INFUSIONS:     'iv_infusions',
  GLUCOSE_SCHEDULE: 'glucose_schedule',
  TELEGRAM_LINKS:   'telegram_links',
  LINK_CODES:       'link_codes',
  SETTINGS:         'settings',
};

// ── ROLES ────────────────────────────────────
export const ROLES = {
  ADMIN:       'admin',
  SUBADMIN:    'subadmin',
  DOCTOR:      'doctor',
  NURSE:       'nurse',
  RECORDS:     'records',
  PHARMACIST:  'pharmacist',
  LAB:         'lab',
};

// ─────────────────────────────────────────────
// EMR NUMBER GENERATOR
// ─────────────────────────────────────────────
export async function generateEMRNumber() {
  const year = new Date().getFullYear();
  const counterRef = doc(db, COL.COUNTER, 'emr_sequence');

  const emrNumber = await runTransaction(db, async (txn) => {
    const snap = await txn.get(counterRef);

    let last = 0;
    if (snap.exists()) {
      last = snap.data().lastNumber || 0;
    }

    // Sequence runs continuously from 01 upward and never resets — not
    // even at year-end — so every patient gets a permanently unique number.
    const next   = last + 1;
    const padded = String(next).padStart(2, '0');
    const emr    = `EMR-${year}-${padded}`;

    txn.set(counterRef, { lastNumber: next, year, updatedAt: serverTimestamp() });
    return emr;
  });

  return emrNumber;
}

export function emrToFolderNumber(emr) {
  if (!emr) return '';
  const parts = emr.split('-');
  if (parts.length < 3) return emr;
  const year2 = String(parts[1]).slice(2);
  const seq   = parts[2];
  return `FN: ${seq}/${year2}`;
}

// ─────────────────────────────────────────────
// PATIENTS
// ─────────────────────────────────────────────
export async function registerPatient(data, registeredBy, registeredByRole = null) {
  const emrNumber    = await generateEMRNumber();
  const folderNumber = emrToFolderNumber(emrNumber);

  const patientData = {
    ...data,
    emrNumber,
    folderNumber,
    registeredBy,
    registeredAt:  serverTimestamp(),
    updatedAt:     serverTimestamp(),
    status:        'active',
    searchTokens:  buildSearchTokens(data, emrNumber),
  };

  const ref = doc(db, COL.PATIENTS, emrNumber);
  await setDoc(ref, patientData);
  await logAudit('REGISTER_PATIENT', emrNumber, registeredBy, { emrNumber, name: `${data.surname} ${data.firstName}` }, registeredByRole);

  return { emrNumber, folderNumber };
}

function buildSearchTokens(data, emr) {
  const tokens = new Set();
  const add = (str) => {
    if (!str) return;
    const s = str.toLowerCase();
    tokens.add(s);
    for (let i = 1; i <= s.length; i++) tokens.add(s.slice(0, i));
  };
  add(data.surname);
  add(data.firstName);
  add(data.otherNames);
  add(`${data.surname} ${data.firstName}`);
  add(`${data.firstName} ${data.surname}`);
  add(data.classSet);
  add(data.matricNo);
  add(emr.toLowerCase());
  return Array.from(tokens);
}

export async function getPatient(emrNumber) {
  const snap = await getDoc(doc(db, COL.PATIENTS, emrNumber));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function updatePatient(emrNumber, data, updatedBy, updatedByRole = null) {
  await updateDoc(doc(db, COL.PATIENTS, emrNumber), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
  await logAudit('UPDATE_PATIENT', emrNumber, updatedBy, data, updatedByRole);
}

export async function searchPatients(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 1) {
    const q = query(collection(db, COL.PATIENTS), orderBy('registeredAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const term = searchTerm.toLowerCase().trim();

  if (term.startsWith('emr-')) {
    const snap = await getDoc(doc(db, COL.PATIENTS, term.toUpperCase()));
    if (snap.exists()) return [{ id: snap.id, ...snap.data() }];
  }

  const q = query(
    collection(db, COL.PATIENTS),
    where('searchTokens', 'array-contains', term)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ONE shared live listener for the whole patients collection. Every page that
// calls listenPatients() reuses it (and gets the latest list instantly), so
// opening several pages no longer re-reads every patient each time. The
// listener is kept for 2 minutes after the last page leaves, so quick
// navigation between pages costs nothing.
const _patientSubs = new Set();
let _patientsUnsub = null;
let _patientsData = null;
let _patientsDetachTimer = null;

export function listenPatients(callback) {
  if (_patientsDetachTimer) { clearTimeout(_patientsDetachTimer); _patientsDetachTimer = null; }
  _patientSubs.add(callback);

  if (!_patientsUnsub) {
    const q = query(collection(db, COL.PATIENTS), orderBy('registeredAt', 'desc'));
    _patientsUnsub = onSnapshot(q, snap => {
      _patientsData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      _patientSubs.forEach(cb => cb([..._patientsData]));
    }, err => {
      console.error('listenPatients', err);
      _patientsUnsub = null; // allow a fresh attempt on the next subscribe
    });
  } else if (_patientsData) {
    callback([..._patientsData]);
  }

  return () => {
    _patientSubs.delete(callback);
    if (_patientSubs.size === 0 && !_patientsDetachTimer) {
      _patientsDetachTimer = setTimeout(() => {
        if (_patientSubs.size === 0 && _patientsUnsub) {
          _patientsUnsub(); _patientsUnsub = null; _patientsData = null;
        }
        _patientsDetachTimer = null;
      }, 120000);
    }
  };
}

// ─────────────────────────────────────────────
// CLASS SETS (SET 49, SET 50, ...) — admin-managed list
// Stored in settings/classSets as { sets: ['SET 49', ...] }
// ─────────────────────────────────────────────
export const DEFAULT_CLASS_SETS = ['SET 46', 'SET 47', 'SET 48', 'SET 49', 'SET 50', 'SET 51', 'SET 52'];

// 'set  51' / 'Set 51' / 'SET51' -> 'SET 51' so one set is never split in two
export function normalizeClassSet(v) {
  const t = String(v || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const m = t.match(/^SET\s*-?\s*(\d+)$/);
  return m ? `SET ${m[1]}` : t;
}

// Highest set number first (SET 52, SET 51, ...), non-numeric names last
export function sortClassSets(list) {
  const num = x => { const m = String(x).match(/(\d+)/); return m ? parseInt(m[1], 10) : -1; };
  return [...list].sort((a, b) => (num(b) - num(a)) || String(a).localeCompare(String(b)));
}

export function listenClassSets(callback) {
  return onSnapshot(
    doc(db, COL.SETTINGS, 'classSets'),
    snap => {
      const saved = snap.exists() ? (snap.data().sets || []) : [];
      callback([...new Set([...DEFAULT_CLASS_SETS, ...saved].map(normalizeClassSet))].filter(Boolean));
    },
    () => callback([...DEFAULT_CLASS_SETS]),
  );
}

export async function addClassSet(name, by, byRole = null) {
  const clean = normalizeClassSet(name);
  if (!clean) throw new Error('Enter a set name, e.g. SET 53');
  const ref_ = doc(db, COL.SETTINGS, 'classSets');
  const snap = await getDoc(ref_);
  const existing = snap.exists() ? (snap.data().sets || []).map(normalizeClassSet) : [];
  if (existing.includes(clean) || DEFAULT_CLASS_SETS.includes(clean)) {
    throw new Error(`${clean} already exists`);
  }
  await setDoc(ref_, { sets: [...existing, clean], updatedAt: serverTimestamp(), updatedBy: by || null }, { merge: true });
  await logAudit('ADD_CLASS_SET', clean, by, {}, byRole);
  return clean;
}

// ─────────────────────────────────────────────
// VISITS
// ─────────────────────────────────────────────
export async function createVisit(emrNumber, data, createdBy, createdByRole = null, opts = {}) {
  const visitRef = await addDoc(collection(db, COL.VISITS), {
    emrNumber,
    ...data,
    status:    'open',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (!opts.skipStamp) {
    // seenAt = moment they physically arrived at MRS (visit opened)
    const patientUpdate = {
      lastVisit: serverTimestamp(),
      seenAt:    serverTimestamp(),
      status:    'active',
    };
    // Ensure patients seen today via direct visit (not via Report Sick)
    // still show up on the "Sick Report — Today" / "Seen" tabs.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const existing = await getDoc(doc(db, COL.PATIENTS, emrNumber));
    const reportedSickAt = existing.exists() ? existing.data().reportedSickAt : null;
    const reportedToday = reportedSickAt &&
      (reportedSickAt.toDate ? reportedSickAt.toDate() : new Date(reportedSickAt)) >= today;
    if (!reportedToday) {
      patientUpdate.reportedSickAt  = serverTimestamp();
      patientUpdate.reportedSickBy  = createdBy;
      patientUpdate.reportedSickHow = 'visit';
    }
    await updatePatient(emrNumber, patientUpdate, createdBy, createdByRole);
  }
  await logAudit('CREATE_VISIT', emrNumber, createdBy, { visitId: visitRef.id }, createdByRole);
  return visitRef.id;
}

export async function getVisits(emrNumber) {
  const q = query(collection(db, COL.VISITS), where('emrNumber', '==', emrNumber));
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
  return docs;
}

// FIX: opening a patient's profile used to unconditionally call createVisit(),
// which meant admitting a patient in one page load and discharging them after
// a later page load (a very normal thing — different shift, navigated away
// and back) split the admission across two visit documents: the admission
// timestamp landed on visit A, the discharge timestamp on a brand-new,
// unrelated visit B. Neither doc then had both dates, so no complete
// admission-to-discharge record could ever be assembled.
// getOrOpenVisit reuses the most recent visit if it's still 'open' or
// 'sickbay' (i.e. not yet discharged/cancelled), so one continuous stay
// always writes to the same visit doc no matter how many times the chart
// is reopened in between.
export async function getOrOpenVisit(emrNumber, data, createdBy, createdByRole = null) {
  const visits = await getVisits(emrNumber);
  const open = visits.find(v => v.status === 'open' || v.status === 'sickbay');

  // Still stamp "seen today" bookkeeping even when reusing an existing visit.
  const patientUpdate = { lastVisit: serverTimestamp() };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const existing = await getDoc(doc(db, COL.PATIENTS, emrNumber));
  const data0 = existing.exists() ? existing.data() : {};
  const reportedSickAt = data0.reportedSickAt;
  const reportedToday = reportedSickAt &&
    (reportedSickAt.toDate ? reportedSickAt.toDate() : new Date(reportedSickAt)) >= today;
  if (!reportedToday) {
    patientUpdate.reportedSickAt  = serverTimestamp();
    patientUpdate.reportedSickBy  = createdBy;
    patientUpdate.reportedSickHow = 'visit';
  }
  const seenAt = data0.seenAt;
  const seenToday = seenAt && (seenAt.toDate ? seenAt.toDate() : new Date(seenAt)) >= today;
  if (!seenToday) patientUpdate.seenAt = serverTimestamp();
  // Don't clobber a patient who is currently admitted or already discharged —
  // only nudge status to 'active' if nothing more significant is in play.
  if (!open && data0.status !== 'sickbay' && data0.status !== 'discharged') {
    patientUpdate.status = 'active';
  }
  await updatePatient(emrNumber, patientUpdate, createdBy, createdByRole);

  if (open) return open.id;
  return createVisit(emrNumber, data, createdBy, createdByRole, { skipStamp: true });
}

// Admit a patient to the sick bay. Sets patient.status = 'sickbay' so they
// show up on the On Admission dashboard card and can later be discharged.
export async function admitPatient(emrNumber, visitId, doneBy, doneByRole = null) {
  if (visitId && visitId !== 'current') {
    try {
      await updateDoc(doc(db, COL.VISITS, visitId), {
        status: 'sickbay',
        admittedBy: doneBy,
        admittedAt: serverTimestamp(),
      });
    } catch (_) {
      // visitId may be a local fallback ID (not yet a real Firestore doc) —
      // the patient-status update below is what actually matters, so don't
      // let a missing visit doc block the admission.
    }
  }
  await updatePatient(emrNumber, { status: 'sickbay', admittedBy: doneBy, admittedAt: serverTimestamp() }, doneBy, doneByRole);
  await logAudit('ADMIT', emrNumber, doneBy, { visitId: visitId || 'none' }, doneByRole);
}

// When a patient is discharged, any prescription still marked 'active'
// belongs to the admission that just ended — left as-is, it would keep
// showing under "Active Medications" if the patient is readmitted later,
// mixing this stay's meds with a past one. Auto-close them out here so
// each admission's MAR always starts clean.
async function closeOutActiveMedications(emrNumber, doneBy, doneByRole = null) {
  try {
    const q = query(collection(db, COL.PRESCRIPTIONS), where('emrNumber', '==', emrNumber));
    const snap = await getDocs(q);
    const writes = [];
    snap.docs.forEach(d => {
      const drugs = d.data().drugs || [];
      let changed = false;
      const updated = drugs.map(dr => {
        if (!dr.status || dr.status === 'active') {
          changed = true;
          return stripUndefined({
            ...dr,
            status: 'discontinued',
            statusUpdatedBy: doneBy,
            statusUpdatedAt: new Date().toISOString(),
            statusNote: 'Auto-closed at discharge',
          });
        }
        return dr;
      });
      if (changed) writes.push(updateDoc(doc(db, COL.PRESCRIPTIONS, d.id), { drugs: updated }));
    });
    await Promise.all(writes);
  } catch (e) {
    console.error('closeOutActiveMedications failed', e);
    // Never let this block the actual discharge.
  }
}

// FIX: dischargePatient — only update visit doc if a real visitId is provided
// Discharge only makes sense for patients currently admitted to the sick bay
// (status === 'sickbay') — someone who was never admitted was never in the
// sick bay, so there is nothing to discharge them from.
export async function dischargePatient(emrNumber, visitId, dischargeNote, doneBy, doneByRole = null) {
  const current = await getPatient(emrNumber);
  if (!current || current.status !== 'sickbay') {
    throw new Error('Only patients admitted to the sick bay can be discharged');
  }
  if (visitId && visitId !== 'current') {
    try {
      await updateDoc(doc(db, COL.VISITS, visitId), {
        status: 'discharged',
        dischargeNote,
        dischargedBy: doneBy,
        dischargedAt: serverTimestamp(),
      });
    } catch (_) {
      // same rationale as admitPatient above — a missing/fallback visit doc
      // should never block the actual discharge.
    }
  }
  await updatePatient(emrNumber, { status: 'discharged', dischargeNote }, doneBy, doneByRole);
  await closeOutActiveMedications(emrNumber, doneBy, doneByRole);
  await logAudit('DISCHARGE', emrNumber, doneBy, { visitId: visitId || 'none' }, doneByRole);
}

// ─────────────────────────────────────────────
// SEEN AT MRS — stamp helper
// Called by every care function below.
// If the patient reported sick TODAY and seenAt
// has not yet been set today, stamp it now so
// they appear on the "Seen Today" board.
// ─────────────────────────────────────────────
async function markSeenIfReportedSickToday(emrNumber, by) {
  try {
    const snap = await getDoc(doc(db, COL.PATIENTS, emrNumber));
    if (!snap.exists()) return;
    const data = snap.data();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isToday = (ts) => {
      if (!ts) return false;
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d >= today;
    };

    // Only proceed if they reported sick today
    if (!isToday(data.reportedSickAt)) return;

    // Only stamp seenAt if it hasn't been set today already
    if (isToday(data.seenAt)) return;

    await updateDoc(doc(db, COL.PATIENTS, emrNumber), {
      seenAt:    serverTimestamp(),
      seenBy:    by,
      updatedAt: serverTimestamp(),
      updatedBy: by,
    });
  } catch (_) {
    // Never let this break the main care action
  }
}

// ─────────────────────────────────────────────
// CLINICAL NOTES
// ─────────────────────────────────────────────
export async function addNote(emrNumber, visitId, noteData, author, role) {
  author = author || 'Unknown staff';
  role   = role   || null;
  const ref = await addDoc(collection(db, COL.NOTES), deepStripUndefined({
    emrNumber,
    visitId:    visitId || null,
    ...noteData,
    authorName: author,
    authorRole: role,
    createdAt:  serverTimestamp(),
  }));
  await markSeenIfReportedSickToday(emrNumber, author);
  await logAudit('ADD_NOTE', emrNumber, author, { noteId: ref.id, role }, role);
  return ref.id;
}

// ─────────────────────────────────────────────
// NURSES' DUTY REPORTS (ward-level shift report, not tied to one patient).
// Stored in the existing 'notes' collection with type 'duty_report' so the
// current security rules already cover it.
// ─────────────────────────────────────────────
export async function addDutyReport({ heading, body, patientsSeen }, author, role) {
  const ref = await addDoc(collection(db, COL.NOTES), deepStripUndefined({
    type: 'duty_report', emrNumber: null, visitId: null,
    heading, body,
    patientsSeen: Array.isArray(patientsSeen) ? patientsSeen : [],
    authorName: author || 'Unknown staff', authorRole: role || null,
    createdAt: serverTimestamp(),
    createdMs: Date.now(),   // plain number: reliable ordering + "cards restart after this report" cutoff
  }));
  await logAudit('ADD_DUTY_REPORT', ref.id, author || 'Unknown staff', { heading }, role);
  return ref.id;
}

export async function updateDutyReport(id, { heading, body }, editor, role) {
  await updateDoc(doc(db, COL.NOTES, id), deepStripUndefined({
    heading, body, editedBy: editor || 'Unknown staff', editedAt: serverTimestamp(),
  }));
  await logAudit('EDIT_DUTY_REPORT', id, editor || 'Unknown staff', { heading }, role);
}

// Draft of the duty report for one shift (the "Save" button). One shared draft per shift,
// stored in 'notes' as type 'duty_report_draft' (no emrNumber, so it never shows in patient notes).
// The "Submit" button turns the draft into a real report and removes it.
export async function saveDutyDraft(shiftKey, { heading, body }, author) {
  await setDoc(doc(db, COL.NOTES, `duty_draft_${shiftKey}`), deepStripUndefined({
    type: 'duty_report_draft', emrNumber: null, visitId: null,
    heading, body,
    updatedBy: author || 'Unknown staff',
    updatedAt: serverTimestamp(),
  }));
}

export async function getDutyDraft(shiftKey) {
  const snap = await getDoc(doc(db, COL.NOTES, `duty_draft_${shiftKey}`));
  return snap.exists() ? snap.data() : null;
}

export async function deleteDutyDraft(shiftKey) {
  await deleteDoc(doc(db, COL.NOTES, `duty_draft_${shiftKey}`));
}

// "Patients seen" cutoff for a shift. Written on Submit and NOT removed when a report is deleted,
// so submitted patients never come back under the textarea.
export async function setDutyMarker(shiftKey, who) {
  await setDoc(doc(db, COL.NOTES, `duty_marker_${shiftKey}`), {
    type: 'duty_report_marker', emrNumber: null, visitId: null,
    clearedMs: Date.now(), updatedBy: who || 'Unknown staff', updatedAt: serverTimestamp(),
  });
}

export function listenDutyMarker(shiftKey, callback) {
  return onSnapshot(doc(db, COL.NOTES, `duty_marker_${shiftKey}`),
    snap => callback(snap.exists() && typeof snap.data().clearedMs === 'number' ? snap.data().clearedMs : 0),
    () => callback(0));
}

export async function deleteDutyReport(id, who, role, heading) {
  await deleteDoc(doc(db, COL.NOTES, id));
  await logAudit('DELETE_DUTY_REPORT', id, who || 'Unknown staff', { heading }, role);
}

export function listenDutyReports(callback) {
  const q = query(collection(db, COL.NOTES), where('type', '==', 'duty_report'));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Newest first. A just-submitted report still waiting for its server time (null) counts as "now".
    const ms = (d) => {
      const t = d.createdAt;
      if (t == null) return Date.now();
      if (t.toDate) return t.toDate().getTime();
      if (t.seconds != null) return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
      if (t._seconds != null) return t._seconds * 1000;
      if (typeof t === 'number') return t;
      const p = Date.parse(t);
      return Number.isNaN(p) ? 0 : p;
    };
    const when = (d) => (typeof d.createdMs === 'number' ? d.createdMs : ms(d));
    docs.sort((a, b) => when(b) - when(a));
    callback(docs.slice(0, 40));
  });
}

export function listenNotes(emrNumber, callback) {
  const q = query(collection(db, COL.NOTES), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    callback(docs);
  });
}

// ─────────────────────────────────────────────
// NURSING CARE PLAN (ADPIE — Assessment, Diagnosis, Planning,
// Implementation, Evaluation). One document per nursing diagnosis; the
// evaluation field is updated over time as care continues rather than
// creating a new document each shift.
// ─────────────────────────────────────────────
export async function addCarePlan(emrNumber, visitId, planData, author, role) {
  const ref = await addDoc(collection(db, COL.CARE_PLANS), {
    emrNumber,
    visitId: visitId || null,
    ...planData,          // { assessment, nursingDiagnosis, goal, interventions, rationale, evaluation }
    status: 'active',
    authorName: author,
    authorRole: role,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await markSeenIfReportedSickToday(emrNumber, author);
  await logAudit('ADD_CARE_PLAN', emrNumber, author, { planId: ref.id, role }, role);
  return ref.id;
}

export function listenCarePlans(emrNumber, callback) {
  const q = query(collection(db, COL.CARE_PLANS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    callback(docs);
  });
}

// Appends a dated evaluation entry to an existing care plan and can flip
// its status to 'resolved'. Keeps a running evaluation history rather than
// overwriting the previous note.
export async function updateCarePlanEvaluation(planId, evaluationNote, updatedBy, markResolved = false, updatedByRole = null) {
  const planRef = doc(db, COL.CARE_PLANS, planId);
  const snap = await getDoc(planRef);
  const prior = snap.exists() ? (snap.data().evaluationLog || []) : [];
  await updateDoc(planRef, {
    evaluationLog: [
      ...prior,
      { note: evaluationNote, by: updatedBy, at: Timestamp.now() },
    ],
    status: markResolved ? 'resolved' : (snap.exists() ? snap.data().status : 'active'),
    updatedAt: serverTimestamp(),
  });
  await logAudit('UPDATE_CARE_PLAN', snap.exists() ? snap.data().emrNumber : null, updatedBy, { planId, markResolved }, updatedByRole);
}


export async function addVitals(emrNumber, visitId, vitalsData, recordedBy, recordedByRole = null, opts = {}) {
  const ref = await addDoc(collection(db, COL.VITALS), {
    emrNumber,
    visitId: visitId || null,
    ...vitalsData,
    recordedBy,
    // opts.recordedAt: reading time chosen on the form (Date); otherwise server time
    recordedAt: opts.recordedAt ? Timestamp.fromDate(opts.recordedAt) : serverTimestamp(),
  });
  await updatePatient(emrNumber, { latestVitals: vitalsData }, recordedBy, recordedByRole);
  await markSeenIfReportedSickToday(emrNumber, recordedBy);
  await logAudit('ADD_VITALS', emrNumber, recordedBy, vitalsData, recordedByRole);
  return ref.id;
}

/** Edit an existing vitals reading (values, notes and/or reading time) */
export async function updateVitals(vitalsId, emrNumber, patch, editedBy, editedByRole = null, opts = {}) {
  await updateDoc(doc(db, COL.VITALS, vitalsId), {
    ...patch,
    ...(opts.recordedAt ? { recordedAt: Timestamp.fromDate(opts.recordedAt) } : {}),
    editedBy,
    editedAt: serverTimestamp(),
  });
  await logAudit('EDIT_VITALS', emrNumber, editedBy, { vitalsId, ...patch }, editedByRole);
}

export function listenVitals(emrNumber, callback) {
  const q = query(collection(db, COL.VITALS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.recordedAt?.seconds||0) - (a.recordedAt?.seconds||0));
    callback(docs);
  });
}

// ─────────────────────────────────────────────
// CLINICAL ALERTS (NEWS2/EWS auto-alerting)
// ─────────────────────────────────────────────
export async function createClinicalAlert(alertData, createdBy, createdByRole = null) {
  const ref = await addDoc(collection(db, COL.ALERTS), {
    ...alertData,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdBy,
    createdAt: serverTimestamp(),
  });
  await logAudit('CLINICAL_ALERT', alertData.emrNumber, createdBy, alertData, createdByRole);
  return ref.id;
}

// Listens to all unacknowledged alerts facility-wide, most recent first.
export function listenActiveAlerts(callback) {
  const q = query(collection(db, COL.ALERTS), where('acknowledged', '==', false));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(docs);
  });
}

export function listenAlertsForPatient(emrNumber, callback) {
  const q = query(collection(db, COL.ALERTS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(docs);
  });
}

export async function acknowledgeAlert(alertId, acknowledgedBy, acknowledgedByRole = null) {
  await updateDoc(doc(db, COL.ALERTS, alertId), {
    acknowledged: true,
    acknowledgedBy,
    acknowledgedAt: serverTimestamp(),
  });
  await logAudit('ACKNOWLEDGE_ALERT', null, acknowledgedBy, { alertId }, acknowledgedByRole);
}

// ─────────────────────────────────────────────
// PRESCRIPTIONS
// ─────────────────────────────────────────────
/**
 * Save a prescription AND take the prescribed drugs out of pharmacy stock.
 * Quantity per drug line = units for one dose (dose-aware, from the inventory
 * item's strength) x number of doses in the course (frequency x duration;
 * 1 dose if those can't be read). Drugs that were taken out of stock are
 * flagged `inventoryDeducted` so dispensing and MAR charting never deduct the
 * same drug a second time. Drugs with no matching inventory item are left
 * unflagged and keep the old behaviour (deduct later at dispense/MAR).
 * Returns { id, inventory } where inventory is one result per drug line.
 */
export async function addPrescriptionWithStock(emrNumber, visitId, rxData, prescribedBy, role) {
  // Prescriptions are NOT connected to pharmacy stock any more: no availability check,
  // no deduction. (Name kept so existing callers keep working; `inventory` is always empty.)
  const lines = [...(rxData || [])];
  const rxRef = doc(collection(db, COL.PRESCRIPTIONS));
  await setDoc(rxRef, {
    emrNumber,
    visitId: visitId || null,
    prescribedBy,
    prescribedByRole: role,
    dispensed: false,
    drugs: deepStripUndefined(lines),
    createdAt: serverTimestamp(),
  });

  await markSeenIfReportedSickToday(emrNumber, prescribedBy);
  await logAudit('PRESCRIPTION', emrNumber, prescribedBy, {}, role);
  return { id: rxRef.id, inventory: [] };
}

/**
 * Call BEFORE saving a prescription. If a drug is prescribed at a strength the
 * pharmacy doesn't stock (e.g. amlodipine 5mg when only 10mg is in inventory),
 * tell the user and ask. OK = take it from the nearest stocked strength;
 * Cancel = returns null so the caller saves nothing. Returns the drug lines
 * (with `inventoryItemId` set where a substitute was accepted).
 */
export async function confirmRxStock(rxData) {
  // Prescriptions are no longer connected to pharmacy stock: nothing to check or ask.
  return (rxData || []).map(d => ({ ...d }));
}

export async function addPrescription(emrNumber, visitId, rxData, prescribedBy, role) {
  const { id } = await addPrescriptionWithStock(emrNumber, visitId, rxData, prescribedBy, role);
  return id;
}

export function listenPrescriptions(emrNumber, callback) {
  const q = query(collection(db, COL.PRESCRIPTIONS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    callback(docs);
  });
}

/**
 * Update a single drug's clinical status within a prescription's drugs array.
 * status: 'active' | 'discontinued' | 'completed' | 'withheld'
 */
export async function updateDrugStatus(prescriptionId, drugIndex, status, updatedBy, updatedByRole = null) {
  const ref  = doc(db, COL.PRESCRIPTIONS, prescriptionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const drugs = [...(snap.data().drugs || [])];
  if (!drugs[drugIndex]) return;
  const drugName = drugs[drugIndex].drug;
  drugs[drugIndex] = stripUndefined({
    ...drugs[drugIndex],
    status,
    statusUpdatedBy: updatedBy,
    statusUpdatedAt: new Date().toISOString(),
  });
  await updateDoc(ref, { drugs });
  await logAudit('DRUG_STATUS_UPDATE', prescriptionId, updatedBy, { drug: drugName, status }, updatedByRole);
}

// ─────────────────────────────────────────────
// FLUID CHART
// ─────────────────────────────────────────────
export async function addFluidEntry(emrNumber, visitId, entry, recordedBy, recordedByRole = null) {
  const ref = await addDoc(collection(db, COL.FLUIDS), {
    emrNumber,
    visitId: visitId || null,
    ...entry,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await markSeenIfReportedSickToday(emrNumber, recordedBy);
  await logAudit('FLUID_ENTRY', emrNumber, recordedBy, entry, recordedByRole);
  return ref.id;
}

export function listenFluidChart(emrNumber, callback) {
  const q = query(collection(db, COL.FLUIDS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (a.recordedAt?.seconds||0) - (b.recordedAt?.seconds||0));
    callback(docs);
  });
}

// ─────────────────────────────────────────────
// GLUCOSE CHART
// ─────────────────────────────────────────────
export async function addGlucoseReading(emrNumber, visitId, entry, recordedBy, recordedByRole = null) {
  const ref = await addDoc(collection(db, COL.GLUCOSE), {
    emrNumber,
    visitId: visitId || null,
    ...entry,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await markSeenIfReportedSickToday(emrNumber, recordedBy);
  await logAudit('GLUCOSE_ENTRY', emrNumber, recordedBy, entry, recordedByRole);
  return ref.id;
}

// callback(readings, rawDocs):
//   readings — flat per-reading list (grid rows expanded) used by the timeline,
//              summaries and trend chart
//   rawDocs  — the stored docs as-is (grid rows + any older one-reading docs),
//              used by the editable glycemic grid
export function listenGlucoseChart(emrNumber, callback) {
  const q = query(collection(db, COL.GLUCOSE), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (a.recordedAt?.seconds||0) - (b.recordedAt?.seconds||0));
    callback(flattenGlucoseDocs(docs), docs);
  });
}

// Editable glycemic grid: one doc per table row (kind:'row') in glucose_charts.
export function newGlucoseRowId() {
  return doc(collection(db, COL.GLUCOSE)).id;
}

function glucoseRowPayload(emrNumber, visitId, r, recordedBy) {
  return stripUndefined({
    emrNumber,
    visitId: visitId || null,
    kind: 'row',
    chartType: r.chartType,
    date: r.date || '',
    time: r.time || '',
    cells: (r.cells || []).map(c => (c == null ? '' : String(c))),
    remark: r.remark || '',
    order: r.order || Date.now(),
    recordedBy,
    updatedAt: serverTimestamp(),
    ...(r.isNew ? { recordedAt: serverTimestamp() } : {}),
  });
}

export async function saveGlucoseRows(emrNumber, visitId, rows, recordedBy, recordedByRole = null) {
  if (!rows.length) return;
  const batch = writeBatch(db);
  rows.forEach(r => batch.set(doc(db, COL.GLUCOSE, r.id), glucoseRowPayload(emrNumber, visitId, r, recordedBy), { merge: true }));
  await batch.commit();
  await markSeenIfReportedSickToday(emrNumber, recordedBy);
  await logAudit('GLUCOSE_ENTRY', emrNumber, recordedBy, {
    rows: rows.map(r => ({ chartType: r.chartType, date: r.date, time: r.time, cells: r.cells, remark: r.remark })),
  }, recordedByRole);
}

export async function deleteGlucoseRow(emrNumber, rowId, row, performedBy, performedByRole = null) {
  await deleteDoc(doc(db, COL.GLUCOSE, rowId));
  await logAudit('GLUCOSE_ROW_DELETED', emrNumber, performedBy,
    { chartType: row?.chartType, date: row?.date, time: row?.time, cells: row?.cells, remark: row?.remark }, performedByRole);
}

// One-time move of older one-reading docs into grid rows. The old docs are
// kept (flagged migratedToGrid) rather than deleted.
export async function migrateLegacyGlucose(emrNumber, visitId, rows, legacyIds, performedBy, performedByRole = null) {
  const ops = [
    ...rows.map(r => ({ ref: doc(db, COL.GLUCOSE, r.id), data: glucoseRowPayload(emrNumber, visitId, r, performedBy), merge: true })),
    ...legacyIds.map(id => ({ ref: doc(db, COL.GLUCOSE, id), data: { migratedToGrid: true }, merge: true })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(o => batch.set(o.ref, o.data, { merge: o.merge }));
    await batch.commit();
  }
  await logAudit('GLUCOSE_MIGRATED_TO_GRID', emrNumber, performedBy, { readings: legacyIds.length, rows: rows.length }, performedByRole);
}

// ─────────────────────────────────────────────
// FILE UPLOADS
// ─────────────────────────────────────────────
export async function uploadPatientFile(emrNumber, visitId, file, category, uploadedBy, uploadedByRole = null) {
  const path = `patients/${emrNumber}/uploads/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const docRef = await addDoc(collection(db, COL.UPLOADS), {
    emrNumber,
    visitId: visitId || null,
    fileName:    file.name,
    fileType:    file.type,
    fileSize:    file.size,
    storagePath: path,
    downloadUrl: url,
    category,
    uploadedBy,
    uploadedAt:  serverTimestamp(),
  });

  await logAudit('FILE_UPLOAD', emrNumber, uploadedBy, { fileName: file.name, category }, uploadedByRole);
  await markSeenIfReportedSickToday(emrNumber, uploadedBy);
  return { id: docRef.id, downloadUrl: url };
}

/** Upload a document file tied to a lab request (report, scan, etc.) */
export async function uploadLabResultFile(emrNumber, requestId, file, uploadedBy, uploadedByRole = null) {
  const path = `patients/${emrNumber}/lab_results/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  // Store as a patient upload with category 'lab_result'
  const docRef = await addDoc(collection(db, COL.UPLOADS), {
    emrNumber,
    requestId: requestId || null,
    fileName:    file.name,
    fileType:    file.type,
    fileSize:    file.size,
    storagePath: path,
    downloadUrl: url,
    category:    'lab_result',
    uploadedBy,
    uploadedAt:  serverTimestamp(),
  });

  // Attach file reference on the request document too
  if (requestId) {
    await updateDoc(doc(db, COL.LAB_REQUESTS, requestId), {
      attachedFile:     url,
      attachedFileName: file.name,
      updatedAt:        serverTimestamp(),
    });
  }

  await logAudit('LAB_FILE_UPLOAD', emrNumber, uploadedBy, { fileName: file.name, requestId }, uploadedByRole);
  return { id: docRef.id, downloadUrl: url };
}

export function listenUploads(emrNumber, callback) {
  const q = query(collection(db, COL.UPLOADS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.uploadedAt?.seconds||0) - (a.uploadedAt?.seconds||0));
    callback(docs);
  });
}

// ─────────────────────────────────────────────
// REFERRALS
// ─────────────────────────────────────────────
export async function createReferral(emrNumber, visitId, referralData, referredBy, referredByRole = null) {
  const ref = await addDoc(collection(db, COL.REFERRALS), {
    emrNumber,
    visitId: visitId || null,
    ...referralData,
    referredBy,
    createdAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { status: 'referred' }, referredBy, referredByRole);
  await logAudit('REFERRAL', emrNumber, referredBy, referralData, referredByRole);
  return ref.id;
}

// ─────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────
export async function createUser(uid, userData) {
  await setDoc(doc(db, COL.USERS, uid), {
    ...userData,
    createdAt: serverTimestamp(),
    active: true,
  });
}

export async function getUser(uid) {
  const snap = await getDoc(doc(db, COL.USERS, uid));
  return snap.exists() ? { uid: snap.id, ...snap.data() } : null;
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, COL.USERS));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

export async function updateUserRole(uid, role, updatedBy, updatedByRole = null) {
  await updateDoc(doc(db, COL.USERS, uid), { role, updatedBy, updatedAt: serverTimestamp() });
  await logAudit('UPDATE_ROLE', uid, updatedBy, { newRole: role }, updatedByRole);
}

export async function updateUserProfile(uid, updates, updatedBy, updatedByRole = null) {
  // updates: { displayName?, phone? } — for fixing missing/incorrect staff details
  await updateDoc(doc(db, COL.USERS, uid), {
    ...stripUndefined(updates),
    updatedBy,
    updatedAt: serverTimestamp(),
  });
  await logAudit('UPDATE_USER_PROFILE', uid, updatedBy, updates, updatedByRole);
}

export async function deactivateUser(uid, doneBy, doneByRole = null) {
  await updateDoc(doc(db, COL.USERS, uid), {
    active: false,
    deactivatedBy: doneBy,
    deactivatedAt: serverTimestamp(),
  });
  await logAudit('DEACTIVATE_USER', uid, doneBy, {}, doneByRole);
}

export async function reactivateUser(uid, doneBy, doneByRole = null) {
  await updateDoc(doc(db, COL.USERS, uid), {
    active: true,
    reactivatedBy: doneBy,
    reactivatedAt: serverTimestamp(),
  });
  await logAudit('REACTIVATE_USER', uid, doneBy, {}, doneByRole);
}

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────
export async function logAudit(action, targetId, performedBy, details = {}, performedByRole = null) {
  try {
    await addDoc(collection(db, COL.AUDIT), {
      action, targetId, performedBy, details,
      performedByRole: performedByRole || details?.role || null,
      timestamp: serverTimestamp(),
    });
  } catch (_) {
    // Audit logging should never break the main flow
  }
}

// Every ADMIT/DISCHARGE action is logged here regardless of whether the
// visits/{id} doc write itself succeeded — so it doubles as a recovery
// source for admission episodes whose visit doc is missing admittedAt/
// dischargedAt (e.g. from the ensureVisitId race described above).
export async function getAuditForPatient(emrNumber, actions = null) {
  const q = query(collection(db, COL.AUDIT), where('targetId', '==', emrNumber));
  const snap = await getDocs(q);
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (actions) docs = docs.filter(d => actions.includes(d.action));
  docs.sort((a,b) => (a.timestamp?.seconds||0) - (b.timestamp?.seconds||0));
  return docs;
}

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────
// Patient count: cheap server-side count when online; from the on-device
// cache when offline (a count query needs the network).
async function countPatients() {
  try {
    const c = await getCountFromServer(collection(db, COL.PATIENTS));
    return c.data().count;
  } catch (_) {
    try { return (await getDocs(collection(db, COL.PATIENTS))).size; } catch (e) { return 0; }
  }
}

export async function getTodayStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);

  const [visitsSnap, patientsTotal] = await Promise.all([
    getDocs(query(collection(db, COL.VISITS), where('createdAt', '>=', todayTs))),
    countPatients(), // 1 read per 1,000 docs instead of 1 per patient
  ]);

  const visits = visitsSnap.docs.map(d => d.data());
  return {
    totalPatients: patientsTotal,
    visitsToday:   visits.length,
    waiting:       0,   // not used — AppShell uses listenTriageQueue for live badge
    referred:      visits.filter(v => v.status === 'referred').length,
    discharged:    visits.filter(v => v.status === 'discharged').length,
    sickBay:       visits.filter(v => v.status === 'sickbay').length,
  };
}



// ─────────────────────────────────────────────
// MEDICATION ADMINISTRATION RECORD (MAR)
// ─────────────────────────────────────────────
export async function recordAdministration(data) {
  // data: { emrNumber, rxId, drug, dose, route, scheduledFreq,
  //         status, administeredAt, notes,
  //         administeredBy, administeredByRole }
  const safeData = stripUndefined({
    ...data,
    administeredBy: data.administeredBy || 'Unknown staff',
  });
  const { offline, result } = await offlineWrite(
    COL.MAR, 'add', null,
    { ...safeData, createdAt: '__serverTimestamp__' },
    async () => addDoc(collection(db, COL.MAR), { ...safeData, createdAt: serverTimestamp() })
  );

  // Best-effort side effects — safe to attempt even when offline,
  // since both are already wrapped in their own try/catch internally.
  markSeenIfReportedSickToday(safeData.emrNumber, safeData.administeredBy);
  logAudit('MAR_RECORD', safeData.emrNumber, safeData.administeredBy, {
    drug:   safeData.drug,
    status: safeData.status,
    route:  safeData.route,
    time:   safeData.administeredAt,
  }, safeData.administeredByRole);

  // Deduct pharmacy inventory only when the dose was actually given
  // (not for 'held' / 'refused' statuses). Best-effort in the sense that
  // a stock miss (e.g. drug not tracked in pharmacy inventory, or offline)
  // never blocks the MAR record itself — but we DO report it back to the
  // caller so the nurse can be told stock wasn't touched, instead of it
  // failing silently.
  let inventoryResult = null;
  if (!offline && String(safeData.status).toLowerCase() === 'given' && safeData.drug && !data.stockAlreadyDeducted) {
    try {
      inventoryResult = await deductInventoryByDose(
        safeData.drug,
        safeData.dose,
        safeData.emrNumber,
        safeData.administeredBy,
        safeData.administeredByRole
      );
    } catch (err) {
      console.error('[recordAdministration] inventory deduction failed:', err);
      inventoryResult = { found: false, error: true };
    }
  }

  return { offline, id: offline ? null : result.id, inventoryResult };
}

// callback(records, rawDocs):
//   records — one record per drug administration (chart rows expanded), which is
//             what MARPage, the medication log and the care summary expect
//   rawDocs — stored docs as-is (chart rows + older one-drug records), used by
//             the Drug Course Chart style MAR tab
export function listenMAR(emrNumber, callback) {
  const q = query(collection(db, COL.MAR), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
    callback(flattenMarDocs(docs), docs);
  });
}

// ── Drug Course Chart style MAR: one doc per chart row (kind:'row') ──
export function newMarRowId() {
  return doc(collection(db, COL.MAR)).id;
}

function marRowPayload(emrNumber, visitId, r, by, byRole) {
  return stripUndefined({
    emrNumber,
    visitId: visitId || null,
    kind: 'row',
    date: r.date || '',
    time: r.time || '',
    given: (r.given || []).map(g => ({ key: g.key, rxId: g.rxId, idx: g.idx, name: g.name, dose: g.dose || '', freq: g.freq || '', num: g.num ?? null })),
    skipped: (r.skipped || []).map(s => ({ key: s.key, rxId: s.rxId, idx: s.idx, name: s.name, dose: s.dose || '', reason: s.reason || '', num: s.num ?? null })),
    dose: r.dose || 'AP',
    route: r.route || '',
    nurse: r.nurse || by,
    remark: r.remark || '',
    order: r.order || Date.now(),
    administeredBy: r.nurse || by,
    administeredByRole: r.administeredByRole || byRole || null,
    updatedAt: serverTimestamp(),
    ...(r.isNew ? { createdAt: serverTimestamp() } : {}),
  });
}

// rows: chart rows to save. prevGiven: { [rowId]: [drugKey,...] } — drugs each
// row already had as "given" when last saved; only newly-given drugs deduct
// pharmacy stock, so re-saving or editing a row never deducts twice.
export async function saveMarRows(emrNumber, visitId, rows, prevGiven, by, byRole = null, skipStockKeys = null) {
  if (!rows.length) return { inventory: [] };
  const batch = writeBatch(db);
  rows.forEach(r => batch.set(doc(db, COL.MAR, r.id), marRowPayload(emrNumber, visitId, r, by, byRole), { merge: true }));
  await batch.commit();
  markSeenIfReportedSickToday(emrNumber, by);
  logAudit('MAR_RECORD', emrNumber, by, {
    rows: rows.map(r => ({
      date: r.date, time: r.time, dose: r.dose, route: r.route, remark: r.remark,
      given: (r.given || []).map(g => g.name), notGiven: (r.skipped || []).map(s => `${s.name}: ${s.reason}`),
    })),
  }, byRole);

  // Charting a dose no longer touches pharmacy stock.
  return { inventory: [] };
}

export async function deleteMarRow(emrNumber, rowId, row, by, byRole = null) {
  await deleteDoc(doc(db, COL.MAR, rowId));
  await logAudit('MAR_ROW_DELETED', emrNumber, by, {
    date: row?.date, time: row?.time, given: (row?.given || []).map(g => g.name),
    notGiven: (row?.skipped || []).map(s => s.name),
  }, byRole);
}

// One-time move of older one-drug-at-a-time records into chart rows. The old
// docs are kept (flagged migratedToChart), never deleted.
export async function migrateLegacyMar(emrNumber, visitId, rows, legacyIds, by, byRole = null) {
  const ops = [
    ...rows.map(r => ({ ref: doc(db, COL.MAR, r.id), data: marRowPayload(emrNumber, visitId, r, by, byRole) })),
    ...legacyIds.map(id => ({ ref: doc(db, COL.MAR, id), data: { migratedToChart: true } })),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(o => batch.set(o.ref, o.data, { merge: true }));
    await batch.commit();
  }
  await logAudit('MAR_MIGRATED_TO_CHART', emrNumber, by, { records: legacyIds.length }, byRole);
}

// Edit non-status fields of one prescribed drug (e.g. Route, which the
// prescription form doesn't capture but the drug chart shows).
export async function updateDrugFields(prescriptionId, drugIndex, patch, updatedBy, updatedByRole = null) {
  const ref  = doc(db, COL.PRESCRIPTIONS, prescriptionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const drugs = [...(snap.data().drugs || [])];
  if (!drugs[drugIndex]) return;
  const drugName = drugs[drugIndex].drug;
  drugs[drugIndex] = stripUndefined({ ...drugs[drugIndex], ...patch });
  await updateDoc(ref, { drugs });
  await logAudit('DRUG_FIELDS_UPDATE', prescriptionId, updatedBy, { drug: drugName, ...patch }, updatedByRole);
}

export async function getMARForDate(emrNumber, dateObj) {
  // Returns all MAR records for a given date (client-side filter)
  const q = query(collection(db, COL.MAR), where('emrNumber', '==', emrNumber));
  const snap = await getDocs(q);
  const start = new Date(dateObj); start.setHours(0,0,0,0);
  const end   = new Date(dateObj); end.setHours(23,59,59,999);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(m => {
      const ts = m.createdAt?.toDate?.();
      return ts && ts >= start && ts <= end;
    });
}

// ─────────────────────────────────────────────
// TRIAGE
// ─────────────────────────────────────────────
export async function assignTriage(emrNumber, triageData, triagedBy, triagedByRole) {
  const patSnap = await getDoc(doc(db, COL.PATIENTS, emrNumber));
  const pt = patSnap.exists() ? patSnap.data() : {};

  const ref = await addDoc(collection(db, COL.TRIAGE), {
    emrNumber,
    surname:        pt.surname    || '',
    firstName:      pt.firstName  || '',
    classSet:       pt.classSet   || '',
    priority:       triageData.priority,
    chiefComplaint: triageData.chiefComplaint || '',
    status:         'waiting',
    triagedBy,
    triagedByRole,
    arrivedAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });

  await updatePatient(emrNumber, {
    triagePriority: triageData.priority,
    status: 'active',
  }, triagedBy, triagedByRole);

  await logAudit('TRIAGE_ASSIGN', emrNumber, triagedBy, {
    priority: triageData.priority,
    triageId: ref.id,
  }, triagedByRole);

  return ref.id;
}

export async function updateTriageStatus(triageId, newStatus, updatedBy, updatedByRole = null) {
  await updateDoc(doc(db, COL.TRIAGE, triageId), {
    status:    newStatus,
    updatedAt: serverTimestamp(),
    updatedBy,
    ...(newStatus === 'done' ? { completedAt: serverTimestamp() } : {}),
  });
  await logAudit('TRIAGE_STATUS', triageId, updatedBy, { newStatus }, updatedByRole);
}

export function listenTriageQueue(callback) {
  // Single-field where only — avoids composite index. Sort client-side.
  const q = query(
    collection(db, COL.TRIAGE),
    where('status', '==', 'waiting')
  );
  return onSnapshot(q, snap => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const rows = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => {
        const ts = t.arrivedAt?.toDate?.();
        return ts && ts.getTime() >= todayMs;
      });

    const order = { P1: 0, P2: 1, P3: 2 };
    rows.sort((a, b) => {
      const pd = (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
      if (pd !== 0) return pd;
      return (a.arrivedAt?.seconds || 0) - (b.arrivedAt?.seconds || 0);
    });

    callback(rows);
  });
}

// ─────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────
export function formatTs(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' });
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
}

export function formatDateTime(ts) {
  return `${formatTs(ts)} ${formatTime(ts)}`;
}

// ═════════════════════════════════════════════
// PHARMACY INVENTORY
// ═════════════════════════════════════════════
export function listenInventory(callback) {
  const q = query(collection(db, COL.INVENTORY), orderBy('name', 'asc'));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function addInventoryItem(data, addedBy, addedByRole = ROLES.PHARMACIST) {
  const qty = Number(data.quantity) || 0;
  const ref = await addDoc(collection(db, COL.INVENTORY), {
    ...data,
    quantity:       qty,
    initialQuantity: qty,   // baseline batch size — used to compute % used for stock color
    reorderAt:      Number(data.reorderAt) || 10,
    createdAt:      serverTimestamp(),
    updatedAt:      serverTimestamp(),
  });
  await logAudit('INVENTORY_ADD', ref.id, addedBy, { name: data.name }, addedByRole);
  return ref.id;
}

export async function updateInventoryItem(id, data, updatedBy, updatedByRole = ROLES.PHARMACIST) {
  await updateDoc(doc(db, COL.INVENTORY, id), { ...data, updatedAt: serverTimestamp() });
  await logAudit('INVENTORY_UPDATE', id, updatedBy, data, updatedByRole);
}

/** One-time fetch of all inventory items (for stock-check during prescription) */
export async function getInventorySnapshot() {
  const snap = await getDocs(collection(db, COL.INVENTORY));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Bulk-import inventory rows (e.g. from a parsed CSV shipment/stock sheet).
 * rows: [{ name, category?, quantity, unit?, reorderAt?, location?, notes? }]
 *
 * Matching is by drug name (case-insensitive):
 *  - New name         → creates a new inventory item.
 *  - Matches existing  → ADDS the row's quantity onto the current stock
 *                        (i.e. the CSV represents a shipment/delivery being
 *                        received, not an absolute replacement of the count).
 * Rows missing a name or a valid non-negative quantity are skipped and
 * reported back rather than aborting the whole batch.
 */
export async function bulkUploadInventory(rows, addedBy, addedByRole = ROLES.PHARMACIST) {
  const snap = await getDocs(collection(db, COL.INVENTORY));
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const result = { added: 0, restocked: 0, skipped: [] };

  for (const row of rows) {
    const name = (row.name || '').toString().trim();
    const qty  = Number(row.quantity);
    if (!name || !Number.isFinite(qty) || qty < 0) {
      result.skipped.push({ row, reason: !name ? 'missing name' : 'missing/invalid quantity' });
      continue;
    }

    const match = existing.find(i => i.name?.toLowerCase() === name.toLowerCase());
    if (match) {
      const newQty = (match.quantity || 0) + qty;
      await updateDoc(doc(db, COL.INVENTORY, match.id), {
        quantity: newQty,
        // Widen the baseline so the low-stock % calculation stays meaningful
        // after a restock, same convention as the manual restock flow.
        initialQuantity: Math.max(match.initialQuantity || 0, newQty),
        ...(row.category  ? { category: row.category }        : {}),
        ...(row.unit      ? { unit: row.unit }                 : {}),
        ...(row.location  ? { location: row.location }         : {}),
        ...(row.reorderAt ? { reorderAt: Number(row.reorderAt) || match.reorderAt } : {}),
        updatedAt: serverTimestamp(),
      });
      await logAudit('INVENTORY_BULK_RESTOCK', match.id, addedBy, { name, added: qty, remaining: newQty }, addedByRole);
      match.quantity = newQty; // keep in sync in case the CSV lists the same drug twice
      result.restocked++;
    } else {
      const ref = await addDoc(collection(db, COL.INVENTORY), {
        name,
        category:        row.category  || '',
        quantity:        qty,
        initialQuantity: qty,
        unit:            row.unit      || 'tablets',
        reorderAt:       Number(row.reorderAt) || 10,
        location:        row.location  || '',
        notes:           row.notes     || '',
        createdAt:       serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });
      await logAudit('INVENTORY_BULK_ADD', ref.id, addedBy, { name, quantity: qty }, addedByRole);
      existing.push({ id: ref.id, name, quantity: qty, initialQuantity: qty, reorderAt: Number(row.reorderAt) || 10 });
      result.added++;
    }
  }

  return result;
}

export async function deductInventory(drugName, qty, emrNumber, dispensedBy, dispensedByRole = ROLES.PHARMACIST) {
  const snap = await getDocs(collection(db, COL.INVENTORY));
  const { match, ambiguous } = findInventoryMatch(snap.docs, drugName);
  if (!match) return { found: false, ambiguous };
  const current = match.data().quantity || 0;
  const newQty  = Math.max(0, current - qty);
  await updateDoc(doc(db, COL.INVENTORY, match.id), {
    quantity: newQty, updatedAt: serverTimestamp(),
  });
  await logAudit('INVENTORY_DISPENSE', match.id, dispensedBy, {
    drug: drugName, qty, emrNumber, remaining: newQty,
  }, dispensedByRole);
  return { found: true, remaining: newQty, low: newQty <= (match.data().reorderAt || 10) };
}

// Strips route prefixes, dose strengths, and punctuation so slightly
// different free-text names for the same drug ('Paracetamol' on a Rx vs
// 'Paracetamol 500mg' in inventory, or 'IV Paracetamol' vs 'Paracetamol')
// can still be recognized as the same underlying drug for stock matching.
function normalizeDrugName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(iv|im|sc|subcut|po|oral|pr|top(?:ical)?|tabs?|tablets?|caps?|capsules?|inj(?:ection)?|amp(?:oule)?s?|vials?|susp(?:ension)?|syrup|solution)\b/g, ' ')
    .replace(/[\d.]+\s*(mcg|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|units?|%)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the inventory item matching a free-text prescribed drug name,
 * using progressively looser tiers — but only trusts a looser tier when
 * it resolves to exactly ONE item, to avoid deducting from the wrong
 * formulation/strength when the pharmacy stocks more than one product
 * under a similar name (e.g. 'IV Paracetamol 300mg' ampoules vs an oral
 * 'Paracetamol 500mg' tablet — genuinely different products).
 *
 *  1. Exact name match (case/whitespace-insensitive).
 *  2. Raw substring match — one full name contains the other, e.g. the Rx
 *     says 'IV paracetamol' and inventory has 'IV Paracetamol 300mg'.
 *     This still respects a route prefix like 'IV' that only one
 *     candidate has, so it correctly disambiguates the case above (the
 *     oral 'Paracetamol 500mg' entry doesn't contain 'iv paracetamol').
 *  3. Fully normalized base-name match (route/strength/units stripped) —
 *     the loosest tier, last resort.
 *
 * Returns { match, ambiguous } — ambiguous is the list of inventory names
 * that tied at whichever tier produced more than one candidate.
 */
function findInventoryMatch(invDocs, drugName) {
  const rxLower = drugName?.toLowerCase().trim();
  if (!rxLower) return { match: null, ambiguous: null };

  let match = invDocs.find(d => d.data().name?.toLowerCase().trim() === rxLower);
  if (match) return { match, ambiguous: null };

  const subCandidates = invDocs.filter(d => {
    const invLower = d.data().name?.toLowerCase().trim() || '';
    return invLower && (invLower.includes(rxLower) || rxLower.includes(invLower));
  });
  if (subCandidates.length === 1) return { match: subCandidates[0], ambiguous: null };
  if (subCandidates.length > 1) return { match: null, ambiguous: subCandidates.map(d => d.data().name) };

  const norm = normalizeDrugName(drugName);
  if (norm) {
    const normCandidates = invDocs.filter(d => normalizeDrugName(d.data().name) === norm);
    if (normCandidates.length === 1) return { match: normCandidates[0], ambiguous: null };
    if (normCandidates.length > 1) return { match: null, ambiguous: normCandidates.map(d => d.data().name) };
  }

  return { match: null, ambiguous: null };
}

// Extracts a numeric strength/amount from a free-text label, e.g.
// "IV Paracetamol 300mg" -> {amount:300, kind:'mg'}, "900mg" -> {amount:900, kind:'mg'},
// "1g" -> {amount:1000, kind:'mg'}, "500ml" -> {amount:500, kind:'ml'}.
// Mass units are normalized to mg so different units on either side
// (item strength vs administered dose) still compare correctly.
function parseDoseAmount(text) {
  if (!text) return null;
  const m = String(text).match(
    /([\d.]+)\s*(mcg|micrograms?|mg|milligrams?|g|grams?|ml|millilit(?:er|re)s?|iu|units?)\b/i
  );
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const rawUnit = m[2].toLowerCase();
  if (rawUnit.startsWith('mcg') || rawUnit.startsWith('microgram'))
    return { amount: value / 1000, kind: 'mg' };
  if (rawUnit.startsWith('mg') || rawUnit.startsWith('milligram'))
    return { amount: value, kind: 'mg' };
  if (rawUnit.startsWith('g') || rawUnit.startsWith('gram'))
    return { amount: value * 1000, kind: 'mg' };
  if (rawUnit.startsWith('ml') || rawUnit.startsWith('millilit'))
    return { amount: value, kind: 'ml' };
  if (rawUnit.startsWith('iu') || rawUnit.startsWith('unit'))
    return { amount: value, kind: 'iu' };
  return null;
}

// ── Strength-aware stock matching (used when prescribing) ─────────────────
const ROUTE_RE = /\b(iv|im|sc|subcut|po|oral|pr|top(?:ical)?)\b/i;
function routeOf(name) {
  const m = String(name || '').match(ROUTE_RE);
  if (!m) return null;
  const r = m[1].toLowerCase();
  return r === 'oral' ? 'po' : r === 'subcut' ? 'sc' : r.startsWith('top') ? 'top' : r;
}
function sameStrength(a, b) {
  return !!a && !!b && a.kind === b.kind && Math.abs(a.amount - b.amount) < 1e-6;
}

/**
 * Finds the inventory item a prescribed drug line comes out of, matching on
 * STRENGTH as well as name: amlodipine 5mg only ever takes from the 5mg item,
 * never the 10mg one. Returns one of
 *   { match }                         – the item to deduct from
 *   { ambiguous: [names] }            – can't tell which item (don't deduct)
 *   { unavailable: { alternatives } } – that strength isn't stocked but other
 *                                       strengths of the drug are (nearest first)
 *   {}                                – nothing in inventory matches
 */
function resolveRxStock(invDocs, drugName, dose, forcedId) {
  if (forcedId) {
    const forced = invDocs.find(d => d.id === forcedId);
    if (forced) return { match: forced };
  }
  const rxLower = String(drugName || '').toLowerCase().trim();
  if (!rxLower) return {};
  const exact = invDocs.find(d => d.data().name?.toLowerCase().trim() === rxLower);
  if (exact) return { match: exact };

  const base = normalizeDrugName(drugName);
  let cands = base ? invDocs.filter(d => normalizeDrugName(d.data().name) === base) : [];
  const rxRoute = routeOf(drugName);
  if (rxRoute) {
    const sameRoute = cands.filter(d => routeOf(d.data().name) === rxRoute);
    if (sameRoute.length) cands = sameRoute;
  }
  if (!cands.length) return findInventoryMatch(invDocs, drugName);   // looser name tiers

  const names = list => list.map(d => d.data().name);
  const rxStrength = parseDoseAmount(drugName);
  if (rxStrength) {
    const eq = cands.filter(d => sameStrength(parseDoseAmount(d.data().name), rxStrength));
    if (eq.length === 1) return { match: eq[0] };
    if (eq.length > 1) return { ambiguous: names(eq) };
    const noStrength = cands.filter(d => !parseDoseAmount(d.data().name));
    if (noStrength.length === 1) return { match: noStrength[0] };
    const alternatives = cands
      .filter(d => { const s = parseDoseAmount(d.data().name); return s && s.kind === rxStrength.kind; })
      .sort((a, b) => Math.abs(parseDoseAmount(a.data().name).amount - rxStrength.amount)
                    - Math.abs(parseDoseAmount(b.data().name).amount - rxStrength.amount));
    if (alternatives.length) return { unavailable: { alternatives } };
    return cands.length === 1 ? { match: cands[0] } : { ambiguous: names(cands) };
  }

  // No strength in the drug name — a single product is the match; otherwise use the dose.
  if (cands.length === 1) return { match: cands[0] };
  const doseStrength = parseDoseAmount(dose);
  if (doseStrength) {
    const eq = cands.filter(d => sameStrength(parseDoseAmount(d.data().name), doseStrength));
    if (eq.length === 1) return { match: eq[0] };
  }
  return { ambiguous: names(cands) };
}

// Units of an inventory item in one dose, from the item's strength (e.g. 500mg dose of a 250mg tab = 2).
function unitsForDose(itemName, doseGiven) {
  const perUnit = parseDoseAmount(itemName);
  const given   = parseDoseAmount(doseGiven);
  if (perUnit && given && perUnit.kind === given.kind && perUnit.amount > 0) {
    return { qty: Math.max(1, Math.round(given.amount / perUnit.amount)), doseAware: true };
  }
  return { qty: 1, doseAware: false };
}

/**
 * Dose-aware inventory deduction — used for MAR administration.
 * Reads the per-unit strength from the inventory item's name
 * (e.g. "IV Paracetamol 300mg" = 300mg per ampoule) and the amount
 * actually given (e.g. "900mg"), and deducts the equivalent number
 * of ampoules/units (900 / 300 = 3), rounded to the nearest whole unit.
 * Falls back to deducting 1 unit if either amount can't be parsed or
 * the units are incompatible (e.g. mg vs ml).
 */
export async function deductInventoryByDose(drugName, doseGiven, emrNumber, dispensedBy, dispensedByRole = ROLES.PHARMACIST, doses = 1) {
  const snap = await getDocs(collection(db, COL.INVENTORY));
  const { match, ambiguous } = findInventoryMatch(snap.docs, drugName);
  if (!match) {
    return { found: false, ambiguous };
  }

  const itemData = match.data();
  const { qty: unitQty, doseAware } = unitsForDose(itemData.name, doseGiven);
  const qty = unitQty * Math.max(1, Number(doses) || 1);   // doses in the course (1 for a single MAR dose)

  const current = itemData.quantity || 0;
  const newQty  = Math.max(0, current - qty);
  await updateDoc(doc(db, COL.INVENTORY, match.id), {
    quantity: newQty, updatedAt: serverTimestamp(),
  });
  await logAudit('INVENTORY_DISPENSE', match.id, dispensedBy, {
    drug: drugName, doseGiven, doses, qtyDeducted: qty, doseAware, emrNumber, remaining: newQty,
  }, dispensedByRole);
  return { found: true, remaining: newQty, low: newQty <= (itemData.reorderAt || 10), qtyDeducted: qty, doseAware };
}

// ═════════════════════════════════════════════
// REPORT SICK — stamps patient doc, and starts a fresh episode
// if the patient was previously discharged
// ═════════════════════════════════════════════
export async function reportSick(emrNumber, by, method = 'manual') {
  const patientUpdate = {
    reportedSickAt:  serverTimestamp(),
    reportedSickBy:  by,
    reportedSickHow: method,   // 'qr' | 'manual'
    updatedAt:       serverTimestamp(),
    updatedBy:       by,
  };
  // A discharged patient who reports sick again is a new episode of care —
  // clear the stale 'discharged' status so the header no longer shows them
  // as discharged, the Report Sick button reflects today's fresh report,
  // and they're admissible again.
  try {
    const snap = await getDoc(doc(db, COL.PATIENTS, emrNumber));
    if (snap.exists() && snap.data().status === 'discharged') {
      patientUpdate.status = 'active';
    }
  } catch (_) { /* best-effort — the sick-report stamp below still proceeds */ }
  // Stamp the patient document with today's sick-report timestamp
  await updateDoc(doc(db, COL.PATIENTS, emrNumber), patientUpdate);
  // Also log into a subcollection for history
  await addDoc(collection(db, COL.PATIENTS, emrNumber, 'sickReports'), {
    reportedAt:  serverTimestamp(),
    reportedBy:  by,
    method,
  });
}

// ═════════════════════════════════════════════
// LIVE LISTENER: today's sick reports across all patients
// ═════════════════════════════════════════════
export function listenSickReportsToday(callback) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);
  const q = query(
    collection(db, COL.PATIENTS),
    where('reportedSickAt', '>=', todayTs),
    orderBy('reportedSickAt', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ═════════════════════════════════════════════
// LIVE LISTENER: patients on the "Seen" card
//
// Seen = union of:
//   1. Patients discharged today   (status === 'discharged', updated today)
//      — regardless of whether admitted today or earlier
//   2. Patients referred today     (status === 'referred', updated today)
//      — regardless of whether admitted today or earlier
//   3. Patients who reported sick today AND were seen today
//      (reportedSickAt today AND seenAt today)
// ═════════════════════════════════════════════
export function listenSeenToday(callback) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);
  const isTodayTs = (ts) => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= today;
  };

  // Query A: patients updated today (covers discharged/referred today)
  const qUpdated = query(
    collection(db, COL.PATIENTS),
    where('updatedAt', '>=', todayTs),
    orderBy('updatedAt', 'desc')
  );
  // Query B: patients who reported sick today
  const qReported = query(
    collection(db, COL.PATIENTS),
    where('reportedSickAt', '>=', todayTs),
    orderBy('reportedSickAt', 'desc')
  );

  let updatedDocs  = [];
  let reportedDocs = [];

  const emit = () => {
    const result = new Map();

    // 1 & 2: discharged or referred today
    updatedDocs.forEach(p => {
      if (isTodayTs(p.updatedAt) && (p.status === 'discharged' || p.status === 'referred')) {
        result.set(p.id, p);
      }
    });

    // 3: reported sick today AND seen today
    reportedDocs.forEach(p => {
      if (isTodayTs(p.seenAt)) {
        result.set(p.id, p);
      }
    });

    callback(Array.from(result.values()));
  };

  const u1 = onSnapshot(qUpdated, snap => {
    updatedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  });
  const u2 = onSnapshot(qReported, snap => {
    reportedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  });

  return () => { u1(); u2(); };
}

// ═════════════════════════════════════════════
// QR SELF-REPORT (Student reports sick via QR)
// ═════════════════════════════════════════════
export async function submitSelfReport(data) {
  // Verify matric number matches a registered patient
  const snap = await getDocs(
    query(collection(db, COL.PATIENTS), where('matricNo', '==', data.matricNo))
  );
  if (snap.empty) throw new Error('Matric number not found. Please check and try again.');
  const patient = { id: snap.docs[0].id, ...snap.docs[0].data() };

  // Stamp the patient doc as reported sick today (QR method)
  await reportSick(patient.emrNumber, data.matricNo, 'qr');

  const ref = await addDoc(collection(db, COL.SELF_REPORT), {
    matricNo:    data.matricNo,
    emrNumber:   patient.emrNumber,
    patientName: `${patient.surname} ${patient.firstName}`,
    complaint:   data.complaint,
    duration:    data.duration,
    severity:    data.severity,  // 'mild' | 'moderate' | 'severe'
    submittedAt: serverTimestamp(),
    status:      'pending',      // nurse picks it up → 'triaged' | 'dismissed'
  });

  return { reportId: ref.id, patient };
}

export function listenSelfReports(callback) {
  // Single-field where only — avoids composite index. Sort client-side.
  const q = query(
    collection(db, COL.SELF_REPORT),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
    callback(docs);
  });
}

export async function processSelfReport(reportId, action, nurseId) {
  await updateDoc(doc(db, COL.SELF_REPORT, reportId), {
    status:      action,   // 'triaged' | 'dismissed'
    processedBy: nurseId,
    processedAt: serverTimestamp(),
  });
}

// ═════════════════════════════════════════════
// LIVE LISTENER: Monthly sick reports (last 12 months)
// Returns patients who reported sick, grouped by month, class, and sex
// ═════════════════════════════════════════════
export function listenSickReportsMonthly(callback) {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
  const fromTs = Timestamp.fromDate(twelveMonthsAgo);

  const q = query(
    collection(db, COL.PATIENTS),
    where('reportedSickAt', '>=', fromTs),
    orderBy('reportedSickAt', 'asc')
  );

  return onSnapshot(q, snap => {
    // Build map: { 'YYYY-MM': { classSet: { male: N, female: N } } }
    const monthly = {};
    snap.docs.forEach(d => {
      const data = d.data();
      if (!data.reportedSickAt) return;
      const date = data.reportedSickAt.toDate ? data.reportedSickAt.toDate() : new Date(data.reportedSickAt);
      const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const cls  = data.classSet || 'Unknown';
      const sex  = (data.sex || '').toLowerCase();

      if (!monthly[key]) monthly[key] = {};
      if (!monthly[key][cls]) monthly[key][cls] = { male: 0, female: 0, total: 0 };

      if (sex === 'male')        monthly[key][cls].male++;
      else if (sex === 'female') monthly[key][cls].female++;
      monthly[key][cls].total++;
    });
    callback(monthly);
  });
}


// ═════════════════════════════════════════════
// NHIS & NACON PRESCRIPTION FORM PERSISTENCE
// ═════════════════════════════════════════════
export async function saveNHISForm(formData, savedBy, savedByRole = null) {
  const docRef = await addDoc(collection(db, 'nhis_prescriptions'), {
    ...formData,
    formType: 'NHIS',
    savedBy,
    savedAt:  serverTimestamp(),
  });
  await logAudit('NHIS_FORM_SAVE', docRef.id, savedBy, { patientName: formData.patientName }, savedByRole);
  return docRef.id;
}

export async function saveNACONForm(formData, savedBy, savedByRole = null) {
  const docRef = await addDoc(collection(db, 'nacon_prescriptions'), {
    ...formData,
    formType: 'NACON_CIVILIAN',
    savedBy,
    savedAt:  serverTimestamp(),
  });
  await logAudit('NACON_FORM_SAVE', docRef.id, savedBy, { patientName: formData.patientName }, savedByRole);
  return docRef.id;
}

export function listenNHISForms(callback) {
  const q = query(collection(db, 'nhis_prescriptions'), orderBy('savedAt', 'desc'), limit(100));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export function listenNACONForms(callback) {
  const q = query(collection(db, 'nacon_prescriptions'), orderBy('savedAt', 'desc'), limit(100));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Listen to saved official Rx forms for a specific patient (both NHIS and NACON).
 *  No composite index needed — filters by emrNumber only, sorts client-side. */
export function listenPatientForms(emrNumber, callback) {
  const nhisQ  = query(collection(db, 'nhis_prescriptions'),  where('emrNumber','==',emrNumber));
  const naconQ = query(collection(db, 'nacon_prescriptions'), where('emrNumber','==',emrNumber));
  let nhisDocs  = [];
  let naconDocs = [];
  const merge = () => {
    const all = [...nhisDocs, ...naconDocs]
      .sort((a,b) => (b.savedAt?.seconds||0) - (a.savedAt?.seconds||0));
    callback(all);
  };
  const u1 = onSnapshot(nhisQ,  snap => { nhisDocs  = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  const u2 = onSnapshot(naconQ, snap => { naconDocs = snap.docs.map(d=>({id:d.id,...d.data()})); merge(); });
  return () => { u1(); u2(); };
}

// ═════════════════════════════════════════════
// PHARMACY — DISPENSING
// ═════════════════════════════════════════════

/** Live listener: all prescriptions that are pending dispensing (not yet dispensed) */
export function listenPendingDispense(callback) {
  // Use == false instead of != true to avoid composite index on inequality.
  // Also catches docs where dispensed field is absent (undefined/null treated as not dispensed).
  const q = query(
    collection(db, COL.PRESCRIPTIONS),
    where('dispensed', '==', false)
  );
  return onSnapshot(q, snap => {
    // Also include docs where dispensed field doesn't exist yet
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort by createdAt ascending client-side
    all.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    callback(all);
  });
}

/** Live listener: prescriptions dispensed today */
export function listenDispensedToday(callback) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, COL.DISPENSE_LOG),
    where('dispensedAt', '>=', Timestamp.fromDate(today)),
    orderBy('dispensedAt', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

/** Dispense a prescription: marks it dispensed, takes the drugs out of pharmacy stock, logs.
 *  Prescribing never touches stock; this is the one place stock comes out.
 *  Returns { inventory } with one result per drug line so the pharmacist can see what was not found. */
export async function dispensePrescription(prescriptionId, rxData, dispensedBy, dispensedByRole = ROLES.PHARMACIST) {
  // Mark prescription as dispensed
  await updateDoc(doc(db, COL.PRESCRIPTIONS, prescriptionId), {
    dispensed:    true,
    dispensedBy,
    dispensedAt:  serverTimestamp(),
  });

  // Deduct each drug from inventory
  const inventory = [];
  for (const drug of rxData.drugs || []) {
    // Support both drug.name (from Rx form) and drug.drug (legacy)
    const drugName = drug.name || drug.drug;
    if (!drugName) continue;
    // Older prescriptions already came out of stock when they were written: don't deduct twice
    if (drug.inventoryDeducted) continue;
    try {
      const qtyTyped = Number(drug.qty);
      const res = qtyTyped > 0
        ? await deductInventory(drugName, qtyTyped, rxData.emrNumber, dispensedBy, dispensedByRole)
        : await deductInventoryByDose(drugName, drug.dose, rxData.emrNumber, dispensedBy, dispensedByRole,
            courseDoseCount(drug.frequency, drug.duration));
      inventory.push({ drug: drugName, ...res });
    } catch (err) {
      console.error('[dispensePrescription] inventory deduction failed:', err);
      inventory.push({ drug: drugName, found: false, error: true });
    }
  }

  // Add to dispense log
  await addDoc(collection(db, COL.DISPENSE_LOG), {
    prescriptionId,
    emrNumber:    rxData.emrNumber,
    patientName:  rxData.patientName || '',
    drugs:        deepStripUndefined(rxData.drugs || []),
    prescribedBy: rxData.prescribedBy || '',
    dispensedBy,
    dispensedAt:  serverTimestamp(),
  });

  await logAudit('DISPENSE', prescriptionId, dispensedBy, { emrNumber: rxData.emrNumber }, dispensedByRole);
  return { inventory };
}

/** Live listener: all dispense log entries */
export function listenDispenseLog(callback) {
  const q = query(collection(db, COL.DISPENSE_LOG), orderBy('dispensedAt', 'desc'), limit(300));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

// ═════════════════════════════════════════════
// LABORATORY
// ═════════════════════════════════════════════

export const LAB_TESTS = [
  // Haematology
  { group:'Haematology',   name:'Full Blood Count (FBC)',       abbr:'FBC'   },
  { group:'Haematology',   name:'Haemoglobin (Hb)',             abbr:'Hb'    },
  { group:'Haematology',   name:'Blood Group & Genotype',       abbr:'BG'    },
  { group:'Haematology',   name:'Malaria Parasite (MP)',        abbr:'MP'    },
  { group:'Haematology',   name:'ESR',                          abbr:'ESR'   },
  { group:'Haematology',   name:'Clotting Time / Bleeding Time',abbr:'CT/BT' },
  // Biochemistry
  { group:'Biochemistry',  name:'Random Blood Sugar (RBS)',     abbr:'RBS'   },
  { group:'Biochemistry',  name:'Fasting Blood Sugar (FBS)',    abbr:'FBS'   },
  { group:'Biochemistry',  name:'Urea & Electrolytes (U&E)',    abbr:'U&E'   },
  { group:'Biochemistry',  name:'Liver Function Test (LFT)',    abbr:'LFT'   },
  { group:'Biochemistry',  name:'Lipid Profile',                abbr:'LP'    },
  { group:'Biochemistry',  name:'Serum Creatinine',             abbr:'SCr'   },
  { group:'Biochemistry',  name:'Uric Acid',                    abbr:'UA'    },
  // Microbiology
  { group:'Microbiology',  name:'Urinalysis (U/A)',             abbr:'U/A'   },
  { group:'Microbiology',  name:'Urine M/C/S',                  abbr:'UMCS'  },
  { group:'Microbiology',  name:'Stool M/C/S',                  abbr:'SMCS'  },
  { group:'Microbiology',  name:'Sputum M/C/S',                 abbr:'SpMCS' },
  { group:'Microbiology',  name:'Wound Swab M/C/S',             abbr:'WSMCS' },
  { group:'Microbiology',  name:'Blood Culture',                abbr:'BC'    },
  // Serology
  { group:'Serology',      name:'HIV Screening',                abbr:'HIV'   },
  { group:'Serology',      name:'Hepatitis B Surface Ag (HBsAg)',abbr:'HBsAg'},
  { group:'Serology',      name:'Hepatitis C Antibody',         abbr:'HCV'   },
  { group:'Serology',      name:'VDRL / Syphilis',              abbr:'VDRL'  },
  { group:'Serology',      name:'Widal Test',                   abbr:'Widal' },
  { group:'Serology',      name:'Rheumatoid Factor (RF)',        abbr:'RF'    },
  { group:'Serology',      name:'CRP',                          abbr:'CRP'   },
  // Hormones
  { group:'Hormones',      name:'Pregnancy Test (urine/serum)', abbr:'PT'    },
  { group:'Hormones',      name:'Thyroid Function Test (TFT)',  abbr:'TFT'   },
  { group:'Hormones',      name:'PSA',                          abbr:'PSA'   },
];

/** Doctor/Nurse requests a lab test */
export async function requestLabTest(emrNumber, visitId, tests, requestedBy, urgency = 'routine', notes = '', requestedByRole = null) {
  const patient = await getPatient(emrNumber);
  const ref = await addDoc(collection(db, COL.LAB_REQUESTS), {
    emrNumber,
    visitId:       visitId || null,
    patientName:   patient ? `${patient.surname} ${patient.firstName}` : '',
    classSet:      patient?.classSet || '',
    sex:           patient?.sex || '',
    tests,          // array of test names
    urgency,        // 'routine' | 'urgent' | 'stat'
    notes,
    status:        'pending',  // pending → processing → completed
    requestedBy,
    requestedAt:   serverTimestamp(),
    resultEnteredBy: null,
    resultEnteredAt: null,
  });
  await logAudit('LAB_REQUEST', emrNumber, requestedBy, { tests, urgency }, requestedByRole);
  return ref.id;
}

/** Lab staff enters results for a request */
export async function enterLabResults(requestId, results, enteredBy, enteredByRole = ROLES.LAB, comments = '') {
  // results: { testName: { value, unit, flag, referenceRange }, ... }
  await updateDoc(doc(db, COL.LAB_REQUESTS, requestId), {
    status:           'completed',
    results,
    comments,
    resultEnteredBy:  enteredBy,
    resultEnteredAt:  serverTimestamp(),
  });

  // Also store in lab_results for per-patient history
  const reqSnap = await getDoc(doc(db, COL.LAB_REQUESTS, requestId));
  const req = reqSnap.data();
  await addDoc(collection(db, COL.LAB_RESULTS), {
    requestId,
    emrNumber:       req.emrNumber,
    visitId:         req.visitId,
    patientName:     req.patientName,
    tests:           req.tests,
    results,
    comments,
    requestedBy:     req.requestedBy,
    resultEnteredBy: enteredBy,
    requestedAt:     req.requestedAt,
    completedAt:     serverTimestamp(),
  });

  await logAudit('LAB_RESULT', requestId, enteredBy, { emrNumber: req.emrNumber }, enteredByRole);
}

// ── Lab catalogue overrides (units / normal ranges the lab has changed) ──
// Stored in settings/labCatalogue as { overrides: { 'FBC name|HGB': { unit, m, f, all } } }.
// Defaults live in lib/labCatalogue.js; whatever is saved here wins over them.
export function listenLabCatalogue(callback) {
  return onSnapshot(
    doc(db, COL.SETTINGS, 'labCatalogue'),
    snap => callback(snap.exists() ? (snap.data().overrides || {}) : {}),
    () => callback({}),
  );
}

export async function saveLabCatalogueOverrides(overrides, savedBy, savedByRole = null) {
  await setDoc(doc(db, COL.SETTINGS, 'labCatalogue'), {
    overrides,
    updatedBy: savedBy,
    updatedAt: serverTimestamp(),
  });
  await logAudit('LAB_CATALOGUE_UPDATE', 'labCatalogue', savedBy, {}, savedByRole);
}

/** Live listener: all pending lab requests */
export function listenLabRequests(callback, statusFilter = null, completedDays = 7) {
  // Single-field queries only (no composite index). Sort client-side.
  // Open work (pending / processing) is always loaded in full; completed
  // results are only loaded for the last `completedDays` days so the list
  // doesn't grow — and get re-read — forever. Older results stay available
  // per patient via listenPatientLabResults.
  const sortAsc = docs => docs.sort((a, b) => (a.requestedAt?.seconds || 0) - (b.requestedAt?.seconds || 0));
  const toDocs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (statusFilter && statusFilter !== 'completed') {
    const q = query(collection(db, COL.LAB_REQUESTS), where('status', '==', statusFilter));
    return onSnapshot(q, snap => callback(sortAsc(toDocs(snap))));
  }

  const since = new Date(); since.setDate(since.getDate() - completedDays); since.setHours(0, 0, 0, 0);
  let open = [], done = [];
  const emit = () => callback(sortAsc([...open, ...done]));

  const openQ = query(collection(db, COL.LAB_REQUESTS), where('status', 'in', ['pending', 'processing']));
  const doneQ = query(collection(db, COL.LAB_REQUESTS), where('resultEnteredAt', '>=', Timestamp.fromDate(since)));
  const u1 = statusFilter === 'completed' ? () => {} : onSnapshot(openQ, snap => { open = toDocs(snap); emit(); });
  const u2 = onSnapshot(doneQ, snap => { done = toDocs(snap).filter(r => r.status === 'completed'); emit(); });
  return () => { u1(); u2(); };
}

/** Live listener: lab results for a specific patient */
export function listenPatientLabResults(emrNumber, callback) {
  // Single-field where only — avoids composite index. Sort client-side.
  const q = query(collection(db, COL.LAB_RESULTS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.completedAt?.seconds || b.requestedAt?.seconds || 0) - (a.completedAt?.seconds || a.requestedAt?.seconds || 0));
    callback(docs);
  });
}

/** Live listener: lab requests for a specific patient */
export function listenPatientLabRequests(emrNumber, callback) {
  // Single-field where only — avoids composite index. Sort client-side.
  const q = query(collection(db, COL.LAB_REQUESTS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.requestedAt?.seconds || 0) - (a.requestedAt?.seconds || 0));
    callback(docs);
  });
}

/** Update a lab request status (e.g. pending → processing) */
export async function updateLabRequestStatus(requestId, status, updatedBy, updatedByRole = ROLES.LAB) {
  await updateDoc(doc(db, COL.LAB_REQUESTS, requestId), {
    status,
    ...(status === 'processing' ? { processingBy: updatedBy, processingAt: serverTimestamp() } : {}),
  });
  await logAudit('LAB_STATUS_UPDATE', requestId, updatedBy, { status }, updatedByRole);
}


// ─────────────────────────────────────────────
// SHIFT ACTIVITY — everything recorded for patients between two times
// (used by the Nurses Report page: patients seen 1700hrs → 0600hrs).
// Each collection is read with a single-field time range (no composite
// index). callback(items) → [{ ts, type, data }] where type matches the
// patient visit timeline: note | vitals | fluid | glucose | rx | lab | upload.
// ─────────────────────────────────────────────
export function listenShiftActivity(start, end, callback) {
  const s = Timestamp.fromDate(start), e = Timestamp.fromDate(end);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const msOf = (ts) => ts?.toDate ? ts.toDate().getTime() : (ts?.seconds ? ts.seconds * 1000 : 0);
  const inWindow = (ts) => { const m = msOf(ts); return m >= start.getTime() && m <= end.getTime(); };
  const toDocs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const store = {};
  const emit = () => {
    const out = [];
    // A write still waiting for the server has no timestamp yet (null) — treat it as "just now".
    // Only the start is bounded in the query, because a pending server timestamp
    // would fail an upper bound until the server confirms it; the end is checked here.
    const add = (type, docs, tsOf) => (docs || []).forEach(d => {
      if (!d.emrNumber) return;
      const raw = tsOf(d);
      const ms = msOf(raw);
      if (ms > end.getTime()) return;
      out.push({ ts: ms ? raw : Timestamp.now(), type, data: d });
    });
    add('note',    (store.note || []).filter(n => n.type !== 'duty_report'), d => d.createdAt);
    add('vitals',  store.vitals,  d => d.recordedAt);
    add('fluid',   store.fluid,   d => d.recordedAt);
    add('rx',      store.rx,      d => d.createdAt);
    add('lab',     store.lab,     d => d.completedAt || d.requestedAt);
    add('upload',  store.upload,  d => d.uploadedAt);
    add('admit',     store.admit,     d => d.admittedAt);
    add('discharge', store.discharge, d => d.dischargedAt);
    add('referral',  store.referral,  d => d.createdAt);
    // Fallback: discharged/referred patients whose visit/referral record is missing
    const have = new Set(out.filter(o => o.type === 'discharge' || o.type === 'referral').map(o => o.data.emrNumber));
    (store.patientStatus || []).forEach(p => {
      if (have.has(p.emrNumber)) return;
      if (p.status === 'discharged') out.push({ ts: p.updatedAt, type: 'discharge', data: { emrNumber: p.emrNumber, dischargeNote: p.dischargeNote, dischargedBy: p.updatedBy } });
      if (p.status === 'referred')   out.push({ ts: p.updatedAt, type: 'referral',  data: { emrNumber: p.emrNumber, to: '', referredBy: p.updatedBy } });
    });
    // Glucose: grid rows are timed by their own date/time, not when they were saved
    const gl = [...new Map([...(store.glucoseDate || []), ...(store.glucoseSaved || [])].map(d => [d.id, d])).values()];
    add('glucose', flattenGlucoseDocs(gl).filter(g => inWindow(g.recordedAt)), d => d.recordedAt);
    out.sort((a, b) => msOf(a.ts) - msOf(b.ts));
    callback(out);
  };

  const subs = [];
  const watch = (key, col, field, bounds) => {
    const q = bounds.length > 1
      ? query(collection(db, col), where(field, '>=', bounds[0]), where(field, '<=', bounds[1]))
      : query(collection(db, col), where(field, '>=', bounds[0]));
    subs.push(onSnapshot(q, snap => { store[key] = toDocs(snap); emit(); },
      err => { console.error('listenShiftActivity', key, err); store[key] = []; emit(); }));
  };
  watch('note',   COL.NOTES,         'createdAt',   [s]);
  watch('vitals', COL.VITALS,        'recordedAt',  [s]);
  watch('fluid',  COL.FLUIDS,        'recordedAt',  [s]);
  watch('rx',     COL.PRESCRIPTIONS, 'createdAt',   [s]);
  watch('lab',    COL.LAB_RESULTS,   'completedAt', [s]);
  watch('upload', COL.UPLOADS,       'uploadedAt',  [s]);
  watch('admit',     COL.VISITS,    'admittedAt',   [s]);
  watch('discharge', COL.VISITS,    'dischargedAt', [s]);
  watch('referral',  COL.REFERRALS, 'createdAt',    [s]);
  watch('patientStatus', COL.PATIENTS, 'updatedAt', [s]);
  watch('glucoseSaved', COL.GLUCOSE, 'recordedAt',  [s]);
  watch('glucoseDate',  COL.GLUCOSE, 'date',        [iso(start), iso(end)]);
  return () => subs.forEach(u => u());
}
