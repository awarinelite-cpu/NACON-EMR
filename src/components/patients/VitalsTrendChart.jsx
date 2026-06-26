// src/components/patients/VitalsTrendChart.jsx
// Recharts line chart for BP, HR, Temp, SpO2 trends
import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

const SERIES = [
  { key: 'sbp',  label: 'Systolic BP',  color: '#ef4444', unit: 'mmHg', refLow: 90,  refHigh: 140 },
  { key: 'dbp',  label: 'Diastolic BP', color: '#f97316', unit: 'mmHg', refLow: 60,  refHigh: 90  },
  { key: 'hr',   label: 'Heart Rate',   color: '#8b5cf6', unit: 'bpm',  refLow: 60,  refHigh: 100 },
  { key: 'temp', label: 'Temperature',  color: '#3b82f6', unit: '°C',   refLow: 36,  refHigh: 37.5},
  { key: 'spo2', label: 'SpO₂',         color: '#10b981', unit: '%',    refLow: 94,  refHigh: 100 },
  { key: 'rr',   label: 'Resp. Rate',   color: '#f59e0b', unit: '/min', refLow: 12,  refHigh: 20  },
];

const TABS = [
  { id: 'bp',   label: 'Blood Pressure', keys: ['sbp','dbp'] },
  { id: 'hr',   label: 'Heart Rate',     keys: ['hr']        },
  { id: 'temp', label: 'Temperature',    keys: ['temp']      },
  { id: 'spo2', label: 'SpO₂',           keys: ['spo2']      },
  { id: 'rr',   label: 'Resp. Rate',     keys: ['rr']        },
  { id: 'all',  label: 'Overview',       keys: ['sbp','hr','temp','spo2'] },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => {
        const series = SERIES.find(s => s.key === p.dataKey);
        const isAbnormal = series && (p.value < series.refLow || p.value > series.refHigh);
        return (
          <div key={p.dataKey} style={{
            display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--t3)', minWidth: 90 }}>{series?.label || p.dataKey}:</span>
            <span style={{ fontWeight: 800, color: isAbnormal ? '#ef4444' : 'var(--t1)' }}>
              {p.value} {series?.unit}
              {isAbnormal && ' ⚠'}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default function VitalsTrendChart({ vitals }) {
  const [activeTab, setActiveTab] = useState('bp');

  if (!vitals || vitals.length === 0) return null;

  // Build chart data — newest last (ascending order for chart)
  const chartData = [...vitals]
    .sort((a, b) => (a.recordedAt?.seconds || 0) - (b.recordedAt?.seconds || 0))
    .map(v => {
      const ts = v.recordedAt?.toDate ? v.recordedAt.toDate() : new Date(v.recordedAt || Date.now());
      const label = ts.toLocaleDateString('en-NG', { month:'short', day:'numeric' })
        + ' ' + ts.toLocaleTimeString('en-NG', { hour:'2-digit', minute:'2-digit' });
      return {
        label,
        sbp:  parseFloat(v.sbp)  || null,
        dbp:  parseFloat(v.dbp)  || null,
        hr:   parseFloat(v.hr)   || null,
        temp: parseFloat(v.temp) || null,
        spo2: parseFloat(v.spo2) || null,
        rr:   parseFloat(v.rr)   || null,
      };
    });

  const tab = TABS.find(t => t.id === activeTab) || TABS[0];
  const activeSeries = SERIES.filter(s => tab.keys.includes(s.key));

  // Determine reference lines (use first series' ranges for combined tabs)
  const primary = activeSeries[0];

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <div className="card-title">
          <i className="ti ti-chart-line" /> Vitals Trend
        </div>
        <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>
          {chartData.length} readings
        </span>
      </div>

      {/* Chart tab selector */}
      <div style={{
        display: 'flex', gap: 4, padding: '0 16px 10px', overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flexShrink: 0,
              padding: '4px 10px',
              borderRadius: 20,
              border: `1px solid ${activeTab === t.id ? 'var(--accent)' : 'var(--border)'}`,
              background: activeTab === t.id ? 'var(--accent)' : 'transparent',
              color: activeTab === t.id ? '#fff' : 'var(--t2)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              transition: 'all .15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 8px 16px' }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'var(--t3)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--t3)' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            {activeSeries.length > 1 && <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              formatter={(value) => SERIES.find(s => s.key === value)?.label || value}
            />}

            {/* Normal range reference lines for single-series tabs */}
            {activeSeries.length === 1 && primary && (
              <>
                <ReferenceLine
                  y={primary.refHigh}
                  stroke={primary.color}
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                  label={{ value: `High ${primary.refHigh}`, fontSize: 9, fill: primary.color, position: 'insideTopRight' }}
                />
                <ReferenceLine
                  y={primary.refLow}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeOpacity={0.5}
                  label={{ value: `Low ${primary.refLow}`, fontSize: 9, fill: '#f59e0b', position: 'insideBottomRight' }}
                />
              </>
            )}

            {activeSeries.map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: s.color, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Latest reading summary strip */}
        {chartData.length > 0 && (() => {
          const latest = chartData[chartData.length - 1];
          const checks = [
            { label:'BP',   val: latest.sbp ? `${latest.sbp}/${latest.dbp}` : null, unit:'mmHg', abnormal: latest.sbp > 140 || latest.sbp < 90 },
            { label:'HR',   val: latest.hr,   unit:'bpm',  abnormal: latest.hr > 100 || latest.hr < 60  },
            { label:'Temp', val: latest.temp, unit:'°C',   abnormal: latest.temp > 37.5 || latest.temp < 36 },
            { label:'SpO₂', val: latest.spo2, unit:'%',    abnormal: latest.spo2 < 94   },
            { label:'RR',   val: latest.rr,   unit:'/min', abnormal: latest.rr > 20 || latest.rr < 12   },
          ].filter(c => c.val);
          return (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {checks.map(c => (
                <div key={c.label} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 20,
                  background: c.abnormal ? '#fef2f2' : 'var(--card-bg2)',
                  border: `1px solid ${c.abnormal ? '#fca5a5' : 'var(--border)'}`,
                }}>
                  {c.abnormal && <i className="ti ti-alert-triangle" style={{ fontSize: 10, color: '#ef4444' }} />}
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>{c.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: c.abnormal ? '#ef4444' : 'var(--t1)' }}>
                    {c.val} {c.unit}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
