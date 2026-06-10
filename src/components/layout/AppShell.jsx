// src/components/layout/AppShell.jsx
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getTodayStats } from '../../lib/emr';

export default function AppShell() {
  const [stats, setStats]           = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    getTodayStats().then(setStats);
    const t = setInterval(() => getTodayStats().then(setStats), 60000);
    return () => clearInterval(t);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(o => !o);

  return (
    <div className="app-shell">
      {/* ── HAMBURGER BUTTON — mobile only ── */}
      <button
        className="hamburger-btn"
        onClick={toggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
      >
        <i className={`ti ${sidebarOpen ? 'ti-x' : 'ti-menu-2'}`} />
      </button>

      {/* ── BACKDROP — closes sidebar when tapped outside ── */}
      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}

      <Sidebar stats={stats} isOpen={sidebarOpen} onClose={closeSidebar} />

      <div className="main-area">
        <Outlet />
      </div>
    </div>
  );
}
