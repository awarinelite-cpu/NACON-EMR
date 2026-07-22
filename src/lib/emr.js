// src/lib/emr.js
// ─────────────────────────────────────────────
// All Firestore operations for NACON MRS EMR
// ─────────────────────────────────────────────
import {
  doc, collection, getDocs, getDoc, setDoc,
  addDoc, updateDoc, deleteDoc, query, where,
  orderBy, onSnapshot, runTransaction,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { enqueuePendingWrite } from './offlineDB';

// ── OFFLINE-FIRST WRITE HELPER ───────────────
/**
 * Try a Firestore write; if offline, queue it for later sync.
 * @param {string}      colName   - collection name (from COL)
 * @param {string}      operation - 'add' | 'set' | 'update'
 * @param {string|null} docId     - existing doc ID (null for new docs)
 * @param {object}      data      - payload (use '__serverTimestamp__' as placeholder)
 * @param {function}    onlineFn  - async fn that does the real Firestore write
 */
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

export function listenPatients(callback) {
  const q = query(collection(db, COL.PATIENTS), orderBy('registeredAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─────────────────────────────────────────────
// VISITS
// ─────────────────────────────────────────────
export async function createVisit(emrNumber, data, createdBy, createdByRole = null) {
  const visitRef = await addDoc(collection(db, COL.VISITS), {
    emrNumber,
    ...data,
    status:    'open',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // seenAt = moment they physically arrived at MRS (visit opened)
  const patientUpdate = {
    lastVisit: serverTimestamp(),
    seenAt:    serverTimestamp(),
    status:    'active',
  };
  // Ensure patients seen today via direct visit (not via Report Sick)
  // still show up on the "Sick Report — Today" / "Seen" tabs.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);
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

// FIX: dischargePatient — only update visit doc if a real visitId is provided
export async function dischargePatient(emrNumber, visitId, dischargeNote, doneBy, doneByRole = null) {
  if (visitId && visitId !== 'current') {
    await updateDoc(doc(db, COL.VISITS, visitId), {
      status: 'discharged',
      dischargeNote,
      dischargedBy: doneBy,
      dischargedAt: serverTimestamp(),
    });
  }
  await updatePatient(emrNumber, { status: 'discharged', dischargeNote }, doneBy, doneByRole);
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
  const ref = await addDoc(collection(db, COL.NOTES), {
    emrNumber,
    visitId:    visitId || null,
    ...noteData,
    authorName: author,
    authorRole: role,
    createdAt:  serverTimestamp(),
  });
  await markSeenIfReportedSickToday(emrNumber, author);
  await logAudit('ADD_NOTE', emrNumber, author, { noteId: ref.id, role }, role);
  return ref.id;
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


export async function addVitals(emrNumber, visitId, vitalsData, recordedBy, recordedByRole = null) {
  const ref = await addDoc(collection(db, COL.VITALS), {
    emrNumber,
    visitId: visitId || null,
    ...vitalsData,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { latestVitals: vitalsData }, recordedBy, recordedByRole);
  await markSeenIfReportedSickToday(emrNumber, recordedBy);
  await logAudit('ADD_VITALS', emrNumber, recordedBy, vitalsData, recordedByRole);
  return ref.id;
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
// PRESCRIPTIONS
// ─────────────────────────────────────────────
export async function addPrescription(emrNumber, visitId, rxData, prescribedBy, role) {
  const ref = await addDoc(collection(db, COL.PRESCRIPTIONS), {
    emrNumber,
    visitId: visitId || null,
    drugs: rxData,
    prescribedBy,
    prescribedByRole: role,
    requiresCountersign: role === ROLES.NURSE,
    countersigned: false,
    dispensed: false,          // awaits pharmacist dispensing
    createdAt: serverTimestamp(),
  });

  await markSeenIfReportedSickToday(emrNumber, prescribedBy);
  await logAudit('PRESCRIPTION', emrNumber, prescribedBy, { requiresCountersign: role === ROLES.NURSE }, role);
  return ref.id;
}

export function listenPrescriptions(emrNumber, callback) {
  const q = query(collection(db, COL.PRESCRIPTIONS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    callback(docs);
  });
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

export function listenGlucoseChart(emrNumber, callback) {
  const q = query(collection(db, COL.GLUCOSE), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (a.recordedAt?.seconds||0) - (b.recordedAt?.seconds||0));
    callback(docs);
  });
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

// ─────────────────────────────────────────────
// DASHBOARD STATS
// ─────────────────────────────────────────────
export async function getTodayStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);

  const [visitsSnap, patientsSnap] = await Promise.all([
    getDocs(query(collection(db, COL.VISITS), where('createdAt', '>=', todayTs))),
    getDocs(collection(db, COL.PATIENTS)),
  ]);

  const visits = visitsSnap.docs.map(d => d.data());
  return {
    totalPatients: patientsSnap.size,
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
  const { offline, result } = await offlineWrite(
    COL.MAR, 'add', null,
    { ...data, createdAt: '__serverTimestamp__' },
    async () => addDoc(collection(db, COL.MAR), { ...data, createdAt: serverTimestamp() })
  );

  // Best-effort side effects — safe to attempt even when offline,
  // since both are already wrapped in their own try/catch internally.
  markSeenIfReportedSickToday(data.emrNumber, data.administeredBy);
  logAudit('MAR_RECORD', data.emrNumber, data.administeredBy, {
    drug:   data.drug,
    status: data.status,
    route:  data.route,
    time:   data.administeredAt,
  }, data.administeredByRole);

  return { offline, id: offline ? null : result.id };
}

export function listenMAR(emrNumber, callback) {
  const q = query(collection(db, COL.MAR), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a,b) => (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0));
    callback(docs);
  });
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
  const ref = await addDoc(collection(db, COL.INVENTORY), {
    ...data,
    quantity:   Number(data.quantity) || 0,
    reorderAt:  Number(data.reorderAt) || 10,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
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

export async function deductInventory(drugName, qty, emrNumber, dispensedBy, dispensedByRole = ROLES.PHARMACIST) {
  // Find matching inventory item by name (case-insensitive match)
  const snap = await getDocs(collection(db, COL.INVENTORY));
  const match = snap.docs.find(d =>
    d.data().name?.toLowerCase() === drugName?.toLowerCase()
  );
  if (!match) return { found: false };
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

// ═════════════════════════════════════════════
// HEALTH STATS (Admin analytics)
// ═════════════════════════════════════════════
export async function getHealthStats(fromDate, toDate) {
  const fromTs = Timestamp.fromDate(fromDate);
  const toTs   = Timestamp.fromDate(toDate);

  const [visitsSnap, triageSnap, patientsSnap] = await Promise.all([
    getDocs(query(collection(db, COL.VISITS),
      where('createdAt', '>=', fromTs),
      where('createdAt', '<=', toTs)
    )),
    getDocs(query(collection(db, COL.TRIAGE),
      where('arrivedAt', '>=', fromTs),
      where('arrivedAt', '<=', toTs)
    )),
    getDocs(collection(db, COL.PATIENTS)),
  ]);

  const visits  = visitsSnap.docs.map(d => d.data());
  const triage  = triageSnap.docs.map(d => d.data());

  // Visits per day
  const byDay = {};
  visits.forEach(v => {
    const d = v.createdAt?.toDate?.();
    if (!d) return;
    const key = d.toLocaleDateString('en-NG', { day:'2-digit', month:'short' });
    byDay[key] = (byDay[key] || 0) + 1;
  });

  // Priority breakdown
  const priority = { P1: 0, P2: 0, P3: 0 };
  triage.forEach(t => { if (priority[t.priority] !== undefined) priority[t.priority]++; });

  // Status breakdown
  const statusMap = {};
  visits.forEach(v => { statusMap[v.status || 'open'] = (statusMap[v.status || 'open'] || 0) + 1; });

  return {
    totalVisits:    visits.length,
    totalPatients:  patientsSnap.size,
    totalTriage:    triage.length,
    discharged:     visits.filter(v => v.status === 'discharged').length,
    referred:       visits.filter(v => v.status === 'referred').length,
    sickBay:        visits.filter(v => v.status === 'sickbay').length,
    byDay,
    priority,
    statusMap,
  };
}

// ═════════════════════════════════════════════
// REPORT SICK — stamps patient doc independently
// of status so discharged patients are excluded
// ═════════════════════════════════════════════
export async function reportSick(emrNumber, by, method = 'manual') {
  // Stamp the patient document with today's sick-report timestamp
  await updateDoc(doc(db, COL.PATIENTS, emrNumber), {
    reportedSickAt:  serverTimestamp(),
    reportedSickBy:  by,
    reportedSickHow: method,   // 'qr' | 'manual'
    updatedAt:       serverTimestamp(),
    updatedBy:       by,
  });
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
  const q = query(collection(db, 'nhis_prescriptions'), orderBy('savedAt', 'desc'));
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export function listenNACONForms(callback) {
  const q = query(collection(db, 'nacon_prescriptions'), orderBy('savedAt', 'desc'));
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

/** Dispense a prescription — marks it dispensed, deducts inventory, logs */
export async function dispensePrescription(prescriptionId, rxData, dispensedBy, dispensedByRole = ROLES.PHARMACIST) {
  // Mark prescription as dispensed
  await updateDoc(doc(db, COL.PRESCRIPTIONS, prescriptionId), {
    dispensed:    true,
    dispensedBy,
    dispensedAt:  serverTimestamp(),
  });

  // Deduct each drug from inventory and log
  for (const drug of rxData.drugs || []) {
    // Support both drug.name (from Rx form) and drug.drug (legacy)
    const drugName = drug.name || drug.drug;
    if (drugName) await deductInventory(drugName, Number(drug.qty) || 1, rxData.emrNumber, dispensedBy, dispensedByRole);
  }

  // Add to dispense log
  await addDoc(collection(db, COL.DISPENSE_LOG), {
    prescriptionId,
    emrNumber:    rxData.emrNumber,
    patientName:  rxData.patientName || '',
    drugs:        rxData.drugs || [],
    prescribedBy: rxData.prescribedBy || '',
    dispensedBy,
    dispensedAt:  serverTimestamp(),
  });

  await logAudit('DISPENSE', prescriptionId, dispensedBy, { emrNumber: rxData.emrNumber }, dispensedByRole);
}

/** Live listener: all dispense log entries */
export function listenDispenseLog(callback) {
  const q = query(collection(db, COL.DISPENSE_LOG), orderBy('dispensedAt', 'desc'));
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
export async function enterLabResults(requestId, results, enteredBy, enteredByRole = ROLES.LAB) {
  // results: { testName: { value, unit, flag, referenceRange }, ... }
  await updateDoc(doc(db, COL.LAB_REQUESTS, requestId), {
    status:           'completed',
    results,
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
    requestedBy:     req.requestedBy,
    resultEnteredBy: enteredBy,
    requestedAt:     req.requestedAt,
    completedAt:     serverTimestamp(),
  });

  await logAudit('LAB_RESULT', requestId, enteredBy, { emrNumber: req.emrNumber }, enteredByRole);
}

/** Live listener: all pending lab requests */
export function listenLabRequests(callback, statusFilter = null) {
  // Single-field where only to avoid composite index. Sort client-side.
  const constraints = statusFilter ? [where('status', '==', statusFilter)] : [];
  const q = query(collection(db, COL.LAB_REQUESTS), ...constraints);
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (a.requestedAt?.seconds || 0) - (b.requestedAt?.seconds || 0));
    callback(docs);
  });
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

