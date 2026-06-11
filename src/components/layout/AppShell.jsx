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
