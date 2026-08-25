// src/lib/telegramReminders.js
// ─────────────────────────────────────────────
// Client-side Firestore helpers for the Telegram nursing bot:
//   - account linking (web app <-> nurse's Telegram chat)
//   - medication timing reminders (drug administration due times)
//   - IV infusion timing
//   - FBS/RBS glucose check scheduling
// The actual Telegram delivery (DM, inline buttons) happens server-side
// in Cloud Functions (functions/telegramBot.js + scheduledReminders.js).
// This file only reads/writes the Firestore docs those functions watch.
// ─────────────────────────────────────────────
import {
  doc, collection, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { COL } from './emr';

function stripUndefined(obj) {
  const clean = {};
  for (const [k, v] of Object.entries(obj)) clean[k] = v === undefined ? null : v;
  return clean;
}

// ── ACCOUNT LINKING ──────────────────────────
// Generates a short-lived numeric code the nurse sends to the bot as
// `/link <code>`. The webhook (admin SDK) writes telegram_links/{uid}
// once the code is redeemed and marks this doc used.
export async function generateLinkCode(uid, displayName) {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  await setDoc(doc(db, COL.LINK_CODES, code), {
    uid,
    displayName: displayName || null,
    used: false,
    createdAt: serverTimestamp(),
  });
  return code;
}

export function listenTelegramLink(uid, callback) {
  return onSnapshot(doc(db, COL.TELEGRAM_LINKS, uid), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function unlinkTelegram(uid) {
  await deleteDoc(doc(db, COL.TELEGRAM_LINKS, uid));
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
