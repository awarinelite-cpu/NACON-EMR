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

  // Scroll listener on main-area itself (the single scroll container on mobile)
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
