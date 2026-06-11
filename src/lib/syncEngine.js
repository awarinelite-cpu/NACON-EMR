// src/lib/syncEngine.js
// ─────────────────────────────────────────────
// Sync engine: replays pending offline writes to Firestore
// when the device comes back online.
// ─────────────────────────────────────────────
import {
  doc, collection, addDoc, setDoc, updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  getPendingWrites,
  deletePendingWrite,
} from './offlineDB';

let _isSyncing  = false;
let _listeners  = [];           // components can subscribe to sync state

export function onSyncStateChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

function emit(state) {
  _listeners.forEach(fn => fn(state));
}

/**
 * Attempt to flush all pending writes to Firestore.
 * Called automatically when the device comes online.
 * Returns { synced, failed } counts.
 */
export async function flushPendingWrites() {
  if (_isSyncing) return { synced: 0, failed: 0 };
  _isSyncing = true;
  emit({ syncing: true, synced: 0, failed: 0 });

  const pending = await getPendingWrites();
  if (!pending.length) {
    _isSyncing = false;
    emit({ syncing: false, synced: 0, failed: 0 });
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const payload = { ...item.data };

      // Replace placeholder timestamps with real serverTimestamp
      for (const key of Object.keys(payload)) {
        if (payload[key] === '__serverTimestamp__') {
          payload[key] = serverTimestamp();
        }
      }

      switch (item.operation) {
        case 'add': {
          const colRef = collection(db, item.collection);
          await addDoc(colRef, payload);
          break;
        }
        case 'set': {
          const docRef = doc(db, item.collection, item.docId);
          await setDoc(docRef, payload, { merge: true });
          break;
        }
        case 'update': {
          const docRef = doc(db, item.collection, item.docId);
          await updateDoc(docRef, payload);
          break;
        }
        default:
          console.warn('[SyncEngine] Unknown operation:', item.operation);
      }

      await deletePendingWrite(item.id);
      synced++;
    } catch (err) {
      console.error('[SyncEngine] Failed to sync item', item.id, err);
      failed++;
    }
  }

  _isSyncing = false;
  emit({ syncing: false, synced, failed });
  return { synced, failed };
}

/**
 * Start the online listener — auto-sync when connectivity returns.
 * Call once at app startup.
 */
export function startSyncListener() {
  const handleOnline = () => {
    console.log('[SyncEngine] Back online — flushing pending writes…');
    flushPendingWrites();
  };

  window.addEventListener('online', handleOnline);

  // Also attempt flush immediately if already online
  if (navigator.onLine) {
    flushPendingWrites();
  }

  return () => window.removeEventListener('online', handleOnline);
}
