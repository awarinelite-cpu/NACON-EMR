// src/components/layout/AppShell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { listenTriageQueue } from '../../lib/emr';
import { startSyncListener }  from '../../lib/syncEngine';
import OfflineBanner           from '../shared/OfflineBanner';

export default function AppShell() {
  const [stats, setStats]             = useState({ waiting: 0, sickBay: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef    = useRef(null);
  const lastScroll = useRef(0);
  const location   = useLocation();

  // Auto-close sidebar on every route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Start sync engine once on mount + listen for SW background sync messages
  useEffect(() => {
    const cleanup = startSyncListener();

    // Handle messages from service worker (background sync)
    const onSwMessage = (event) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        import('../../lib/syncEngine').then(({ flushPendingWrites }) => flushPendingWrites());
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    return () => {
      cleanup();
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, []);

  // Axis-lock touch handling for horizontally-scrollable tables (.table-scroll,
  // .mar-table-scroll). CSS touch-action alone can't reliably guarantee "vertical
  // always wins" across mobile browsers, so we detect the gesture direction on
  // touchstart/touchmove and toggle the table wrapper's overflow-x accordingly:
  // a mostly-vertical drag disables the wrapper's horizontal scroll for the
  // duration of that gesture (letting it fall through to the page), a mostly-
  // horizontal drag scrolls the table as normal.
  useEffect(() => {
    let startX = 0, startY = 0, activeEl = null, axis = null;

    const onTouchStart = (e) => {
      const el = e.target.closest?.('.table-scroll, .mar-table-scroll');
      if (!el) { activeEl = null; return; }
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      activeEl = el; axis = null;
    };

    const onTouchMove = (e) => {
      if (!activeEl) return;
      const t = e.touches[0];
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (axis === null && (dx > 6 || dy > 6)) {
        axis = dx > dy ? 'x' : 'y';
        activeEl.style.overflowX = axis === 'y' ? 'hidden' : 'auto';
      }
    };

    const onTouchEnd = () => {
      if (activeEl) activeEl.style.overflowX = 'auto';
      activeEl = null; axis = null;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  // Real-time queue listener — badge reflects only today's waiting triage entries
  useEffect(() => {
    const unsub = listenTriageQueue(rows => {
      setStats(prev => ({ ...prev, waiting: rows.length }));
    });
    return () => unsub();
  }, []);

  // Scroll listener — hides topbar on scroll down
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const topbar = el.querySelector('.topbar');
      if (!topbar) return;
      const currentY = el.scrollTop;
      if (currentY > lastScroll.current && currentY > 40) {
        topbar.classList.add('topbar-hidden');
      } else {
        topbar.classList.remove('topbar-hidden');
      }
      lastScroll.current = currentY <= 0 ? 0 : currentY;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const closeSidebar  = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(o => !o);

  return (
    <div className="app-shell">
      <button
        className="hamburger-btn"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
      >
        <i className={`ti ${sidebarOpen ? 'ti-x' : 'ti-menu-2'}`} />
      </button>

      {/* Backdrop — closes sidebar on tap outside */}
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' active' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      <Sidebar stats={stats} isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="main-area" ref={mainRef}>
        <OfflineBanner />
        <Outlet />
      </div>
    </div>
  );
}
