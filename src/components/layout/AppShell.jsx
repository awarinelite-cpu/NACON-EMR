// src/components/layout/AppShell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import AlertsBell from './AlertsBell';
import { listenTriageQueue } from '../../lib/emr';
import { startSyncListener }  from '../../lib/syncEngine';
import OfflineBanner           from '../shared/OfflineBanner';

export default function AppShell() {
  const [stats, setStats]             = useState({ waiting: 0, sickBay: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop: sidebar is hidden by default; a hamburger button opens it.
  // Preference is remembered per-browser once the user changes it.
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    const saved = localStorage.getItem('nacon_sidebar_collapsed');
    return saved === null ? true : saved === '1';
  });
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth > 768);
  const mainRef    = useRef(null);
  const lastScroll = useRef(0);
  const location   = useLocation();

  // Track viewport so the hamburger icon/behavior matches mobile vs desktop
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth > 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  const openDesktopSidebar = () => {
    setDesktopCollapsed(false);
    localStorage.setItem('nacon_sidebar_collapsed', '0');
  };
  const closeDesktopSidebar = () => {
    setDesktopCollapsed(true);
    localStorage.setItem('nacon_sidebar_collapsed', '1');
  };

  // One hamburger button, two contexts: on mobile it slides the sidebar
  // in/out over the content; on desktop it shows/hides the sidebar, which
  // is collapsed (width 0) by default so the hamburger is always visible.
  const toggleSidebar = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(o => !o);
    } else {
      desktopCollapsed ? openDesktopSidebar() : closeDesktopSidebar();
    }
  };

  // Clicking anywhere outside the sidebar closes it, on both mobile and desktop
  const closeNav = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    } else {
      closeDesktopSidebar();
    }
  };

  const navVisible = isDesktop ? !desktopCollapsed : sidebarOpen;
  const backdropActive = isDesktop ? !desktopCollapsed : sidebarOpen;

  return (
    <div className={`app-shell${desktopCollapsed ? ' sidebar-desktop-collapsed' : ''}`}>
      <button
        className="hamburger-btn"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={navVisible}
      >
        <i className={`ti ${navVisible ? 'ti-x' : 'ti-menu-2'}`} />
      </button>

      <div style={{ position: 'fixed', top: 10, right: 12, zIndex: 210 }}>
        <AlertsBell />
      </div>

      {/* Backdrop — closes sidebar on click outside (dims on mobile, invisible click-catcher on desktop) */}
      <div
        className={`sidebar-backdrop${backdropActive ? ' active' : ''}${isDesktop ? ' sidebar-backdrop--desktop' : ''}`}
        onClick={closeNav}
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
