// src/components/stats/Charts.jsx
// Tiny hand-written SVG/CSS charts. Colours come from the theme variables so
// they work in light and dark mode; layouts are fluid (fit a ~412px phone).
import React from 'react';

export const PALETTE = [
  'var(--accent)', 'var(--success)', 'var(--warn)', 'var(--danger)',
  '#8b5cf6', '#0d9488', '#db2777', '#64748b',
];

const sum = (rows) => rows.reduce((s, r) => s + (r.value || 0), 0);

export function Empty({ text = 'No data for this period' }) {
  return (
    <div style={{ padding: '22px 8px', textAlign: 'center', color: 'var(--t3)', fontSize: 12.5 }}>
      <i className="ti ti-chart-bar-off" style={{ fontSize: 22, display: 'block', marginBottom: 6, opacity: .6 }} />
      {text}
    </div>
  );
}

/** Horizontal bars: label above the bar, value at the right. Best for long text labels. */
export function HBar({ rows, color = 'var(--accent)', showZero = false }) {
  const data = (rows || []).filter(r => showZero || r.value > 0);
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(r => r.value), 1);
  return (
    <div>
      {data.map((r, i) => (
        <div key={r.label + i} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--t2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <strong style={{ color: 'var(--t1)' }}>{r.value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--border)' }}>
            <div style={{
              width: `${Math.max((r.value / max) * 100, 2)}%`, height: '100%', borderRadius: 4,
              background: r.muted ? 'var(--t3)' : color,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Horizontal stacked bars (e.g. male / female per SET). */
export function StackedHBar({ rows, parts }) {
  const data = (rows || []).filter(r => r.total > 0);
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(r => r.total), 1);
  return (
    <div>
      <Legend items={parts.map(p => ({ label: p.label, color: p.color }))} />
      {data.map(r => (
        <div key={r.label} style={{ marginBottom: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: 'var(--t2)' }}>{r.label}</span>
            <span style={{ color: 'var(--t3)' }}>
              {parts.map(p => r[p.key] > 0 ? `${p.label[0]} ${r[p.key]}` : null).filter(Boolean).join(' · ')}
              {' · '}<strong style={{ color: 'var(--t1)' }}>{r.total}</strong>
            </span>
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--border)', width: `${Math.max((r.total / max) * 100, 4)}%` }}>
            {parts.map(p => r[p.key] > 0 && (
              <div key={p.key} style={{ width: `${(r[p.key] / r.total) * 100}%`, background: p.color }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical columns with a label under each (months, weekdays, hours). */
export function ColBar({ rows, color = 'var(--accent)', labelEvery = 1, height = 120 }) {
  const data = rows || [];
  if (!data.length || sum(data) === 0) return <Empty />;
  const max = Math.max(...data.map(r => r.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 14 ? 2 : 4, height: height + 34 }}>
      {data.map((r, i) => (
        <div key={r.label + i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
          <div style={{ fontSize: 9.5, color: 'var(--t2)', fontWeight: 700, height: 14, lineHeight: '14px' }}>{r.value > 0 ? r.value : ''}</div>
          <div style={{
            width: '100%', maxWidth: 28, borderRadius: '3px 3px 0 0',
            height: r.value > 0 ? Math.max((r.value / max) * height, 3) : 1,
            background: r.value > 0 ? color : 'var(--border)',
          }} />
          <div style={{ fontSize: 9.5, color: 'var(--t3)', height: 16, lineHeight: '16px', whiteSpace: 'nowrap' }}>
            {i % labelEvery === 0 ? r.label : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8 }}>
      {items.map(it => (
        <span key={it.label} style={{ fontSize: 11, color: 'var(--t2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: it.color, display: 'inline-block' }} />{it.label}
        </span>
      ))}
    </div>
  );
}

/** Donut with a legend underneath (percentages included). */
export function Donut({ rows, colors = PALETTE, size = 150 }) {
  const data = (rows || []).filter(r => r.value > 0);
  const total = sum(data);
  if (!total) return <Empty />;
  const R = 50, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Donut chart" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 60 60)">
          {data.map((r, i) => {
            const len = (r.value / total) * C;
            const el = (
              <circle key={r.label} cx="60" cy="60" r={R} fill="none" strokeWidth="18"
                stroke={colors[i % colors.length]}
                strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="60" y="58" textAnchor="middle" style={{ fontSize: 20, fontWeight: 800, fill: 'var(--t1)' }}>{total}</text>
        <text x="60" y="73" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--t3)' }}>total</text>
      </svg>
      <div style={{ flex: '1 1 120px', minWidth: 0 }}>
        {data.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, marginBottom: 5 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length], flexShrink: 0 }} />
            <span style={{ color: 'var(--t2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
            <strong style={{ color: 'var(--t1)' }}>{r.value}</strong>
            <span style={{ color: 'var(--t3)', width: 34, textAlign: 'right' }}>{Math.round((r.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One stacked bar per group; each segment is a different colour = a different student. */
export function GroupStack({ groups }) {
  const data = (groups || []).filter(g => g.rows.length);
  if (!data.length) return <Empty />;
  const totals = data.map(g => g.rows.reduce((a, r) => a + r.value, 0));
  const max = Math.max(...totals, 1);
  return (
    <div>
      {data.map((g, gi) => (
        <div key={g.set} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <strong style={{ color: 'var(--t2)' }}>{g.set}</strong>
            <strong style={{ color: 'var(--t1)' }}>{totals[gi]}</strong>
          </div>
          <div style={{ display: 'flex', height: 18, borderRadius: 5, overflow: 'hidden', background: 'var(--border)', width: `${Math.max((totals[gi] / max) * 100, 6)}%` }}>
            {g.rows.map((r, i) => (
              <div key={r.label + i} title={`${r.label}: ${r.value}`}
                style={{ width: `${(r.value / totals[gi]) * 100}%`, background: PALETTE[i % PALETTE.length], color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {r.value}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 5 }}>
            {g.rows.map((r, i) => (
              <div key={r.label + i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, marginTop: 2 }}>
                <i style={{ width: 9, height: 9, borderRadius: 2, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                <strong style={{ color: 'var(--t1)', minWidth: 20, textAlign: 'right' }}>{r.value}×</strong>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
