// src/components/patients/FluidBalanceChart.jsx
// 24-hour fluid balance: day-grouping, running in/out/balance totals, and a trend chart.
import React, { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';

function dateKeyOf(entry) {
  const ts = entry.recordedAt?.toDate ? entry.recordedAt.toDate() : new Date(entry.recordedAt || Date.now());
  return ts.toISOString().slice(0, 10);
}
function dateLabelOf(dateKey) {
  return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--t2)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--t3)', minWidth: 60 }}>{p.name}:</span>
          <span style={{ fontWeight: 800, color: 'var(--t1)' }}>{p.value} ml</span>
        </div>
      ))}
    </div>
  );
};

export default function FluidBalanceChart({ fluid = [] }) {
  const [selectedDay, setSelectedDay] = useState('trend');

  const days = useMemo(() => {
    const map = new Map();
    for (const f of fluid) {
      const key = dateKeyOf(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, entries]) => {
        const totalIn = entries.reduce((s, e) => s + (parseInt(e.intakeAmt) || 0), 0);
        const totalOut = entries.reduce((s, e) => s + (parseInt(e.outputAmt) || 0), 0);
        return {
          key, label: dateLabelOf(key), entries,
          totalIn, totalOut, balance: totalIn - totalOut, count: entries.length,
        };
      });
  }, [fluid]);

  if (days.length === 0) return null;

  const latestDay = days[days.length - 1];
  const activeDay = selectedDay === 'trend' ? null : days.find(d => d.key === selectedDay);

  // Running balance within a single day, entry by entry (sorted by time)
  const dayChartData = useMemo(() => {
    if (!activeDay) return null;
    const sorted = [...activeDay.entries].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    let running = 0;
    return sorted.map(e => {
      const inAmt = parseInt(e.intakeAmt) || 0;
      const outAmt = parseInt(e.outputAmt) || 0;
      running += inAmt - outAmt;
      return { label: e.time || '—', In: inAmt, Out: -outAmt, Balance: running };
    });
  }, [activeDay]);

  // Trend: one point per day (daily totals + balance)
  const trendChartData = useMemo(() => days.map(d => ({
    label: d.label, In: d.totalIn, Out: -d.totalOut, Balance: d.balance,
  })), [days]);

  const chartData = activeDay ? dayChartData : trendChartData;
  const summaryDay = activeDay || latestDay;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <div className="card-title"><i className="ti ti-droplet" /> Fluid Balance Chart</div>
      </div>

      {/* Day selector: Trend (daily totals) + each individual day */}
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
            }}>{d.label} ({d.count})</button>
        ))}
      </div>

      <div style={{ padding: '0 8px 16px' }}>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--t3)' }} tickLine={false} interval={0} angle={-25} textAnchor="end" height={50} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--t3)' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="In" fill="#0288D1" name="Intake" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Out" fill="#f59e0b" name="Output" radius={[0, 0, 3, 3]} />
            <Line type="monotone" dataKey="Balance" stroke="#10b981" strokeWidth={2.5}
              dot={{ r: 3.5, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} name="Running Balance" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Daily summary strip: total in / out / net balance / entry count */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {[
            { label: activeDay ? `${activeDay.label} In` : 'Latest In', val: `${summaryDay.totalIn} ml`, color: '#0288D1' },
            { label: 'Out', val: `${summaryDay.totalOut} ml`, color: '#f59e0b' },
            { label: 'Balance', val: `${summaryDay.balance >= 0 ? '+' : ''}${summaryDay.balance} ml`, warn: Math.abs(summaryDay.balance) > 1000 },
            { label: 'Entries', val: summaryDay.count },
          ].map(c => (
            <div key={c.label} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 20,
              background: c.warn ? '#fef2f2' : 'var(--card-bg2)',
              border: `1px solid ${c.warn ? '#fca5a5' : 'var(--border)'}`,
            }}>
              {c.warn && <i className="ti ti-alert-triangle" style={{ fontSize: 10, color: '#ef4444' }} />}
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3)' }}>{c.label}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: c.warn ? '#ef4444' : (c.color || 'var(--t1)') }}>{c.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Grouped entries table, most recent day first */}
      <div className="table-scroll">
        <table className="chart-table">
          <thead><tr><th>Time</th><th>Intake (ml)</th><th>Type</th><th>Output (ml)</th><th>Type</th><th>By</th></tr></thead>
          <tbody>
            {[...days].reverse().map(d => (
              <React.Fragment key={d.key}>
                <tr>
                  <td colSpan={6} style={{
                    fontWeight: 800, fontSize: 11, color: 'var(--t2)',
                    background: 'var(--card-bg2)', padding: '6px 10px',
                  }}>
                    {d.label} — In {d.totalIn}ml, Out {d.totalOut}ml, Balance {d.balance >= 0 ? '+' : ''}{d.balance}ml
                  </td>
                </tr>
                {[...d.entries].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(f => (
                  <tr key={f.id}>
                    <td>{f.time}</td>
                    <td style={{ color: '#0288D1', fontWeight: 700 }}>{f.intakeAmt || '—'}</td>
                    <td className="text-muted">{f.intakeType}</td>
                    <td style={{ color: '#f59e0b', fontWeight: 700 }}>{f.outputAmt || '—'}</td>
                    <td className="text-muted">{f.outputType}</td>
                    <td className="text-muted text-sm">{f.recordedBy}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
