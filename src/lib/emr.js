// src/lib/emr.js
// ─────────────────────────────────────────────
// All Firestore operations for NACON MRS EMR
// Includes atomic EMR number generation,
// patient CRUD, visits, notes, vitals, etc.
// ─────────────────────────────────────────────
import {
  doc, collection, getDocs, getDoc, setDoc,
  addDoc, updateDoc, deleteDoc, query, where,
  orderBy, onSnapshot, runTransaction,
  serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';

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
// Uses a Firestore transaction on counters/emr_sequence
// to atomically increment and assign a unique number.
// Format: EMR-YYYY-NNNN  e.g. EMR-2025-0041
// Resets to 0001 each new year.
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

    // Reset sequence at new year
    if (storedYear !== year) {
      last = 0;
    }

    const next = last + 1;
    const padded = String(next).padStart(4, '0');
    const emr = `EMR-${year}-${padded}`;

    txn.set(counterRef, { lastNumber: next, year, updatedAt: serverTimestamp() });

    return emr;
  });

  return emrNumber;
}

// Derive folder number from EMR  e.g. EMR-2025-0041 → FN: 041/25
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
    // Search index — lowercase tokens for fast querying
    searchTokens:  buildSearchTokens(data, emrNumber),
  };

  const ref = doc(db, COL.PATIENTS, emrNumber);
  await setDoc(ref, patientData);

  // Audit log
  await logAudit('REGISTER_PATIENT', emrNumber, registeredBy, { emrNumber, name: `${data.surname} ${data.firstName}` });

  return { emrNumber, folderNumber };
}

