// src/components/patients/NewsScore.jsx
// NEWS2 (National Early Warning Score 2) — UK RCP standard
// Calculates from a single vitals object and renders a colour-coded badge + breakdown
import React, { useState } from 'react';

// NEWS2 scoring tables
function scoreRR(rr) {
  const v = parseFloat(rr);
  if (isNaN(v)) return 0;
  if (v <= 8)  return 3;
  if (v <= 11) return 1;
  if (v <= 20) return 0;
  if (v <= 24) return 2;
  return 3;
}
function scoreSpO2(spo2, onO2 = false) {
  const v = parseFloat(spo2);
  if (isNaN(v)) return 0;
  if (!onO2) {
    if (v >= 96) return 0;
    if (v >= 94) return 1;
    if (v >= 92) return 2;
    return 3;
  } else {
    // Scale 2 (COPD target 88–92%)
    if (v >= 97) return 3;
    if (v >= 95) return 2;
    if (v >= 93) return 1;
    if (v >= 88) return 0;
    if (v >= 86) return 1;
    if (v >= 84) return 2;
    return 3;
  }
}
function scoreO2(onO2) { return onO2 ? 2 : 0; }
function scoreSBP(sbp) {
  const v = parseFloat(sbp);
  if (isNaN(v)) return 0;
  if (v <= 90)  return 3;
  if (v <= 100) return 2;
  if (v <= 110) return 1;
  if (v <= 219) return 0;
  return 3;
}
function scoreHR(hr) {
  const v = parseFloat(hr);
  if (isNaN(v)) return 0;
  if (v <= 40)  return 3;
  if (v <= 50)  return 1;
  if (v <= 90)  return 0;
  if (v <= 110) return 1;
  if (v <= 130) return 2;
  return 3;
}
function scoreTemp(temp) {
  const v = parseFloat(temp);
  if (isNaN(v)) return 0;
  if (v <= 35.0) return 3;
  if (v <= 36.0) return 1;
  if (v <= 38.0) return 0;
  if (v <= 39.0) return 1;
  return 2;
}
function scoreConsciousness(avpu) {
  // A=0, V/C/U=3
  if (!avpu || avpu === 'A') return 0;
  return 3;
}

export function calculateNEWS2(vitals, onO2 = false, avpu = 'A') {
  const components = [
    { name: 'Resp. Rate',    score: scoreRR(vitals.rr),             val: vitals.rr,   unit: '/min' },
    { name: 'SpO₂',          score: scoreSpO2(vitals.spo2, onO2),   val: vitals.spo2, unit: '%'    },
    { name: 'Supplemental O₂', score: scoreO2(onO2),                val: onO2 ? 'Yes' : 'No', unit: '' },
    { name: 'Systolic BP',   score: scoreSBP(vitals.sbp),           val: vitals.sbp,  unit: 'mmHg' },
    { name: 'Heart Rate',    score: scoreHR(vitals.hr),             val: vitals.hr,   unit: 'bpm'  },
    { name: 'Temperature',   score: scoreTemp(vitals.temp),         val: vitals.temp, unit: '°C'   },
    { name: 'Consciousness', score: scoreConsciousness(avpu),       val: avpu || 'A', unit: ''     },
  ];
  const total = components.reduce((s, c) => s + c.score, 0);

  let risk, color, bg, border, action;
  if (total === 0) {
    risk = 'Low'; color = '#16a34a'; bg = '#f0fdf4'; border = '#86efac';
    action = 'Minimum 12-hourly monitoring';
  } else if (total <= 4) {
    risk = 'Low'; color = '#16a34a'; bg = '#f0fdf4'; border = '#86efac';
    action = 'Minimum 4–6 hourly monitoring';
  } else if (total <= 6) {
    risk = 'Medium'; color = '#d97706'; bg = '#fffbeb'; border = '#fde68a';
    action = 'Urgent nurse review + doctor notification';
  } else if (components.some(c => c.score === 3)) {
    // Any single parameter = 3 triggers medium-high
    risk = total <= 6 ? 'Medium' : 'High';
    color = total <= 6 ? '#d97706' : '#dc2626';
    bg = total <= 6 ? '#fffbeb' : '#fef2f2';
    border = total <= 6 ? '#fde68a' : '#fca5a5';
    action = total <= 6 ? 'Urgent clinical review' : 'Emergency response — call doctor STAT';
  } else {
    risk = 'High'; color = '#dc2626'; bg = '#fef2f2'; border = '#fca5a5';
    action = 'Emergency response — call doctor STAT';
  }

  return { total, risk, color, bg, border, action, components };
}

