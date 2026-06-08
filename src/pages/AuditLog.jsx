// src/pages/AuditLog.jsx
import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COL, formatDateTime } from '../lib/emr';

const ACTION_COLORS = {
  REGISTER_PATIENT: { cls: 'badge-ok',      icon: 'ti-user-plus'      },
  UPDATE_PATIENT:   { cls: 'badge-info',     icon: 'ti-user-edit'      },
  CREATE_VISIT:     { cls: 'badge-info',     icon: 'ti-stethoscope'    },
  DISCHARGE:        { cls: 'badge-ok',       icon: 'ti-door-exit'      },
  REFERRAL:         { cls: 'badge-warn',     icon: 'ti-file-export'    },
  ADD_NOTE:         { cls: 'badge-info',     icon: 'ti-notes-medical'  },
  ADD_VITALS:       { cls: 'badge-info',     icon: 'ti-heart-rate-monitor' },
  PRESCRIPTION:     { cls: 'badge-warn',     icon: 'ti-pill'           },
  FLUID_ENTRY:      { cls: 'badge-info',     icon: 'ti-droplet'        },
  GLUCOSE_ENTRY:    { cls: 'badge-info',     icon: 'ti-activity'       },
  FILE_UPLOAD:      { cls: 'badge-info',     icon: 'ti-upload'         },
  UPDATE_ROLE:      { cls: 'badge-warn',     icon: 'ti-user-cog'       },
  DEACTIVATE_USER:  { cls: 'badge-danger',   icon: 'ti-user-off'       },
  REACTIVATE_USER:  { cls: 'badge-ok',       icon: 'ti-user-check'     },
  DEFAULT:          { cls: 'badge-neutral',  icon: 'ti-circle'         },
};

export default function AuditLog() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');

  useEffect(() => {
    const q = query(
      collection(db, COL.AUDIT),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    getDocs(q).then(snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, []);

  const filtered = filter
    ? logs.filter(l =>
        l.action?.includes(filter) ||
        l.performedBy?.toLowerCase().includes(filter.toLowerCase()) ||
        l.targetId?.toLowerCase().includes(filter.toLowerCase())
      )
    : logs;

  const getStyle = (action) => ACTION_COLORS[action] || ACTION_COLORS.DEFAULT;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Audit Log</div>
        <div style={{ flex:1, maxWidth:320 }}>
          <input
            className="form-input"
            placeholder="Filter by action, user, or target ID…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <span style={{ fontSize:11, color:'var(--t3)', fontWeight:500 }}>
          Last 200 entries
        </span>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <i className="ti ti-database" /> System activity — {filtered.length} entries
            </div>
          </div>

          {loading && (
            <div style={{ padding:32, textAlign:'center' }}>
              <i className="ti ti-loader-2" style={{ fontSize:28, animation:'spin 1s linear infinite', color:'var(--accent)' }} />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>
              <i className="ti ti-database-off" style={{ fontSize:32, display:'block', marginBottom:8 }} />
              No audit entries found
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Performed by</th>
                    <th>Target</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(log => {
                    const s = getStyle(log.action);
                    return (
                      <tr key={log.id}>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, whiteSpace:'nowrap' }}>
                          {formatDateTime(log.timestamp)}
                        </td>
                        <td>
                          <span className={`badge ${s.cls}`}>
                            <i className={`ti ${s.icon}`} />
                            {log.action?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ fontWeight:700, fontSize:12 }}>{log.performedBy || '—'}</td>
                        <td style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--info)' }}>
                          {log.targetId || '—'}
                        </td>
                        <td style={{ fontSize:11, color:'var(--t3)', maxWidth:280 }}>
                          {log.details ? Object.entries(log.details)
                            .filter(([,v]) => v !== undefined && v !== null && v !== '')
                            .map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                            .join(' · ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