// Build tokens for searching by name, class, emr
function buildSearchTokens(data, emr) {
  const tokens = new Set();
  const add = (str) => {
    if (!str) return;
    const s = str.toLowerCase();
    tokens.add(s);
    // Add prefix tokens for instant search
    for (let i = 1; i <= s.length; i++) tokens.add(s.slice(0, i));
  };
  add(data.surname);
  add(data.firstName);
  add(data.otherNames);
  add(`${data.surname} ${data.firstName}`);
  add(`${data.firstName} ${data.surname}`);
  add(data.classSet);   // e.g. "SET 49"
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

// Search patients — by EMR, name token, or class
export async function searchPatients(searchTerm) {
  if (!searchTerm || searchTerm.trim().length < 1) {
    // Return all (limited to 50)
    const q = query(collection(db, COL.PATIENTS), orderBy('registeredAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const term = searchTerm.toLowerCase().trim();

  // Direct EMR lookup first
  if (term.startsWith('emr-')) {
    const snap = await getDoc(doc(db, COL.PATIENTS, term.toUpperCase()));
    if (snap.exists()) return [{ id: snap.id, ...snap.data() }];
  }

  // Token search
  const q = query(
    collection(db, COL.PATIENTS),
    where('searchTokens', 'array-contains', term)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Real-time listener for all patients (for admin dashboard)
export function listenPatients(callback) {
  const q = query(collection(db, COL.PATIENTS), orderBy('registeredAt', 'desc'));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─────────────────────────────────────────────
// VISITS (consultation sessions)
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
  await updatePatient(emrNumber, { lastVisit: serverTimestamp(), status: 'active' }, createdBy);
  await logAudit('CREATE_VISIT', emrNumber, createdBy, { visitId: visitRef.id });
  return visitRef.id;
}

export async function getVisits(emrNumber) {
  const q = query(
    collection(db, COL.VISITS),
    where('emrNumber', '==', emrNumber),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function dischargePatient(emrNumber, visitId, dischargeNote, doneBy) {
  await updateDoc(doc(db, COL.VISITS, visitId), {
    status: 'discharged', dischargeNote, dischargedBy: doneBy,
    dischargedAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { status: 'discharged' }, doneBy);
  await logAudit('DISCHARGE', emrNumber, doneBy, { visitId });
}

// ─────────────────────────────────────────────
// CLINICAL NOTES (doctor + nurse combined)
// Both appear on the patient timeline
// ─────────────────────────────────────────────
export async function addNote(emrNumber, visitId, noteData, author, role) {
  const ref = await addDoc(collection(db, COL.NOTES), {
    emrNumber,
    visitId,
    ...noteData,
    authorName: author,
    authorRole: role,            // 'doctor' | 'nurse'
    createdAt:  serverTimestamp(),
  });
  await logAudit('ADD_NOTE', emrNumber, author, { noteId: ref.id, role });
  return ref.id;
}

export function listenNotes(emrNumber, callback) {
  const q = query(
    collection(db, COL.NOTES),
    where('emrNumber', '==', emrNumber),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// VITALS
// ─────────────────────────────────────────────
export async function addVitals(emrNumber, visitId, vitalsData, recordedBy) {
  const ref = await addDoc(collection(db, COL.VITALS), {
    emrNumber, visitId,
    ...vitalsData,
    recordedBy,
    recordedAt: serverTimestamp(),
  });
  // Update patient's latest vitals snapshot
  await updatePatient(emrNumber, { latestVitals: vitalsData }, recordedBy);
  await logAudit('ADD_VITALS', emrNumber, recordedBy, vitalsData);
  return ref.id;
}

export function listenVitals(emrNumber, callback) {
  const q = query(
    collection(db, COL.VITALS),
    where('emrNumber', '==', emrNumber),
    orderBy('recordedAt', 'desc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// PRESCRIPTIONS
// Both doctors and nurses can prescribe.
// Nurse prescriptions are flagged for countersign.
// ─────────────────────────────────────────────
export async function addPrescription(emrNumber, visitId, rxData, prescribedBy, role) {
  const ref = await addDoc(collection(db, COL.PRESCRIPTIONS), {
    emrNumber, visitId,
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
  const q = query(
    collection(db, COL.PRESCRIPTIONS),
    where('emrNumber', '==', emrNumber),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// FLUID CHART
// ─────────────────────────────────────────────
export async function addFluidEntry(emrNumber, visitId, entry, recordedBy) {
  const ref = await addDoc(collection(db, COL.FLUIDS), {
    emrNumber, visitId, ...entry, recordedBy, recordedAt: serverTimestamp(),
  });
  await logAudit('FLUID_ENTRY', emrNumber, recordedBy, entry);
  return ref.id;
}

export function listenFluidChart(emrNumber, callback) {
  const q = query(
    collection(db, COL.FLUIDS),
    where('emrNumber', '==', emrNumber),
    orderBy('recordedAt', 'asc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// GLUCOSE CHART
// ─────────────────────────────────────────────
export async function addGlucoseReading(emrNumber, visitId, entry, recordedBy) {
  const ref = await addDoc(collection(db, COL.GLUCOSE), {
    emrNumber, visitId, ...entry, recordedBy, recordedAt: serverTimestamp(),
  });
  await logAudit('GLUCOSE_ENTRY', emrNumber, recordedBy, entry);
  return ref.id;
}

export function listenGlucoseChart(emrNumber, callback) {
  const q = query(
    collection(db, COL.GLUCOSE),
    where('emrNumber', '==', emrNumber),
    orderBy('recordedAt', 'asc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// FILE UPLOADS (lab results, scans, reports)
// ─────────────────────────────────────────────
export async function uploadPatientFile(emrNumber, visitId, file, category, uploadedBy) {
  const path = `patients/${emrNumber}/uploads/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const docRef = await addDoc(collection(db, COL.UPLOADS), {
    emrNumber, visitId,
    fileName:   file.name,
    fileType:   file.type,
    fileSize:   file.size,
    storagePath: path,
    downloadUrl: url,
    category,           // 'lab_result' | 'imaging' | 'report' | 'other'
    uploadedBy,
    uploadedAt: serverTimestamp(),
  });

  await logAudit('FILE_UPLOAD', emrNumber, uploadedBy, { fileName: file.name, category });
  return { id: docRef.id, downloadUrl: url };
}

export function listenUploads(emrNumber, callback) {
  const q = query(
    collection(db, COL.UPLOADS),
    where('emrNumber', '==', emrNumber),
    orderBy('uploadedAt', 'desc')
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// ─────────────────────────────────────────────
// REFERRALS
// ─────────────────────────────────────────────
export async function createReferral(emrNumber, visitId, referralData, referredBy) {
  const ref = await addDoc(collection(db, COL.REFERRALS), {
    emrNumber, visitId,
    ...referralData,
    referredBy,
    createdAt: serverTimestamp(),
  });
  await updatePatient(emrNumber, { status: 'referred' }, referredBy);
  await logAudit('REFERRAL', emrNumber, referredBy, referralData);
  return ref.id;
}

// ─────────────────────────────────────────────
// USER MANAGEMENT (Admin only)
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
  await updateDoc(doc(db, COL.USERS, uid), { active: false, deactivatedBy: doneBy, deactivatedAt: serverTimestamp() });
  await logAudit('DEACTIVATE_USER', uid, doneBy, {});
}

// ─────────────────────────────────────────────
// AUDIT LOG
// Every significant action is logged here.
// Only admins can read the audit log.
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
    totalPatients:  patientsSnap.size,
    visitsToday:    visits.length,
    waiting:        visits.filter(v => v.status === 'open').length,
    referred:       visits.filter(v => v.status === 'referred').length,
    discharged:     visits.filter(v => v.status === 'discharged').length,
    sickBay:        visits.filter(v => v.status === 'sickbay').length,
  };
}

// Helpers for date formatting
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