const ScorePip = ({ score }) => {
  const colors = { 0: '#10b981', 1: '#f59e0b', 2: '#f97316', 3: '#ef4444' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 20, height: 20, borderRadius: '50%',
      background: colors[score] || '#94a3b8',
      color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0,
    }}>{score}</span>
  );
};

export default function NewsScore({ vitals, compact = false }) {
  const [open, setOpen] = useState(false);
  const [onO2, setOnO2] = useState(false);
  const [avpu, setAvpu] = useState('A');

  if (!vitals) return null;

  const news = calculateNEWS2(vitals, onO2, avpu);

  if (compact) {
    return (
      <div
        onClick={() => setOpen(true)}
        title={`NEWS2 Score: ${news.total} — ${news.risk} Risk. Click for details.`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
          background: news.bg, border: `1.5px solid ${news.border}`,
          transition: 'opacity .15s',
        }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: news.color }}>NEWS2</span>
        <span style={{
          fontSize: 15, fontWeight: 900, color: news.color, lineHeight: 1,
        }}>{news.total}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: news.color }}>{news.risk}</span>
        {open && <NewsScoreModal news={news} onO2={onO2} setOnO2={setOnO2} avpu={avpu} setAvpu={setAvpu} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="card" style={{ border: `1.5px solid ${news.border}`, marginBottom: 14 }}>
      <div className="card-header" style={{ background: news.bg, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div className="card-title" style={{ color: news.color }}>
          <i className="ti ti-activity-heartbeat" />
          NEWS2 Early Warning Score
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 26, fontWeight: 900, color: news.color, lineHeight: 1,
          }}>{news.total}</div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: news.color }}>{news.risk} Risk</div>
            <div style={{ fontSize: 10, color: news.color, opacity: 0.8 }}>{news.action}</div>
          </div>
          <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ color: news.color }} />
        </div>
      </div>

      {open && (
        <div className="card-body" style={{ paddingTop: 12 }}>
          {/* Modifiers */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <input type="checkbox" checked={onO2} onChange={e => setOnO2(e.target.checked)} />
              On supplemental O₂
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)' }}>Consciousness:</span>
              {['A','V','C','U'].map(v => (
                <button key={v} onClick={() => setAvpu(v)}
                  style={{
                    padding: '2px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: `1px solid ${avpu === v ? news.color : 'var(--border)'}`,
                    background: avpu === v ? news.color : 'transparent',
                    color: avpu === v ? '#fff' : 'var(--t2)',
                  }}>{v}</button>
              ))}
            </div>
          </div>

          {/* Component breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {news.components.map(c => (
              <div key={c.name} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', borderRadius: 6,
                background: c.score > 0 ? news.bg : 'transparent',
              }}>
                <ScorePip score={c.score} />
                <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: 'var(--t1)' }}>{c.name}</span>
                <span style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>
                  {c.val !== undefined && c.val !== null && c.val !== '' ? `${c.val} ${c.unit}` : '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Total bar */}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t3)' }}>Total NEWS2 score</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: news.color }}>{news.total} / 21</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(100, (news.total / 21) * 100)}%`,
                background: news.color, borderRadius: 4,
                transition: 'width .4s ease',
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              {[
                { range: '0', label: 'Minimum', c: '#16a34a' },
                { range: '1–4', label: 'Low', c: '#16a34a' },
                { range: '5–6', label: 'Medium', c: '#d97706' },
                { range: '7+', label: 'High', c: '#dc2626' },
              ].map(s => (
                <div key={s.range} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: s.c }}>{s.range}</div>
                  <div style={{ fontSize: 9, color: 'var(--t3)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            marginTop: 10, padding: '8px 10px', borderRadius: 8,
            background: news.bg, border: `1px solid ${news.border}`,
            fontSize: 11, fontWeight: 700, color: news.color,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <i className="ti ti-bell" />
            {news.action}
          </div>
        </div>
      )}
    </div>
  );
}
