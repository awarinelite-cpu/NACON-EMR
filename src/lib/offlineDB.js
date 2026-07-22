// src/lib/offlineDB.js
// ─────────────────────────────────────────────
// IndexedDB wrapper for offline-first EMR data
// Stores: patients, vitals, triage, prescriptions, notes, pendingWrites
// ─────────────────────────────────────────────

const DB_NAME    = 'nacon-emr-offline';
const DB_VERSION = 1;

const STORES = {
  PATIENTS:      'patients',
  VITALS:        'vitals',
  TRIAGE:        'triage',
  PRESCRIPTIONS: 'prescriptions',
  NOTES:         'notes',
  PENDING:       'pendingWrites',   // sync queue
};

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Patient records
      if (!db.objectStoreNames.contains(STORES.PATIENTS)) {
        const ps = db.createObjectStore(STORES.PATIENTS, { keyPath: 'id' });
        ps.createIndex('emrNumber', 'emrNumber', { unique: false });
        ps.createIndex('status',    'status',    { unique: false });
      }

      // Vital signs
      if (!db.objectStoreNames.contains(STORES.VITALS)) {
        const vs = db.createObjectStore(STORES.VITALS, { keyPath: 'id' });
        vs.createIndex('patientId', 'patientId', { unique: false });
      }

      // Triage queue
      if (!db.objectStoreNames.contains(STORES.TRIAGE)) {
        const ts = db.createObjectStore(STORES.TRIAGE, { keyPath: 'id' });
        ts.createIndex('status', 'status', { unique: false });
      }

      // Prescriptions
      if (!db.objectStoreNames.contains(STORES.PRESCRIPTIONS)) {
        const rx = db.createObjectStore(STORES.PRESCRIPTIONS, { keyPath: 'id' });
        rx.createIndex('patientId', 'patientId', { unique: false });
      }

      // Clinical notes
      if (!db.objectStoreNames.contains(STORES.NOTES)) {
        const ns = db.createObjectStore(STORES.NOTES, { keyPath: 'id' });
        ns.createIndex('patientId', 'patientId', { unique: false });
      }

      // Pending writes (sync queue)
      if (!db.objectStoreNames.contains(STORES.PENDING)) {
        const pw = db.createObjectStore(STORES.PENDING, {
          keyPath: 'id', autoIncrement: true,
        });
        pw.createIndex('collection', 'collection', { unique: false });
        pw.createIndex('createdAt',  'createdAt',  { unique: false });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => {
    const transaction = db.transaction(storeName, mode);
    const store       = transaction.objectStore(storeName);
    return store;
  });
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Patient cache ────────────────────────────────────────────────────────────

export async function cachePatients(patients) {
  const store = await tx(STORES.PATIENTS, 'readwrite');
  await Promise.all(patients.map(p => promisify(store.put(p))));
}

export async function getCachedPatients() {
  const store = await tx(STORES.PATIENTS);
  return promisify(store.getAll());
}

export async function getCachedPatient(id) {
  const store = await tx(STORES.PATIENTS);
  return promisify(store.get(id));
}

export async function upsertCachedPatient(patient) {
  const store = await tx(STORES.PATIENTS, 'readwrite');
  return promisify(store.put(patient));
}

// ── Vitals cache ─────────────────────────────────────────────────────────────

export async function cacheVitals(vitals) {
  const store = await tx(STORES.VITALS, 'readwrite');
  await Promise.all(vitals.map(v => promisify(store.put(v))));
}

export async function getCachedVitals(patientId) {
  const store = await tx(STORES.VITALS);
  const idx   = store.index('patientId');
  return promisify(idx.getAll(patientId));
}

// ── Triage cache ─────────────────────────────────────────────────────────────

export async function cacheTriage(entries) {
  const store = await tx(STORES.TRIAGE, 'readwrite');
  await Promise.all(entries.map(e => promisify(store.put(e))));
}

export async function getCachedTriage() {
  const store = await tx(STORES.TRIAGE);
  const all   = await promisify(store.getAll());
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return all.filter(t => {
    const d = t.arrivedAt?.toDate?.() || (t.arrivedAt ? new Date(t.arrivedAt) : null);
    return d && d >= today && t.status === 'waiting';
  });
}

// ── Prescriptions cache ──────────────────────────────────────────────────────

export async function cachePrescriptions(rxList) {
  const store = await tx(STORES.PRESCRIPTIONS, 'readwrite');
  await Promise.all(rxList.map(r => promisify(store.put(r))));
}

export async function getCachedPrescriptions(patientId) {
  const store = await tx(STORES.PRESCRIPTIONS);
  const idx   = store.index('patientId');
  return promisify(idx.getAll(patientId));
}

// ── Notes cache ───────────────────────────────────────────────────────────────

export async function cacheNotes(notes) {
  const store = await tx(STORES.NOTES, 'readwrite');
  await Promise.all(notes.map(n => promisify(store.put(n))));
}

export async function getCachedNotes(patientId) {
  const store = await tx(STORES.NOTES);
  const idx   = store.index('patientId');
  return promisify(idx.getAll(patientId));
}

// ── Pending writes (sync queue) ───────────────────────────────────────────────

/**
 * Queue a write for later sync.
 * @param {string} collection - Firestore collection name
 * @param {string} operation  - 'add' | 'set' | 'update'
 * @param {string|null} docId - Firestore doc ID (null = let Firestore generate)
 * @param {object} data       - payload
 */
export async function enqueuePendingWrite(collection, operation, docId, data) {
  const store = await tx(STORES.PENDING, 'readwrite');
  const result = await promisify(store.add({
    collection,
    operation,
    docId:     docId || null,
    data,
    createdAt: new Date().toISOString(),
    retries:   0,
  }));
  // Let the UI know right away — don't wait for an online/offline event,
  // since a write can get queued mid-session on a flaky (but "online") connection.
  window.dispatchEvent(new Event('pendingWritesChanged'));
  return result;
}

export async function getPendingWrites() {
  const store = await tx(STORES.PENDING);
  return promisify(store.getAll());
}

export async function deletePendingWrite(id) {
  const store = await tx(STORES.PENDING, 'readwrite');
  return promisify(store.delete(id));
}

export async function getPendingCount() {
  const store = await tx(STORES.PENDING);
  return promisify(store.count());
}

export { STORES };
