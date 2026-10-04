// src/pages/NurseDashboard.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import PatientSearch from '../components/shared/PatientSearch';
import { listenPatients, listenTriageQueue, listenSickReportsToday, listenSeenToday } from '../lib/emr';

export default function NurseDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [patients,    setPatients]    = useState([]);
  const [queue,       setQueue]       = useState([]);
  const [sickReports, setSickReports] = useState([]);
  const [seenToday,   setSeenToday]   = useState([]);

  useEffect(() => {
    const u1 = listenPatients(setPatients);
    const u2 = listenTriageQueue(setQueue);
    const u3 = listenSickReportsToday(setSickReports);
    const u4 = listenSeenToday(setSeenToday);
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); };
  }, []);

  const todayStart = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
  const isToday = ts => {
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d >= todayStart;
  };

  const waiting       = queue.filter(q => q.status === 'waiting').length;
  const sickBay       = patients.filter(p => p.status === 'sickbay');
  const maleAdm       = sickBay.filter(p => p.sex === 'Male').length;
  const femaleAdm     = sickBay.filter(p => p.sex === 'Female').length;
  const seenIds       = new Set(seenToday.map(p => p.id));
  const sickSeenCount = sickReports.filter(p => seenIds.has(p.id)).length;
  const sickTotal     = sickReports.length;
  const notSeen       = sickTotal - sickSeenCount;
  const dischargedToday = patients.filter(p => p.status === 'discharged' && isToday(p.updatedAt)).length;
  const referredToday   = patients.filter(p => p.status === 'referred'   && isToday(p.updatedAt)).length;

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Dashboard — Nurse {profile?.displayName}</div>
        <PatientSearch />
      </div>
      <div className="page-content" style={{ flex:1 }}>

        {/* ── Total Registered Patients ── */}
        <div className="dash-card dash-card-wide" onClick={() => navigate('/nurse/patients')}
          style={{'--ac':'#7c3aed'}}>
          <div className="dash-label"><i className="ti ti-users" />Total Registered Patients</div>
          <div className="dash-value">{patients.length}</div>
        </div>

        {/* ── Row 1: Waiting · Meds Due · Seen Today ── */}
        <div className="dash-grid">
          <div className="dash-card" onClick={() => navigate('/nurse/queue')}
            style={{'--ac':'#2563eb'}}>
            <div className="dash-label"><i className="ti ti-clock" />Waiting</div>
            <div className="dash-value">{waiting}</div>
          </div>
          <div className="dash-card" onClick={() => navigate('/nurse/meds')}
            style={{'--ac':'#dc2626'}}>
            <div className="dash-label"><i className="ti ti-pill" />Meds due</div>
            <div className="dash-value">0</div>
          </div>
          <div className="dash-card" onClick={() => navigate('/nurse/seen-today')}
            style={{'--ac':'#16a34a'}}>
            <div className="dash-label"><i className="ti ti-check" />Seen today</div>
            <div className="dash-value">{sickSeenCount}</div>
          </div>
        </div>

        {/* ── Row 2: Sick Report · On Admission · D/R ── */}
        <div className="dash-grid">
          <div className="dash-card" onClick={() => navigate('/nurse/sick-report')}
            style={{'--ac':'#ea580c'}}>
            <div className="dash-label"><i className="ti ti-stethoscope" />Sick Report</div>
            <div className="dash-value">{sickTotal}</div>
            <div className="dash-sub">
              <span>✓ {sickSeenCount} seen</span>
              <span>· {notSeen} pending</span>
            </div>
          </div>

          <div className="dash-card" onClick={() => navigate('/nurse/on-admission')}
            style={{'--ac':'#9333ea'}}>
            <div className="dash-label"><i className="ti ti-bed" />On Admission</div>
            <div className="dash-split">
              <div>
                <div className="dash-value-sm">{maleAdm}</div>
                <div className="dash-caption">Male</div>
              </div>
              <div className="dash-divider" />
              <div>
                <div className="dash-value-sm">{femaleAdm}</div>
                <div className="dash-caption">Female</div>
              </div>
            </div>
          </div>

          <div className="dash-card" onClick={() => navigate('/nurse/discharged-referred')}
            style={{'--ac':'#059669'}}>
            <div className="dash-label"><i className="ti ti-logout" />D/R Today</div>
            <div className="dash-split">
              <div>
                <div className="dash-value-sm">{dischargedToday}</div>
                <div className="dash-caption">Discharged</div>
              </div>
              <div className="dash-divider" />
              <div>
                <div className="dash-value-sm">{referredToday}</div>
                <div className="dash-caption">Referred</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
