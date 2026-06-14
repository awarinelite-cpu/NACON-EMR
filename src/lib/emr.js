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
    // Network error mid-write — queue it
    if (err.code === 'unavailable' || !navigator.onLine) {
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
  SELF_REPORT:  'self_reports',
};

// ── ROLES ────────────────────────────────────
export const ROLES = {
  ADMIN:    'admin',
  SUBADMIN: 'subadmin',
  DOCTOR:   'doctor',
  NURSE:    'nurse',
  RECORDS:  'records',
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
    let storedYear = year;

    if (snap.exists()) {
      last       = snap.data().lastNumber || 0;
      storedYear = snap.data().year       || year;
    }

    if (storedYear !== year) last = 0;

    const next   = last + 1;
    const padded = String(next).padStart(4, '0');
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
export async function registerPatient(data, registeredBy) {
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
  await logAudit('REGISTER_PATIENT', emrNumber, registeredBy, { emrNumber, name: `${data.surname} ${data.firstName}` });

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

export async function updatePatient(emrNumber, data, updatedBy) {
  await updateDoc(doc(db, COL.PATIENTS, emrNumber), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy,
  });
  await logAudit('UPDATE_PATIENT', emrNumber, updatedBy, data);
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
export async function createVisit(emrNumber, data, createdBy) {
  const visitRef = await addDoc(collection(db, COL.VISITS), {
    emrNumber,
    ...data,
    status:    'open',
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  // seenAt = moment they physically arrived at MRS (visit opened)
  await updatePatient(emrNumber, {
    lastVisit: serverTimestamp(),
    seenAt:    serverTimestamp(),
    status:    'active',
  }, createdBy);
  await logAudit('CREATE_VISIT', emrNumber, createdBy, { visitId: visitRef.id });
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
export async function dischargePatient(emrNumber, visitId, dischargeNote, doneBy) {
  if (visitId && visitId !== 'current') {
    await updateDoc(doc(db, COL.VISITS, visitId), {
      status: 'discharged',
      dischargeNote,
      dischargedBy: doneBy,
      dischargedAt: serverTimestamp(),
    });
  }
  await updatePatient(emrNumber, { status: 'discharged', dischargeNote }, doneBy);
  await logAudit('DISCHARGE', emrNumber, doneBy, { visitId: visitId || 'none' });
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
  await logAudit('ADD_NOTE', emrNumber, author, { noteId: ref.id, role });
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
// VITALS
// ─────────────────────────────────────────────
export async function addVitals(emrNumber, visitId, vitalsData, recordedBy) {
  const ref = await addDoc(collection(db, COL.VITALS), {
    emrNumber,
    visitId: visitId || null,
    ...vitalsData,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { latestVitals: vitalsData }, recordedBy);
  await logAudit('ADD_VITALS', emrNumber, recordedBy, vitalsData);
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
    createdAt: serverTimestamp(),
  });
  await logAudit('PRESCRIPTION', emrNumber, prescribedBy, { requiresCountersign: role === ROLES.NURSE });
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
export async function addFluidEntry(emrNumber, visitId, entry, recordedBy) {
  const ref = await addDoc(collection(db, COL.FLUIDS), {
    emrNumber,
    visitId: visitId || null,
    ...entry,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await logAudit('FLUID_ENTRY', emrNumber, recordedBy, entry);
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
export async function addGlucoseReading(emrNumber, visitId, entry, recordedBy) {
  const ref = await addDoc(collection(db, COL.GLUCOSE), {
    emrNumber,
    visitId: visitId || null,
    ...entry,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  await logAudit('GLUCOSE_ENTRY', emrNumber, recordedBy, entry);
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
export async function uploadPatientFile(emrNumber, visitId, file, category, uploadedBy) {
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

  await logAudit('FILE_UPLOAD', emrNumber, uploadedBy, { fileName: file.name, category });
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
export async function createReferral(emrNumber, visitId, referralData, referredBy) {
  const ref = await addDoc(collection(db, COL.REFERRALS), {
    emrNumber,
    visitId: visitId || null,
    ...referralData,
    referredBy,
    createdAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { status: 'referred' }, referredBy);
  await logAudit('REFERRAL', emrNumber, referredBy, referralData);
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

export async function updateUserRole(uid, role, updatedBy) {
  await updateDoc(doc(db, COL.USERS, uid), { role, updatedBy, updatedAt: serverTimestamp() });
  await logAudit('UPDATE_ROLE', uid, updatedBy, { newRole: role });
}

export async function deactivateUser(uid, doneBy) {
  await updateDoc(doc(db, COL.USERS, uid), {
    active: false,
    deactivatedBy: doneBy,
    deactivatedAt: serverTimestamp(),
  });
  await logAudit('DEACTIVATE_USER', uid, doneBy, {});
}

export async function reactivateUser(uid, doneBy) {
  await updateDoc(doc(db, COL.USERS, uid), {
    active: true,
    reactivatedBy: doneBy,
    reactivatedAt: serverTimestamp(),
  });
  await logAudit('REACTIVATE_USER', uid, doneBy, {});
}

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────
export async function logAudit(action, targetId, performedBy, details = {}) {
  try {
    await addDoc(collection(db, COL.AUDIT), {
      action, targetId, performedBy, details,
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
  const ref = await addDoc(collection(db, COL.MAR), {
    ...data,
    createdAt: serverTimestamp(),
  });
  await logAudit('MAR_RECORD', data.emrNumber, data.administeredBy, {
    drug:   data.drug,
    status: data.status,
    route:  data.route,
    time:   data.administeredAt,
  });
  return ref.id;
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
  }, triagedBy);

  await logAudit('TRIAGE_ASSIGN', emrNumber, triagedBy, {
    priority: triageData.priority,
    triageId: ref.id,
  });

  return ref.id;
}

export async function updateTriageStatus(triageId, newStatus, updatedBy) {
  await updateDoc(doc(db, COL.TRIAGE, triageId), {
    status:    newStatus,
    updatedAt: serverTimestamp(),
    updatedBy,
    ...(newStatus === 'done' ? { completedAt: serverTimestamp() } : {}),
  });
  await logAudit('TRIAGE_STATUS', triageId, updatedBy, { newStatus });
}

export function listenTriageQueue(callback) {
  const q = query(
    collection(db, COL.TRIAGE),
    where('status', '==', 'waiting'),
    orderBy('arrivedAt', 'asc')
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

export async function addInventoryItem(data, addedBy) {
  const ref = await addDoc(collection(db, COL.INVENTORY), {
    ...data,
    quantity:   Number(data.quantity) || 0,
    reorderAt:  Number(data.reorderAt) || 10,
    createdAt:  serverTimestamp(),
    updatedAt:  serverTimestamp(),
  });
  await logAudit('INVENTORY_ADD', ref.id, addedBy, { name: data.name });
  return ref.id;
}

export async function updateInventoryItem(id, data, updatedBy) {
  await updateDoc(doc(db, COL.INVENTORY, id), { ...data, updatedAt: serverTimestamp() });
  await logAudit('INVENTORY_UPDATE', id, updatedBy, data);
}

export async function deductInventory(drugName, qty, emrNumber, dispensedBy) {
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
  });
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
// LIVE LISTENER: patients seen today at MRS
// "Seen" = reported sick today AND seenAt is today
// Patients who had a visit but never reported sick are excluded.
// The callback receives only the intersection.
// ═════════════════════════════════════════════
export function listenSeenToday(callback) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Timestamp.fromDate(today);
  // Query patients who reported sick today
  const q = query(
    collection(db, COL.PATIENTS),
    where('reportedSickAt', '>=', todayTs),
    orderBy('reportedSickAt', 'desc')
  );
  return onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Keep only those whose seenAt is also today (they physically came to MRS)
    const seen = all.filter(p => {
      if (!p.seenAt) return false;
      const d = p.seenAt.toDate ? p.seenAt.toDate() : new Date(p.seenAt);
      return d >= today;
    });
    callback(seen);
  });
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
  const q = query(
    collection(db, COL.SELF_REPORT),
    where('status', '==', 'pending'),
    orderBy('submittedAt', 'desc')
  );
  return onSnapshot(q, snap =>
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  );
}

export async function processSelfReport(reportId, action, nurseId) {
  await updateDoc(doc(db, COL.SELF_REPORT, reportId), {
    status:      action,   // 'triaged' | 'dismissed'
    processedBy: nurseId,
    processedAt: serverTimestamp(),
  });
}
