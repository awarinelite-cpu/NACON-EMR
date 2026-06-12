// src/pages/HealthStats.jsx
import React, { useEffect, useState } from 'react';
import { getHealthStats } from '../lib/emr';

const RANGES = [
  { label:'This week',     days:7  },
  { label:'This month',    days:30 },
  { label:'Last 3 months', days:90 },
  { label:'This semester', days:180},
];

export default function HealthStats() {
  const [range,   setRange]   = useState(1);       // index into RANGES
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - RANGES[range].days);
    from.setHours(0, 0, 0, 0);
    getHealthStats(from, to).then(s => { setStats(s); setLoading(false); });
  }, [range]);

  const barMax = stats ? Math.max(...Object.values(stats.byDay), 1) : 1;
  const days   = stats ? Object.entries(stats.byDay) : [];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">Health Statistics</div>
        <div style={{ display:'flex', gap:6 }}>
          {RANGES.map((r, i) => (
            <button key={i}
              className={`btn ${range===i?'btn-primary':''}`}
              style={{ fontSize:11, padding:'5px 10px' }}
              onClick={() => setRange(i)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">
        {loading && (
          <div style={{ padding:40, textAlign:'center' }}>
            <i className="ti ti-loader-2" style={{ fontSize:28, animation:'spin 1s linear infinite', color:'var(--accent)' }} />
          </div>
        )}

        {stats && !loading && (
          <>
            {/* KPI cards */}
            <div className="stats-grid" style={{ marginBottom:16 }}>
              {[
                { label:'Total visits',     value: stats.totalVisits,   icon:'ti-stethoscope', color:'var(--accent)'  },
                { label:'Discharged',       value: stats.discharged,    icon:'ti-door-exit',   color:'var(--success)' },
                { label:'Referred out',     value: stats.referred,      icon:'ti-file-export', color:'var(--warn)'    },
                { label:'Admitted (sick bay)',value:stats.sickBay,      icon:'ti-bed',         color:'var(--info)'    },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-label"><i className={`ti ${s.icon}`} style={{ color:s.color }} />{s.label}</div>
                  <div className="stat-value" style={{ color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:14 }}>
              {/* Visits per day bar chart */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-chart-bar" />Visits per day</div>
                  <span style={{ fontSize:10, color:'var(--t3)' }}>{RANGES[range].label}</span>
                </div>
                <div className="card-body">
                  {days.length === 0
                    ? <div style={{ color:'var(--t3)', fontWeight:700, textAlign:'center', padding:20 }}>No visit data</div>
                    : (
                      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:140, overflowX:'auto' }}>
                        {days.slice(-30).map(([day, count]) => (
                          <div key={day} style={{ display:'flex', flexDirection:'column', alignItems:'center', flex:1, minWidth:28, gap:3 }}>
                            <div style={{ fontSize:9, fontWeight:700, color:'var(--t2)' }}>{count}</div>
                            <div style={{
                              width:'100%', background:'var(--accent)',
                              borderRadius:'4px 4px 0 0',
                              height: `${Math.max(4, (count / barMax) * 110)}px`,
                              opacity: 0.85,
                            }} />
                            <div style={{ fontSize:8, color:'var(--t3)', textAlign:'center', lineHeight:1.2 }}>{day}</div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </div>
              </div>

              {/* Priority + status breakdown */}
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><i className="ti ti-flag" />Triage priority</div>
                  </div>
                  <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {[
                      { label:'P1 — Emergency', value: stats.priority.P1, color:'#ef4444' },
                      { label:'P2 — Urgent',    value: stats.priority.P2, color:'#f59e0b' },
                      { label:'P3 — Routine',   value: stats.priority.P3, color:'#22c55e' },
                    ].map(p => (
                      <div key={p.label}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, marginBottom:4 }}>
                          <span style={{ color:'var(--t2)' }}>{p.label}</span>
                          <span style={{ color:p.color }}>{p.value}</span>
                        </div>
                        <div style={{ height:6, background:'var(--card-bg2)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{
                            height:'100%', background:p.color, borderRadius:3,
                            width: `${stats.totalTriage > 0 ? (p.value/stats.totalTriage)*100 : 0}%`,
                            transition:'width .4s ease',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title"><i className="ti ti-chart-pie" />Outcomes</div>
                  </div>
                  <div className="card-body" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {Object.entries(stats.statusMap).map(([status, count]) => (
                      <div key={status} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--t2)', textTransform:'capitalize' }}>{status}</span>
                        <span style={{ fontSize:13, fontWeight:800, color:'var(--accent)' }}>{count}</span>
                      </div>
                    ))}
                    {Object.keys(stats.statusMap).length === 0 && (
                      <div style={{ color:'var(--t3)', fontWeight:700, fontSize:11 }}>No data</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
