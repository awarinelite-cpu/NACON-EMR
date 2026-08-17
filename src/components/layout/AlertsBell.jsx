// src/components/layout/AlertsBell.jsx
// Facility-wide bell showing active (unacknowledged) NEWS2/EWS clinical alerts.
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { listenActiveAlerts, acknowledgeAlert, formatTs } from '../../lib/emr';
import { useAuth } from '../../lib/AuthContext';

export default function AlertsBell() {
  const [alerts, setAlerts] = useState([]);
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();
  const navigate = useNavigate();
  const ref = useRef(null);

  useEffect(() => {
    const unsub = listenActiveAlerts(setAlerts);
    return () => unsub();
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const highCount = alerts.filter(a => a.risk === 'High').length;
  const count = alerts.length;

  const handleAck = async (e, alertId) => {
    e.stopPropagation();
    try {
      await acknowledgeAlert(alertId, profile?.displayName || profile?.email || 'Unknown', profile?.role);
    } catch (err) { console.error('acknowledgeAlert', err); }
  };

  const goToPatient = (emrNumber) => {
    setOpen(false);
    navigate(`/patient/${emrNumber}`);
  };

  if (!profile) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Clinical alerts"
        style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border)',
          background: count > 0 ? (highCount > 0 ? '#fef2f2' : '#fffbeb') : 'var(--card-bg)',
          cursor: 'pointer',
        }}>
        <i className="ti ti-bell" style={{ fontSize: 18, color: count > 0 ? (highCount > 0 ? '#dc2626' : '#d97706') : 'var(--t2)' }} />
        {count > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8,
            background: highCount > 0 ? '#dc2626' : '#d97706', color: '#fff',
            fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px',
          }}>{count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 320, maxHeight: 420, overflowY: 'auto',
          background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: 'var(--shadow-md)', zIndex: 200,
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: 13 }}>
            Clinical Alerts {count > 0 && `(${count})`}
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontSize: 12 }}>
              No active alerts
            </div>
          ) : (
            alerts.map(a => (
              <div key={a.id}
                onClick={() => goToPatient(a.emrNumber)}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: a.risk === 'High' ? '#fef2f2' : '#fffbeb',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 12.5, color: a.risk === 'High' ? '#dc2626' : '#d97706' }}>
                      NEWS2 {a.score} — {a.risk} Risk
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{a.patientName}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>{a.action}</div>
                    <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 3 }}>{formatTs(a.createdAt)}</div>
                  </div>
                  <button onClick={(e) => handleAck(e, a.id)}
                    style={{
                      flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                      border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer',
                    }}>Ack</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
