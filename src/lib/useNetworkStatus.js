// src/lib/useNetworkStatus.js
// ─────────────────────────────────────────────
// Hook: tracks online/offline status + pending sync count
// ─────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { getPendingCount } from './offlineDB';
import { onSyncStateChange } from './syncEngine';

export function useNetworkStatus() {
  const [isOnline,      setIsOnline]      = useState(navigator.onLine);
  const [pendingCount,  setPendingCount]  = useState(0);
  const [syncState,     setSyncState]     = useState({ syncing: false, synced: 0, failed: 0 });

  // Refresh pending count from IndexedDB
  const refreshPending = async () => {
    const n = await getPendingCount();
    setPendingCount(n);
  };

  useEffect(() => {
    const onOnline  = () => { setIsOnline(true);  refreshPending(); };
    const onOffline = () => { setIsOnline(false); refreshPending(); };

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    // Subscribe to sync engine state changes
    const unsub = onSyncStateChange(state => {
      setSyncState(state);
      if (!state.syncing) refreshPending();
    });

    refreshPending();

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      unsub();
    };
  }, []);

  return { isOnline, pendingCount, syncState };
}
