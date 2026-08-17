// src/components/patients/GlycemicChart.jsx
// 7-point glycemic profile: day-grouping, daily avg/min/max summary, and a trend line chart.
import React, { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// Canonical 7-point order (matches the context select in PatientProfile.jsx)
const CONTEXT_ORDER = [
  'Fasting', 'Pre-breakfast', '2 hours post-breakfast',
  'Pre-lunch', '2 hours post-lunch', 'Pre-dinner', '2 hours post-dinner',
];
const CONTEXT_SHORT = {
  'Fasting': 'Fasting', 'Pre-breakfast': 'Pre-B/fast', '2 hours post-breakfast': 'Post-B/fast',
  'Pre-lunch': 'Pre-lunch', '2 hours post-lunch': 'Post-lunch',
  'Pre-dinner': 'Pre-dinner', '2 hours post-dinner': 'Post-dinner',
};

const MGDL_PER_MMOL = 18;
const toMmol = (value, unit) => (unit === 'mg/dL' ? value / MGDL_PER_MMOL : value);
const toMgdl = (value, unit) => (unit === 'mg/dL' ? value : value * MGDL_PER_MMOL);
const convertGlucose = (value, fromUnit, toUnit) => {
  if (fromUnit === toUnit) return value;
  return toUnit === 'mg/dL' ? toMgdl(value, fromUnit) : toMmol(value, fromUnit);
};
const formatGlucose = (value, unit) =>
  unit === 'mg/dL' ? Math.round(value) : Math.round(value * 10) / 10;

const statusOf = (mmolVal) =>
  mmolVal < 4 ? 'Low' : mmolVal > 10 ? 'High' : mmolVal > 7 ? 'Elevated' : 'Normal';
const statusColor = (mmolVal) =>
  mmolVal < 4 ? '#f59e0b' : mmolVal > 10 ? '#ef4444' : mmolVal > 7 ? '#f97316' : '#10b981';

function dateKeyOf(reading) {
  const ts = reading.recordedAt?.toDate ? reading.recordedAt.toDate() : new Date(reading.recordedAt || Date.now());
  return ts.toISOString().slice(0, 10); // YYYY-MM-DD, groups by calendar day
}
function dateLabelOf(dateKey) {
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label, unit }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  if (p.value == null) return null;
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, color: p.payload.color || 'var(--t1)' }}>
        {p.value} {unit} — {p.payload.status}
      </div>
    </div>
  );
};

