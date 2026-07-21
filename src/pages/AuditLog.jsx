// src/pages/AuditLog.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { COL, ROLES } from '../lib/emr';

const ACTION_COLORS = {
  REGISTER_PATIENT: { cls: 'badge-ok',      icon: 'ti-user-plus'      },
  UPDATE_PATIENT:   { cls: 'badge-info',     icon: 'ti-user-edit'      },
  CREATE_VISIT:     { cls: 'badge-info',     icon: 'ti-stethoscope'    },
  DISCHARGE:        { cls: 'badge-ok',       icon: 'ti-door-exit'      },
  REFERRAL:         { cls: 'badge-warn',     icon: 'ti-file-export'    },
  ADD_NOTE:         { cls: 'badge-info',     icon: 'ti-notes-medical'  },
  ADD_CARE_PLAN:    { cls: 'badge-info',     icon: 'ti-clipboard-heart'},
  UPDATE_CARE_PLAN: { cls: 'badge-info',     icon: 'ti-clipboard-check'},
  ADD_VITALS:       { cls: 'badge-info',     icon: 'ti-heart-rate-monitor' },
  PRESCRIPTION:     { cls: 'badge-warn',     icon: 'ti-pill'           },
  FLUID_ENTRY:      { cls: 'badge-info',     icon: 'ti-droplet'        },
  GLUCOSE_ENTRY:    { cls: 'badge-info',     icon: 'ti-activity'       },
  FILE_UPLOAD:      { cls: 'badge-info',     icon: 'ti-upload'         },
  LAB_FILE_UPLOAD:  { cls: 'badge-info',     icon: 'ti-upload'         },
  UPDATE_ROLE:      { cls: 'badge-warn',     icon: 'ti-user-cog'       },
  DEACTIVATE_USER:  { cls: 'badge-danger',   icon: 'ti-user-off'       },
  REACTIVATE_USER:  { cls: 'badge-ok',       icon: 'ti-user-check'     },
  MAR_RECORD:       { cls: 'badge-info',     icon: 'ti-pill'           },
  TRIAGE_ASSIGN:    { cls: 'badge-warn',     icon: 'ti-urgent'         },
  TRIAGE_STATUS:    { cls: 'badge-info',     icon: 'ti-urgent'         },
  INVENTORY_ADD:    { cls: 'badge-ok',       icon: 'ti-building-store' },
  INVENTORY_UPDATE: { cls: 'badge-info',     icon: 'ti-building-store' },
  INVENTORY_DISPENSE:{cls: 'badge-warn',     icon: 'ti-building-store' },
  DISPENSE:         { cls: 'badge-warn',     icon: 'ti-pill'           },
  NHIS_FORM_SAVE:   { cls: 'badge-info',     icon: 'ti-file-text'      },
  NACON_FORM_SAVE:  { cls: 'badge-info',     icon: 'ti-file-text'      },
  LAB_REQUEST:      { cls: 'badge-warn',     icon: 'ti-flask'          },
  LAB_RESULT:       { cls: 'badge-ok',       icon: 'ti-flask'          },
  LAB_STATUS_UPDATE:{ cls: 'badge-info',     icon: 'ti-flask'          },
  DEFAULT:          { cls: 'badge-neutral',  icon: 'ti-circle'         },
};

// Best-effort department inference for older entries that predate
// role-tagging, so filtering still works reasonably on historical data.
const ACTION_ROLE_FALLBACK = {
  INVENTORY_ADD: ROLES.PHARMACIST, INVENTORY_UPDATE: ROLES.PHARMACIST,
  INVENTORY_DISPENSE: ROLES.PHARMACIST, DISPENSE: ROLES.PHARMACIST,
  LAB_RESULT: ROLES.LAB, LAB_STATUS_UPDATE: ROLES.LAB, LAB_FILE_UPLOAD: ROLES.LAB,
  UPDATE_ROLE: ROLES.ADMIN, DEACTIVATE_USER: ROLES.ADMIN, REACTIVATE_USER: ROLES.ADMIN,
};

