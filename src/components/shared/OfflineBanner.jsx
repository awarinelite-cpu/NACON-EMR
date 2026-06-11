// src/components/shared/OfflineBanner.jsx
// ─────────────────────────────────────────────
// Sticky banner shown when device is offline or syncing
// ─────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { useNetworkStatus } from '../../lib/useNetworkStatus';

export default function OfflineBanner() {
  const { isOnline, pendingCount, syncState } = useNetworkStatus();
  const [showSynced, setShowSynced] = useState(false);

  // Show a brief "Synced" confirmation after flush completes
  useEffect(() => {
    if (!syncState.syncing && syncState.synced > 0) {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(t);
    }
  }, [syncState]);

  // Nothing to show when online, no pending, no recent sync
  if (isOnline && pendingCount === 0 && !syncState.syncing && !showSynced) {
    return null;
  }

  let message   = '';
  let icon      = '';
  let bannerCls = 'offline-banner';

  if (!isOnline) {
    icon      = 'ti-wifi-off';
    message   = pendingCount > 0
      ? `Offline — ${pendingCount} action${pendingCount > 1 ? 's' : ''} saved locally`
      : 'You are offline — viewing cached data';
    bannerCls += ' offline-banner--offline';
  } else if (syncState.syncing) {
    icon      = 'ti-refresh';
    message   = `Syncing ${pendingCount} pending action${pendingCount > 1 ? 's' : ''}…`;
    bannerCls += ' offline-banner--syncing';
  } else if (showSynced) {
    icon      = 'ti-circle-check';
    message   = `${syncState.synced} action${syncState.synced > 1 ? 's' : ''} synced successfully`;
    bannerCls += ' offline-banner--synced';
  } else if (pendingCount > 0) {
    icon      = 'ti-clock-upload';
    message   = `${pendingCount} action${pendingCount > 1 ? 's' : ''} pending sync`;
    bannerCls += ' offline-banner--pending';
  }

  return (
    <div className={bannerCls} role="status" aria-live="polite">
      <i className={`ti ${icon} offline-banner__icon ${syncState.syncing ? 'spin' : ''}`} />
      <span className="offline-banner__text">{message}</span>
    </div>
  );
}
