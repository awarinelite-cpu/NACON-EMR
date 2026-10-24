// src/lib/offlineWrites.js
// ─────────────────────────────────────────────
// Offline-safe Firestore writes.
//
// With the persistent local cache (see firebase.js) every write is stored on
// the device straight away and uploaded automatically when the connection is
// back — even after the app is closed. The catch: Firestore only resolves the
// write's promise once the SERVER confirms it, so offline (or on a very weak
// signal) `await addDoc(...)` would hang forever and the screen would sit on
// "Saving…". These wrappers hand control back as soon as the write is safely
// stored locally, while still surfacing real errors (e.g. permission denied)
// when the server answers quickly.
// ─────────────────────────────────────────────
import {
  doc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  writeBatch as _writeBatch,
} from 'firebase/firestore';

const ACK_WAIT_MS = 6000;

function ack(p) {
  // Real server answers that arrive after we stopped waiting are only logged.
  p.catch(err => console.warn('[offline-write] rejected by server:', err?.code || err));
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.resolve();               // saved locally, will sync on reconnect
  }
  return Promise.race([p, new Promise(resolve => setTimeout(resolve, ACK_WAIT_MS))]);
}

export const setDoc    = (...args) => ack(_setDoc(...args));
export const updateDoc = (...args) => ack(_updateDoc(...args));
export const deleteDoc = (...args) => ack(_deleteDoc(...args));

// addDoc = create the ref (id is generated on the device) + set.
export async function addDoc(collectionRef, data) {
  const ref = doc(collectionRef);
  await ack(_setDoc(ref, data));
  return ref;
}

export function writeBatch(db) {
  const batch = _writeBatch(db);
  const commit = batch.commit.bind(batch);
  batch.commit = () => ack(commit());
  return batch;
}