const DEPARTMENTS = [
  { key: 'all',        label: 'All Staff',   icon: 'ti-users' },
  { key: ROLES.DOCTOR,      label: 'Doctors',     icon: 'ti-stethoscope' },
  { key: ROLES.NURSE,       label: 'Nurses',      icon: 'ti-notes-medical' },
  { key: ROLES.LAB,         label: 'Lab',         icon: 'ti-flask' },
  { key: ROLES.PHARMACIST,  label: 'Pharmacy',    icon: 'ti-building-store' },
  { key: ROLES.RECORDS,     label: 'Records',     icon: 'ti-folder' },
  { key: 'admin_group',     label: 'Admin',       icon: 'ti-shield-lock' },
];

function resolveRole(log) {
  return log.performedByRole || log.details?.role || ACTION_ROLE_FALLBACK[log.action] || null;
}

export default function AuditLog() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('');
  const [dept,    setDept]    = useState('all');

  useEffect(() => {
    const q = query(
      collection(db, COL.AUDIT),
      orderBy('timestamp', 'desc'),
      limit(500)
    );
    // Live listener — admin/subadmin see new staff activity as it happens.
    const unsub = onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const byDept = useMemo(() => {
    if (dept === 'all') return logs;
    if (dept === 'admin_group') {
      return logs.filter(l => ['admin', 'subadmin'].includes(resolveRole(l)));
    }
    return logs.filter(l => resolveRole(l) === dept);
  }, [logs, dept]);

  const filtered = filter
    ? byDept.filter(l =>
        l.action?.includes(filter.toUpperCase()) ||
        l.performedBy?.toLowerCase().includes(filter.toLowerCase()) ||
        l.targetId?.toLowerCase().includes(filter.toLowerCase())
      )
    : byDept;

  const getStyle = (action) => ACTION_COLORS[action] || ACTION_COLORS.DEFAULT;

  // Per-department counts for the tab badges (computed from the full log set,
  // not the currently-filtered one, so counts don't collapse as you filter).
  const deptCounts = useMemo(() => {
    const counts = { all: logs.length, admin_group: 0 };
    logs.forEach(l => {
      const r = resolveRole(l);
      if (r === 'admin' || r === 'subadmin') counts.admin_group++;
      if (r) counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }, [logs]);

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Staff Activity Log</div>
        <div style={{ flex:1, maxWidth:320 }}>
          <input
            className="form-input"
            placeholder="Filter by action, user, or target ID…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <span style={{ fontSize:11, color:'var(--t3)', fontWeight:500 }}>
          Last {logs.length} entries · live
        </span>
      </div>

      <div className="page-content">
        {/* Department filter tabs */}
        <div style={{
          display:'flex', gap:8, flexWrap:'wrap', marginBottom:16,
        }}>
          {DEPARTMENTS.map(d => {
            const active = dept === d.key;
            const count = deptCounts[d.key] || 0;
            return (
              <button
                key={d.key}
                onClick={() => setDept(d.key)}
                className="btn"
                style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:700,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'var(--accent)' : 'var(--card-bg)',
                  color: active ? '#fff' : 'var(--t2)',
                  cursor:'pointer',
                }}
              >
                <i className={`ti ${d.icon}`} />
                {d.label}
                <span style={{
                  fontSize:10, fontWeight:800, padding:'1px 6px', borderRadius:10,
                  background: active ? 'rgba(255,255,255,.25)' : 'var(--main-bg)',
                }}>{count}</span>
              </button>
            );
          })}
        </div>

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
              No activity found
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
                        const role = resolveRole(log);
                        const details = log.details
                          ? Object.entries(log.details)
                              .filter(([k,v]) => k !== 'role' && v !== undefined && v !== null && v !== '')
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
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:12, fontWeight:700, color:'var(--t1)' }}>
                                  {log.performedBy || 'System'}
                                </span>
                                {role && (
                                  <span style={{
                                    fontSize:9, fontWeight:800, textTransform:'uppercase',
                                    letterSpacing:'.04em', color:'var(--t3)',
                                    border:'1px solid var(--border)', borderRadius:6, padding:'0 5px',
                                  }}>{role}</span>
                                )}
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
