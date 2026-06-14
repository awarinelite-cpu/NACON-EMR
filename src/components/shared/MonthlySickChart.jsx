// src/components/shared/MonthlySickChart.jsx
import React, { useEffect, useState, useRef } from 'react';
import { listenSickReportsMonthly } from '../../lib/emr';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Palette for classes — cycles if more than 8
const CLASS_COLORS = [
  { male: '#3b82f6', female: '#93c5fd' },   // blue
  { male: '#10b981', female: '#6ee7b7' },   // green
  { male: '#f97316', female: '#fdba74' },   // orange
  { male: '#8b5cf6', female: '#c4b5fd' },   // purple
  { male: '#ef4444', female: '#fca5a5' },   // red
  { male: '#14b8a6', female: '#5eead4' },   // teal
  { male: '#f59e0b', female: '#fcd34d' },   // amber
  { male: '#ec4899', female: '#f9a8d4' },   // pink
];

function getMonthKey(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

// Build the last 12 month keys
function getLast12Months() {
  return Array.from({ length: 12 }, (_, i) => getMonthKey(i - 11));
}

export default function MonthlySickChart() {
  const [monthlyData, setMonthlyData] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(0));
  const [allClasses, setAllClasses] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsub = listenSickReportsMonthly(data => {
      setMonthlyData(data);
      // Collect all unique classes across all months
      const classes = new Set();
      Object.values(data).forEach(monthObj =>
        Object.keys(monthObj).forEach(cls => classes.add(cls))
      );
      setAllClasses([...classes].sort());
    });
    return () => unsub?.();
  }, []);

  // Scroll month tabs so selected is visible
  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [selectedMonth]);

  const months = getLast12Months();
  const currentData = monthlyData[selectedMonth] || {};
  const classes = allClasses.length > 0 ? allClasses : Object.keys(currentData).sort();

  // Find the max bar value for scaling
  const maxVal = Math.max(
    1,
    ...classes.flatMap(cls => [
      currentData[cls]?.male   || 0,
      currentData[cls]?.female || 0,
    ])
  );

  const BAR_H = 120;   // max bar height px
  const BAR_W = 18;    // each bar width
  const GAP   = 6;     // gap between male/female pair
  const GROUP_GAP = 20; // gap between class groups

  const totalWidth = classes.length * (BAR_W * 2 + GAP + GROUP_GAP);
  const svgH = BAR_H + 44; // bars + labels

  const totalSick   = Object.values(currentData).reduce((s, v) => s + (v.total  || 0), 0);
  const totalMale   = Object.values(currentData).reduce((s, v) => s + (v.male   || 0), 0);
  const totalFemale = Object.values(currentData).reduce((s, v) => s + (v.female || 0), 0);

  return (
    <div className="card" style={{ marginBottom: 0 }}>

      {/* ── Header ── */}
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 6 }}>
        <div className="card-title">
          <i className="ti ti-chart-bar" style={{ color: '#3b82f6' }} />
          Monthly Sick Report
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 8 }}>
            ♂ {totalMale}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#ec4899', background: '#fdf2f8', padding: '2px 8px', borderRadius: 8 }}>
            ♀ {totalFemale}
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t2)', background: 'var(--card-bg2)', padding: '2px 8px', borderRadius: 8 }}>
            Total: {totalSick}
          </span>
        </div>
      </div>

      {/* ── Month toggle tabs ── */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 6, overflowX: 'auto', padding: '0 12px 10px',
          scrollbarWidth: 'none',
        }}
      >
        {months.map(mk => {
          const active = mk === selectedMonth;
          const hasData = !!monthlyData[mk] && Object.keys(monthlyData[mk]).length > 0;
          const [y, m] = mk.split('-');
          return (
            <button
              key={mk}
              data-active={active}
              onClick={() => setSelectedMonth(mk)}
              style={{
                flexShrink: 0,
                padding: '4px 10px',
                fontSize: 10,
                fontWeight: 800,
                borderRadius: 16,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: active ? '#3b82f6' : hasData ? '#eff6ff' : 'var(--card-bg2)',
                color:      active ? '#fff'    : hasData ? '#3b82f6' : 'var(--t3)',
                transition: 'all 0.15s',
                position: 'relative',
              }}
            >
              {MONTH_NAMES[parseInt(m, 10) - 1]}
              <span style={{ fontSize: 8, display: 'block', opacity: 0.75, lineHeight: 1 }}>{y}</span>
              {hasData && !active && (
                <span style={{
                  position: 'absolute', top: 2, right: 4, width: 5, height: 5,
                  borderRadius: '50%', background: '#3b82f6',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Month label ── */}
      <div style={{
        padding: '0 14px 8px',
        fontSize: 11, fontWeight: 700, color: 'var(--t2)',
        letterSpacing: '0.5px',
      }}>
        {monthLabel(selectedMonth)}
      </div>

      {/* ── Chart ── */}
      {classes.length === 0 ? (
        <div style={{
          padding: '24px 16px', textAlign: 'center',
          color: 'var(--t3)', fontWeight: 700, fontSize: 12,
        }}>
          <i className="ti ti-chart-bar-off" style={{ fontSize: 28, display: 'block', marginBottom: 8, opacity: 0.4 }} />
          No sick reports for {monthLabel(selectedMonth)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', padding: '0 14px 14px', scrollbarWidth: 'thin' }}>
          <svg
            width={Math.max(totalWidth + 20, 280)}
            height={svgH}
            style={{ display: 'block', minWidth: '100%' }}
          >
            {/* Y-axis guide lines */}
            {[0.25, 0.5, 0.75, 1].map(frac => {
              const y = BAR_H - Math.round(frac * BAR_H);
              return (
                <g key={frac}>
                  <line x1={0} y1={y} x2={totalWidth + 20} y2={y}
                    stroke="var(--border)" strokeDasharray="3 3" strokeWidth={0.5} />
                  <text x={totalWidth + 22} y={y + 4}
                    fontSize={7} fill="var(--t3)" fontWeight={700}>
                    {Math.round(frac * maxVal)}
                  </text>
                </g>
              );
            })}

            {/* Bars per class */}
            {classes.map((cls, ci) => {
              const color = CLASS_COLORS[ci % CLASS_COLORS.length];
              const xBase = ci * (BAR_W * 2 + GAP + GROUP_GAP) + 4;
              const male   = currentData[cls]?.male   || 0;
              const female = currentData[cls]?.female || 0;
              const maleH   = Math.round((male   / maxVal) * BAR_H);
              const femaleH = Math.round((female / maxVal) * BAR_H);

              return (
                <g key={cls}>
                  {/* Male bar */}
                  <rect
                    x={xBase} y={BAR_H - maleH}
                    width={BAR_W} height={maleH || 1}
                    rx={3} fill={color.male}
                  />
                  {male > 0 && (
                    <text x={xBase + BAR_W / 2} y={BAR_H - maleH - 3}
                      textAnchor="middle" fontSize={8} fill={color.male} fontWeight={800}>
                      {male}
                    </text>
                  )}

                  {/* Female bar */}
                  <rect
                    x={xBase + BAR_W + GAP} y={BAR_H - femaleH}
                    width={BAR_W} height={femaleH || 1}
                    rx={3} fill={color.female}
                  />
                  {female > 0 && (
                    <text x={xBase + BAR_W + GAP + BAR_W / 2} y={BAR_H - femaleH - 3}
                      textAnchor="middle" fontSize={8} fill="#be185d" fontWeight={800}>
                      {female}
                    </text>
                  )}

                  {/* Class label */}
                  <text
                    x={xBase + BAR_W + GAP / 2}
                    y={BAR_H + 14}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={800}
                    fill="var(--t2)"
                  >
                    {cls.length > 8 ? cls.slice(0, 7) + '…' : cls}
                  </text>

                  {/* Total below class label */}
                  <text
                    x={xBase + BAR_W + GAP / 2}
                    y={BAR_H + 25}
                    textAnchor="middle"
                    fontSize={7}
                    fill="var(--t3)"
                    fontWeight={600}
                  >
                    {(currentData[cls]?.total || 0)} total
                  </text>
                </g>
              );
            })}

            {/* Baseline */}
            <line x1={0} y1={BAR_H} x2={totalWidth + 20} y2={BAR_H}
              stroke="var(--border)" strokeWidth={1} />
          </svg>

          {/* Legend */}
          <div style={{
            display: 'flex', gap: 10, flexWrap: 'wrap',
            marginTop: 8, paddingTop: 8,
            borderTop: '1px solid var(--border)',
          }}>
            {classes.map((cls, ci) => {
              const color = CLASS_COLORS[ci % CLASS_COLORS.length];
              return (
                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    borderRadius: 2, background: color.male, flexShrink: 0,
                  }} />
                  <span style={{
                    display: 'inline-block', width: 8, height: 8,
                    borderRadius: 2, background: color.female, flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t2)' }}>{cls}</span>
                </div>
              );
            })}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6' }}>■ Male</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#ec4899' }}>■ Female</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
