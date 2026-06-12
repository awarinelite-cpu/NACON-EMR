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
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
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
            <div style={{ padding:'8px 14px 20px' }}>
              {/* Group logs by date */}
              {(() => {
                const grouped = {};
                filtered.forEach(log => {
                  const d = log.timestamp?.toDate?.();
                  const key = d ? d.toLocaleDateString('en-NG', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) : 'Unknown date';
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(log);
                });
                return Object.entries(grouped).map(([date, entries]) => (
                  <div key={date} style={{ marginBottom:24 }}>
                    {/* Date separator */}
                    <div style={{
                      display:'flex', alignItems:'center', gap:10, marginBottom:14,
                    }}>
                      <div style={{ fontSize:11, fontWeight:800, color:'var(--t3)', whiteSpace:'nowrap',
                        textTransform:'uppercase', letterSpacing:'.06em' }}>{date}</div>
                      <div style={{ flex:1, height:1, background:'var(--border)' }} />
                    </div>

                    {/* Timeline entries */}
                    <div style={{ position:'relative', paddingLeft:32 }}>
                      {/* Vertical line */}
                      <div style={{
                        position:'absolute', left:10, top:0, bottom:0,
                        width:2, background:'var(--border)', borderRadius:1,
                      }} />

                      {entries.map((log, idx) => {
                        const s = getStyle(log.action);
                        const t = log.timestamp?.toDate?.();
                        const timeStr = t ? t.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' }) : '';
                        const details = log.details
                          ? Object.entries(log.details)
                              .filter(([,v]) => v !== undefined && v !== null && v !== '')
                              .map(([k,v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                              .join(' · ')
                          : '';
                        return (
                          <div key={log.id} style={{
                            position:'relative', marginBottom: idx < entries.length-1 ? 14 : 0,
                            display:'flex', gap:10, alignItems:'flex-start',
                          }}>
                            {/* Dot */}
                            <div style={{
                              position:'absolute', left:-26, top:3,
                              width:14, height:14, borderRadius:'50%',
                              background:'var(--card-bg)',
                              border:`2px solid var(--border)`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              flexShrink:0,
                            }}>
                              <i className={`ti ${s.icon}`} style={{
                                fontSize:7,
                                color: s.cls.includes('ok') ? 'var(--success)'
                                  : s.cls.includes('danger') ? 'var(--danger)'
                                  : s.cls.includes('warn')   ? 'var(--warn)'
                                  : 'var(--info)',
                              }} />
                            </div>

                            {/* Content */}
                            <div style={{
                              flex:1, background:'var(--card-bg)',
                              border:'1px solid var(--border)', borderRadius:8,
                              padding:'8px 12px',
                            }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:3 }}>
                                <span className={`badge ${s.cls}`} style={{ fontSize:10 }}>
                                  <i className={`ti ${s.icon}`} />
                                  {log.action?.replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize:10, color:'var(--t3)', fontFamily:'var(--mono)' }}>{timeStr}</span>
                              </div>
                              <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>
                                {log.performedBy || 'System'}
                              </div>
                              {log.targetId && (
                                <div style={{ fontSize:11, color:'var(--info)', fontFamily:'var(--mono)', marginTop:1 }}>
                                  → {log.targetId}
                                </div>
                              )}
                              {details && (
                                <div style={{ fontSize:10, color:'var(--t3)', marginTop:4, lineHeight:1.5 }}>
                                  {details}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
