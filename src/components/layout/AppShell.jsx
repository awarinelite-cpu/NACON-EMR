// src/components/layout/AppShell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getTodayStats } from '../../lib/emr';

export default function AppShell() {
  const [stats, setStats]             = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef    = useRef(null);
  const lastScroll = useRef(0);
  const scrollEl   = useRef(null);

  useEffect(() => {
    getTodayStats().then(setStats);
    const t = setInterval(() => getTodayStats().then(setStats), 60000);
    return () => clearInterval(t);
  }, []);

  // Attach scroll listener directly to .page-content whenever it appears/changes
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    let cleanup = () => {};

    const bindScroll = () => {
      const pageContent = mainEl.querySelector('.page-content');
      if (!pageContent || pageContent === scrollEl.current) return;

      // Unbind old
      if (scrollEl.current) {
        scrollEl.current.removeEventListener('scroll', onScroll);
      }

      scrollEl.current = pageContent;
      pageContent.addEventListener('scroll', onScroll, { passive: true });
    };

    const onScroll = () => {
      const el = scrollEl.current;
      if (!el) return;
      const topbar = mainEl.querySelector('.topbar');
      if (!topbar) return;

      const currentY = el.scrollTop;
      if (currentY > lastScroll.current && currentY > 50) {
        topbar.classList.add('topbar-hidden');
      } else {
        topbar.classList.remove('topbar-hidden');
      }
      lastScroll.current = currentY <= 0 ? 0 : currentY;
    };

    // Watch for .page-content to appear (route changes re-render Outlet)
    const observer = new MutationObserver(bindScroll);
    observer.observe(mainEl, { childList: true, subtree: true });

    // Also try immediately
    bindScroll();

    cleanup = () => {
      observer.disconnect();
      if (scrollEl.current) {
        scrollEl.current.removeEventListener('scroll', onScroll);
      }
    };

    return cleanup;
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

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}

      <Sidebar stats={stats} isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="main-area" ref={mainRef}>
        <Outlet />
      </div>
    </div>
  );
}
