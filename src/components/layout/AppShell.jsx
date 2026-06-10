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

  useEffect(() => {
    getTodayStats().then(setStats);
    const t = setInterval(() => getTodayStats().then(setStats), 60000);
    return () => clearInterval(t);
  }, []);

  // Scroll-aware topbar: attach listener to .page-content inside main-area
  // Uses event delegation so it works regardless of which page is rendered
  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const onScroll = (e) => {
      const el = e.target;
      if (!el.classList.contains('page-content')) return;
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

    mainEl.addEventListener('scroll', onScroll, true); // capture phase
    return () => mainEl.removeEventListener('scroll', onScroll, true);
  }, []);

  const closeSidebar  = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(o => !o);

  return (
    <div className="app-shell">
      {/* ── HAMBURGER — mobile only ── */}
      <button
        className="hamburger-btn"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
      >
        <i className={`ti ${sidebarOpen ? 'ti-x' : 'ti-menu-2'}`} />
      </button>

      {/* ── BACKDROP ── */}
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
