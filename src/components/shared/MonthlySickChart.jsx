// src/components/shared/MonthlySickChart.jsx
import React, { useEffect, useState, useRef } from 'react';
import { listenSickReportsMonthly } from '../../lib/emr';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const CLASS_COLORS = [
  { male: '#3b82f6', female: '#93c5fd' },
  { male: '#10b981', female: '#6ee7b7' },
  { male: '#f97316', female: '#fdba74' },
  { male: '#8b5cf6', female: '#c4b5fd' },
  { male: '#ef4444', female: '#fca5a5' },
  { male: '#14b8a6', female: '#5eead4' },
  { male: '#f59e0b', female: '#fcd34d' },
  { male: '#ec4899', female: '#f9a8d4' },
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

function getLast12Months() {
  return Array.from({ length: 12 }, (_, i) => getMonthKey(i - 11));
}

// ── SVG Pie Chart helper ──────────────────────────────────
function polarToXY(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeSlice(cx, cy, r, startAngle, endAngle) {
  if (endAngle - startAngle >= 360) endAngle = startAngle + 359.99;
  const s = polarToXY(cx, cy, r, startAngle);
  const e = polarToXY(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function PieChart({ slices, cx, cy, r }) {
  // slices: [{ label, value, color }]
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return null;

  let angle = 0;
  return (
    <g>
      {slices.map((sl, i) => {
        const sweep = (sl.value / total) * 360;
        const start = angle;
        const end   = angle + sweep;
        angle = end;

        // label position (midpoint of arc)
        const mid = start + sweep / 2;
        const lp  = polarToXY(cx, cy, r * 0.65, mid);
        const pct = Math.round((sl.value / total) * 100);

        return (
          <g key={i}>
            <path
              d={describeSlice(cx, cy, r, start, end)}
              fill={sl.color}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {pct >= 6 && (
              <text
                x={lp.x} y={lp.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={8} fontWeight={800} fill="#fff"
                style={{ pointerEvents: 'none' }}
              >
                {pct}%
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default function MonthlySickChart() {
  const [monthlyData, setMonthlyData]   = useState({});
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey(0));
  const [allClasses, setAllClasses]     = useState([]);
  const [pieMode, setPieMode]           = useState('class'); // 'class' | 'sex'
  const scrollRef = useRef(null);

  useEffect(() => {
    const unsub = listenSickReportsMonthly(data => {
      setMonthlyData(data);
      const classes = new Set();
      Object.values(data).forEach(mo => Object.keys(mo).forEach(cls => classes.add(cls)));
      setAllClasses([...classes].sort());
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const active = scrollRef.current.querySelector('[data-active="true"]');
      if (active) active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, [selectedMonth]);

  const months      = getLast12Months();
  const currentData = monthlyData[selectedMonth] || {};
  const classes     = allClasses.length > 0 ? allClasses : Object.keys(currentData).sort();

  const maxVal = Math.max(1, ...classes.flatMap(cls => [
    currentData[cls]?.male   || 0,
    currentData[cls]?.female || 0,
  ]));

  const BAR_H = 120; const BAR_W = 18; const GAP = 6; const GROUP_GAP = 20;
  const totalWidth = classes.length * (BAR_W * 2 + GAP + GROUP_GAP);
  const svgH = BAR_H + 44;

  const totalSick   = Object.values(currentData).reduce((s, v) => s + (v.total  || 0), 0);
  const totalMale   = Object.values(currentData).reduce((s, v) => s + (v.male   || 0), 0);
  const totalFemale = Object.values(currentData).reduce((s, v) => s + (v.female || 0), 0);

  // ── Pie slices ──
  const pieSlicesByClass = classes.map((cls, ci) => ({
    label: cls,
    value: currentData[cls]?.total || 0,
    color: CLASS_COLORS[ci % CLASS_COLORS.length].male,
  })).filter(s => s.value > 0);

  const pieSlicesBySex = [
    { label: 'Male',   value: totalMale,   color: '#3b82f6' },
    { label: 'Female', value: totalFemale, color: '#ec4899' },
  ].filter(s => s.value > 0);

  const activePieSlices = pieMode === 'class' ? pieSlicesByClass : pieSlicesBySex;

  const PIE_R  = 70;
  const PIE_CX = 90;
  const PIE_CY = 80;
  const PIE_SVG_W = 190;
  const PIE_SVG_H = 165;

  return (
    <div className="card" style={{ marginBottom: 0 }}>

      {/* ── Header ── */}
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 6 }}>
        <div className="card-title">
          <i className="ti ti-chart-bar" style={{ color: '#3b82f6' }} />
          Monthly Sick Report
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 8 }}>♂ {totalMale}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#ec4899', background: '#fdf2f8', padding: '2px 8px', borderRadius: 8 }}>♀ {totalFemale}</span>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t2)', background: 'var(--card-bg2)', padding: '2px 8px', borderRadius: 8 }}>Total: {totalSick}</span>
        </div>
      </div>

      {/* ── Month toggle tabs ── */}
      <div ref={scrollRef} style={{ display:'flex', gap:6, overflowX:'auto', padding:'0 12px 10px', scrollbarWidth:'none' }}>
        {months.map(mk => {
          const active   = mk === selectedMonth;
          const hasData  = !!monthlyData[mk] && Object.keys(monthlyData[mk]).length > 0;
          const [y, m]   = mk.split('-');
          return (
            <button key={mk} data-active={active} onClick={() => setSelectedMonth(mk)} style={{
              flexShrink:0, padding:'4px 10px', fontSize:10, fontWeight:800,
              borderRadius:16, border:'none', cursor:'pointer', whiteSpace:'nowrap',
              background: active ? '#3b82f6' : hasData ? '#eff6ff' : 'var(--card-bg2)',
              color:      active ? '#fff'    : hasData ? '#3b82f6' : 'var(--t3)',
              transition:'all 0.15s', position:'relative',
            }}>
              {MONTH_NAMES[parseInt(m, 10) - 1]}
              <span style={{ fontSize:8, display:'block', opacity:0.75, lineHeight:1 }}>{y}</span>
              {hasData && !active && (
                <span style={{ position:'absolute', top:2, right:4, width:5, height:5, borderRadius:'50%', background:'#3b82f6' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Month label ── */}
      <div style={{ padding:'0 14px 8px', fontSize:11, fontWeight:700, color:'var(--t2)', letterSpacing:'0.5px' }}>
        {monthLabel(selectedMonth)}
      </div>

      {/* ── Bar Chart ── */}
      {classes.length === 0 ? (
        <div style={{ padding:'24px 16px', textAlign:'center', color:'var(--t3)', fontWeight:700, fontSize:12 }}>
          <i className="ti ti-chart-bar-off" style={{ fontSize:28, display:'block', marginBottom:8, opacity:0.4 }} />
          No sick reports for {monthLabel(selectedMonth)}
        </div>
      ) : (
        <>
          <div style={{ overflowX:'auto', padding:'0 14px 14px', scrollbarWidth:'thin' }}>
            <svg width={Math.max(totalWidth + 20, 280)} height={svgH} style={{ display:'block', minWidth:'100%' }}>
              {[0.25, 0.5, 0.75, 1].map(frac => {
                const y = BAR_H - Math.round(frac * BAR_H);
                return (
                  <g key={frac}>
                    <line x1={0} y1={y} x2={totalWidth + 20} y2={y} stroke="var(--border)" strokeDasharray="3 3" strokeWidth={0.5} />
                    <text x={totalWidth + 22} y={y + 4} fontSize={7} fill="var(--t3)" fontWeight={700}>{Math.round(frac * maxVal)}</text>
                  </g>
                );
              })}
              {classes.map((cls, ci) => {
                const color  = CLASS_COLORS[ci % CLASS_COLORS.length];
                const xBase  = ci * (BAR_W * 2 + GAP + GROUP_GAP) + 4;
                const male   = currentData[cls]?.male   || 0;
                const female = currentData[cls]?.female || 0;
                const maleH  = Math.round((male   / maxVal) * BAR_H);
                const femaleH= Math.round((female / maxVal) * BAR_H);
                return (
                  <g key={cls}>
                    <rect x={xBase} y={BAR_H - maleH} width={BAR_W} height={maleH || 1} rx={3} fill={color.male} />
                    {male > 0 && <text x={xBase + BAR_W/2} y={BAR_H - maleH - 3} textAnchor="middle" fontSize={8} fill={color.male} fontWeight={800}>{male}</text>}
                    <rect x={xBase + BAR_W + GAP} y={BAR_H - femaleH} width={BAR_W} height={femaleH || 1} rx={3} fill={color.female} />
                    {female > 0 && <text x={xBase + BAR_W + GAP + BAR_W/2} y={BAR_H - femaleH - 3} textAnchor="middle" fontSize={8} fill="#be185d" fontWeight={800}>{female}</text>}
                    <text x={xBase + BAR_W + GAP/2} y={BAR_H + 14} textAnchor="middle" fontSize={8} fontWeight={800} fill="var(--t2)">{cls.length > 8 ? cls.slice(0,7)+'…' : cls}</text>
                    <text x={xBase + BAR_W + GAP/2} y={BAR_H + 25} textAnchor="middle" fontSize={7} fill="var(--t3)" fontWeight={600}>{currentData[cls]?.total || 0} total</text>
                  </g>
                );
              })}
              <line x1={0} y1={BAR_H} x2={totalWidth + 20} y2={BAR_H} stroke="var(--border)" strokeWidth={1} />
            </svg>

            {/* Bar chart legend */}
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginTop:8, paddingTop:8, borderTop:'1px solid var(--border)' }}>
              {classes.map((cls, ci) => {
                const color = CLASS_COLORS[ci % CLASS_COLORS.length];
                return (
                  <div key={cls} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:color.male,   flexShrink:0 }} />
                    <span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:color.female, flexShrink:0 }} />
                    <span style={{ fontSize:9, fontWeight:700, color:'var(--t2)' }}>{cls}</span>
                  </div>
                );
              })}
              <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
                <span style={{ fontSize:9, fontWeight:700, color:'#3b82f6' }}>■ Male</span>
                <span style={{ fontSize:9, fontWeight:700, color:'#ec4899' }}>■ Female</span>
              </div>
            </div>
          </div>

          {/* ── Divider ── */}
          <div style={{ margin:'0 14px', borderTop:'1px solid var(--border)' }} />

          {/* ── Pie Chart section ── */}
          <div style={{ padding:'12px 14px 14px' }}>

            {/* Pie header + toggle */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:800, color:'var(--t1)', display:'flex', alignItems:'center', gap:6 }}>
                <i className="ti ti-chart-pie" style={{ color:'#8b5cf6', fontSize:14 }} />
                Distribution — {monthLabel(selectedMonth)}
              </div>
              <div style={{ display:'flex', gap:4 }}>
                {['class','sex'].map(mode => (
                  <button key={mode} onClick={() => setPieMode(mode)} style={{
                    padding:'3px 10px', fontSize:9, fontWeight:800, borderRadius:12,
                    border:'none', cursor:'pointer',
                    background: pieMode === mode ? '#8b5cf6' : 'var(--card-bg2)',
                    color:      pieMode === mode ? '#fff'    : 'var(--t3)',
                    transition:'all 0.15s',
                  }}>
                    {mode === 'class' ? 'By Class' : 'By Sex'}
                  </button>
                ))}
              </div>
            </div>

            {/* Pie + legend side by side */}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>

              {/* SVG Pie */}
              <svg width={PIE_SVG_W} height={PIE_SVG_H} style={{ flexShrink:0 }}>
                <PieChart slices={activePieSlices} cx={PIE_CX} cy={PIE_CY} r={PIE_R} />
                {/* Centre label */}
                <text x={PIE_CX} y={PIE_CY - 6} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--t1)">{totalSick}</text>
                <text x={PIE_CX} y={PIE_CY + 10} textAnchor="middle" fontSize={8}  fontWeight={700} fill="var(--t3)">Total Sick</text>
              </svg>

              {/* Legend */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6, minWidth:100 }}>
                {activePieSlices.map((sl, i) => {
                  const pct = totalSick > 0 ? Math.round((sl.value / totalSick) * 100) : 0;
                  return (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:10, height:10, borderRadius:3, background:sl.color, flexShrink:0, display:'inline-block' }} />
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:9, fontWeight:800, color:'var(--t2)', lineHeight:1.3 }}>{sl.label}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                          {/* Mini progress bar */}
                          <div style={{ flex:1, height:4, background:'var(--card-bg2)', borderRadius:4, overflow:'hidden' }}>
                            <div style={{ width:`${pct}%`, height:'100%', background:sl.color, borderRadius:4, transition:'width 0.4s' }} />
                          </div>
                          <span style={{ fontSize:8, fontWeight:800, color:'var(--t3)', whiteSpace:'nowrap' }}>{sl.value} · {pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
