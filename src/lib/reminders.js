// src/lib/reminders.js
// ─────────────────────────────────────────────
// Browser-side Firestore helpers for nursing reminders:
//   - medication timing (drug administration due times)
//   - IV infusion timing
//   - FBS/RBS glucose check scheduling
// Everything runs in the app — no Cloud Functions and no Telegram bot. A
// reminder shows as due/overdue on the patient's Reminders tab as soon as the
// app is open, and the nurse records the outcome there (this file's
// recordMedAction / closeIvInfusion / logGlucoseCheck).
// ─────────────────────────────────────────────
import {
  doc, collection,
  query, where, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { addDoc, updateDoc } from './offlineWrites';
import { db } from './firebase';
import { COL } from './emr';

function stripUndefined(obj) {
  const clean = {};
  for (const [k, v] of Object.entries(obj)) clean[k] = v === undefined ? null : v;
  return clean;
}

// ── MEDICATION REMINDERS ─────────────────────
// source: 'prescription' (linked to an existing rx drug) | 'manual'
export async function createMedReminder({
  emrNumber, patientName, rxId, drugIndex, drug, dose, route,
  intervalHours, firstDueAt, assignedNurseUid, assignedNurseName,
  source, createdBy, createdByRole,
}) {
  const data = stripUndefined({
    emrNumber, patientName, rxId, drugIndex, drug, dose, route,
    intervalHours: Number(intervalHours) || null,
    nextDueAt: Timestamp.fromDate(new Date(firstDueAt)),
    assignedNurseUid, assignedNurseName,
    source: source || 'manual',
    status: 'pending',
    notifiedAt: null,
    createdBy, createdByRole,
    createdAt: serverTimestamp(),
  });
  const ref = await addDoc(collection(db, COL.MED_REMINDERS), data);
  return ref.id;
}

export function listenMedReminders(emrNumber, callback) {
  const q = query(collection(db, COL.MED_REMINDERS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function cancelMedReminder(id) {
  await updateDoc(doc(db, COL.MED_REMINDERS, id), { status: 'cancelled' });
}

// Nurse records the outcome of a due dose: 'given' | 'held' | 'refused'.
// Recurring reminders roll forward to the next due time; one-offs close.
// Also writes the MAR record (same shape the Telegram bot used to write).
export async function recordMedAction(reminder, status, staff) {
  const recurring = !!reminder.intervalHours;
  await updateDoc(doc(db, COL.MED_REMINDERS, reminder.id), stripUndefined({
    status: recurring ? 'pending' : status,
    lastActionStatus: status,
    recordedByUid: staff.uid,
    recordedByName: staff.name,
    recordedAt: serverTimestamp(),
    ...(recurring ? {
      nextDueAt: Timestamp.fromMillis(Date.now() + reminder.intervalHours * 3600 * 1000),
      notifiedAt: null,
    } : {}),
  }));
  await addDoc(collection(db, COL.MAR), stripUndefined({
    emrNumber: reminder.emrNumber,
    rxId: reminder.rxId || null,
    drug: reminder.drug,
    dose: reminder.dose || null,
    route: reminder.route || null,
    scheduledFreq: recurring ? `q${reminder.intervalHours}h` : null,
    status,
    administeredAt: new Date().toTimeString().slice(0, 5),
    notes: 'Recorded from Reminders tab',
    administeredBy: staff.name,
    administeredByRole: staff.role,
    createdAt: serverTimestamp(),
  }));
}

// ── IV INFUSION TIMING ───────────────────────
export async function createIvInfusion({
  emrNumber, patientName, fluid, volumeMl, rateMlPerHr, startAt,
  assignedNurseUid, assignedNurseName, createdBy, createdByRole,
}) {
  const start = new Date(startAt);
  const hours = Number(volumeMl) / Number(rateMlPerHr);
  const end = new Date(start.getTime() + hours * 3600 * 1000);
  const data = stripUndefined({
    emrNumber, patientName, fluid,
    volumeMl: Number(volumeMl), rateMlPerHr: Number(rateMlPerHr),
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromDate(end),
    assignedNurseUid, assignedNurseName,
    status: 'running',
    notifiedAt: null,
    createdBy, createdByRole,
    createdAt: serverTimestamp(),
  });
  const ref = await addDoc(collection(db, COL.IV_INFUSIONS), data);
  return ref.id;
}

export function listenIvInfusions(emrNumber, callback) {
  const q = query(collection(db, COL.IV_INFUSIONS), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function stopIvInfusion(id) {
  await updateDoc(doc(db, COL.IV_INFUSIONS, id), { status: 'stopped' });
}

// status: 'completed' | 'stopped'
export async function closeIvInfusion(id, status, staff) {
  await updateDoc(doc(db, COL.IV_INFUSIONS, id), {
    status, closedByUid: staff.uid, closedByName: staff.name, closedAt: serverTimestamp(),
  });
}

// ── GLUCOSE CHECK SCHEDULING (FBS/RBS) ───────
export async function createGlucoseCheck({
  emrNumber, patientName, type, dueAt, fastingRequired,
  assignedNurseUid, assignedNurseName, createdBy, createdByRole,
}) {
  const data = stripUndefined({
    emrNumber, patientName,
    type: type || 'RBS', // 'FBS' | 'RBS'
    dueAt: Timestamp.fromDate(new Date(dueAt)),
    fastingRequired: !!fastingRequired,
    assignedNurseUid, assignedNurseName,
    status: 'pending',
    notifiedAt: null,
    value: null,
    createdBy, createdByRole,
    createdAt: serverTimestamp(),
  });
  const ref = await addDoc(collection(db, COL.GLUCOSE_SCHEDULE), data);
  return ref.id;
}

export function listenGlucoseSchedule(emrNumber, callback) {
  const q = query(collection(db, COL.GLUCOSE_SCHEDULE), where('emrNumber', '==', emrNumber));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function cancelGlucoseCheck(id) {
  await updateDoc(doc(db, COL.GLUCOSE_SCHEDULE, id), { status: 'cancelled' });
}

// Nurse logs the glucose reading for a due check. Marks the schedule entry
// done and mirrors the value into glucose_charts (shows on the Glycemic tab).
export async function logGlucoseCheck(check, value, staff) {
  await updateDoc(doc(db, COL.GLUCOSE_SCHEDULE, check.id), {
    status: 'done', value, doneAt: serverTimestamp(), recordedBy: staff.name,
  });
  await addDoc(collection(db, COL.GLUCOSE), {
    emrNumber: check.emrNumber,
    visitId: null,
    type: check.type,
    value,
    notes: 'Logged from Reminders tab',
    recordedBy: staff.name,
    recordedAt: serverTimestamp(),
  });
}