export default function GlycemicChart({ glucose = [] }) {
  const [unit, setUnit] = useState('mmol/L');
  const [selectedDay, setSelectedDay] = useState('trend'); // 'trend' = daily-average overview

  // ── Group readings by calendar day ──
  const days = useMemo(() => {
    const map = new Map();
    for (const g of glucose) {
      const raw = parseFloat(g.reading);
      if (isNaN(raw)) continue;
      const storedUnit = g.unit || 'mmol/L';
      const mmolVal = toMmol(raw, storedUnit);
      const key = dateKeyOf(g);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ ...g, mmolVal, storedUnit });
    }
    // Sort days chronologically, most recent last
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, readings]) => {
        const vals = readings.map(r => r.mmolVal);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        return {
          key, label: dateLabelOf(key), readings,
          avg, min, max, count: readings.length,
        };
      });
  }, [glucose]);

  if (days.length === 0) return null;

  const latestDay = days[days.length - 1];
  const activeDay = selectedDay === 'trend' ? null : days.find(d => d.key === selectedDay);

  // ── Chart data: single-day view = 7-point profile; trend view = daily averages ──
  const chartData = useMemo(() => {
    if (activeDay) {
      // Map each canonical context to its reading for this day (may be missing)
      return CONTEXT_ORDER.map(ctx => {
        const r = activeDay.readings.find(x => x.context === ctx);
        if (!r) return { label: CONTEXT_SHORT[ctx], value: null };
        const value = formatGlucose(convertGlucose(r.mmolVal, 'mmol/L', unit), unit);
        return { label: CONTEXT_SHORT[ctx], value, status: statusOf(r.mmolVal), color: statusColor(r.mmolVal) };
      });
    }
    // Trend: one point per day (daily average)
    return days.map(d => ({
      label: d.label,
      value: formatGlucose(convertGlucose(d.avg, 'mmol/L', unit), unit),
      status: statusOf(d.avg),
      color: statusColor(d.avg),
    }));
  }, [activeDay, days, unit]);

  const refHigh = unit === 'mg/dL' ? 180 : 10;
  const refLow = unit === 'mg/dL' ? 72 : 4;

  const summaryDay = activeDay || latestDay;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div className="card-title"><i className="ti ti-chart-line" /> Glycemic Chart</div>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {['mmol/L', 'mg/dL'].map(u => (
            <button key={u} type="button" onClick={() => setUnit(u)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                border: 'none', background: unit === u ? 'var(--accent)' : 'transparent',
                color: unit === u ? '#fff' : 'var(--t2)',
              }}>{u}</button>
          ))}
        </div>
      </div>

      {/* Day selector: Trend (daily averages) + each individual day */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 10px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button onClick={() => setSelectedDay('trend')}
          style={{
            flexShrink: 0, padding: '4px 10px', borderRadius: 20,
            border: `1px solid ${selectedDay === 'trend' ? 'var(--accent)' : 'var(--border)'}`,
            background: selectedDay === 'trend' ? 'var(--accent)' : 'transparent',
            color: selectedDay === 'trend' ? '#fff' : 'var(--t2)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
          }}>Trend</button>
        {days.map(d => (
          <button key={d.key} onClick={() => setSelectedDay(d.key)}
            style={{
              flexShrink: 0, padding: '4px 10px', borderRadius: 20,
              border: `1px solid ${selectedDay === d.key ? 'var(--accent)' : 'var(--border)'}`,
              background: selectedDay === d.key ? 'var(--accent)' : 'transparent',
              color: selectedDay === d.key ? '#fff' : 'var(--t2)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
            }}>{d.label} ({d.count}/7)</button>
        ))}
      </div>

      <div style={{ padding: '0 8px 16px' }}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--t3)' }} tickLine={false} interval={0} angle={-25} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            <ReferenceLine y={refHigh} stroke="#ef4444" strokeDasharray="5 5" strokeOpacity={0.5}
              label={{ value: `High ${refHigh}`, fontSize: 9, fill: '#ef4444', position: 'insideTopRight' }} />
            <ReferenceLine y={refLow} stroke="#f59e0b" strokeDasharray="5 5" strokeOpacity={0.5}
              label={{ value: `Low ${refLow}`, fontSize: 9, fill: '#f59e0b', position: 'insideBottomRight' }} />
            <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2.5}
              dot={(props) => {
                const { cx, cy, payload, index } = props;
                if (payload.value == null) return null;
                return <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={payload.color || 'var(--accent)'} stroke="#fff" strokeWidth={1.5} />;
              }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
              connectNulls={true} />
          </LineChart>
        </ResponsiveContainer>

        {/* Daily summary strip: avg / min / max / point count */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            { label: activeDay ? `${activeDay.label} Avg` : 'Latest Avg', val: formatGlucose(convertGlucose(summaryDay.avg, 'mmol/L', unit), unit) },
            { label: 'Low', val: formatGlucose(convertGlucose(summaryDay.min, 'mmol/L', unit), unit), warn: summaryDay.min < 4 },
            { label: 'High', val: formatGlucose(convertGlucose(summaryDay.max, 'mmol/L', unit), unit), warn: summaryDay.max > 10 },
            { label: 'Points', val: `${summaryDay.count}/7` },
          ].map(c => (
            <div key={c.label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 20,
              background: c.warn ? '#fef2f2' : 'var(--card-bg2)',
              border: `1px solid ${c.warn ? '#fca5a5' : 'var(--border)'}`,
            }}>
              {c.warn && <i className="ti ti-alert-triangle" style={{ fontSize: 10, color: '#ef4444' }} />}
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>{c.label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: c.warn ? '#ef4444' : 'var(--t1)' }}>
                {c.val} {c.label !== 'Points' ? unit : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Grouped readings table, most recent day first */}
      <div className="table-scroll">
        <table className="chart-table">
          <thead><tr><th>Time</th><th>Reading ({unit})</th><th>Context</th><th>Status</th><th>By</th></tr></thead>
          <tbody>
            {[...days].reverse().map(d => (
              <React.Fragment key={d.key}>
                <tr>
                  <td colSpan={5} style={{
                    fontWeight: 800, fontSize: 11, color: 'var(--t2)',
                    background: 'var(--card-bg2)', padding: '6px 10px',
                  }}>
                    {d.label} — avg {formatGlucose(convertGlucose(d.avg, 'mmol/L', unit), unit)} {unit}, {d.count}/7 points
                  </td>
                </tr>
                {d.readings.map(g => {
                  const displayVal = formatGlucose(convertGlucose(g.mmolVal, 'mmol/L', unit), unit);
                  const status = statusOf(g.mmolVal);
                  const scls = g.mmolVal < 4 ? 'badge-warn' : g.mmolVal > 10 ? 'badge-danger' : g.mmolVal > 7 ? 'badge-warn' : 'badge-ok';
                  return (
                    <tr key={g.id}>
                      <td>{g.time}</td>
                      <td style={{ fontWeight: 700 }}>{displayVal}</td>
                      <td className="text-muted">{g.context}</td>
                      <td><span className={`badge ${scls}`}>{status}</span></td>
                      <td className="text-muted text-sm">{g.recordedBy}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
