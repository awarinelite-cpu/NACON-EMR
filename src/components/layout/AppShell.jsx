// src/components/layout/AppShell.jsx
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { getTodayStats } from '../../lib/emr';

export default function AppShell() {
  const [stats, setStats] = useState({});

  useEffect(() => {
    getTodayStats().then(setStats);
    // Refresh stats every 60s
    const t = setInterval(() => getTodayStats().then(setStats), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar stats={stats} />
      <div className="main-area">
        <Outlet />
      </div>
    </div>
  );
}
