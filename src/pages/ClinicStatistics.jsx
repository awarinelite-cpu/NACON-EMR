// src/pages/ClinicStatistics.jsx
// Replaces the old Health Statistics page. One fetch per filter change.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchClinicStats, aggregate, rangeFor, fmtDuration } from '../lib/clinicStats';
import { HBar, GroupStack, StackedHBar, ColBar, Donut, Empty, PALETTE } from '../components/stats/Charts';

const FILTERS = [
  { key: 'today',    label: 'Today' },
  { key: 'week',     label: 'This week' },
  { key: 'month',    label: 'This month' },
  { key: 'semester', label: 'This semester' },
  { key: 'custom',   label: 'Custom' },
];

const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const fmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function Section({ icon, title, children }) {
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)', margin: '18px 2px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <i className={`ti ${icon}`} />{title}
      </div>
      {children}
    </>
  );
}

function Panel({ title, children }) {
  return (
    <div className="card cs-panel" style={{ marginBottom: 12 }}>
      <div className="card-header"><div className="card-title">{title}</div></div>
      <div className="card-body">{children}</div>
    </div>
  );
}

function Kpi({ icon, label, value, color }) {
  return (
    <div className="stat-card" style={{ minWidth: 0 }}>
      <div className="stat-label"><i className={`ti ${icon}`} style={{ color }} />{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function ClinicStatistics() {
  const [filter, setFilter] = useState('month');
  const [custom, setCustom] = useState({ from: iso(new Date()), to: iso(new Date()) });
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => rangeFor(filter, custom), [filter, custom]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    fetchClinicStats(range.from, range.to)
      .then(r => { if (alive) { setRaw(r); setLoading(false); } })
      .catch(e => { console.error(e); if (alive) { setError('Could not load statistics. Check your connection and try again.'); setLoading(false); } });
    return () => { alive = false; };
  }, [range]);

  const s = useMemo(() => (raw ? aggregate(raw) : null), [raw]);
  const o = s?.overview;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <style>{`
        .cs-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:6px}
        @media(min-width:700px){.cs-kpis{grid-template-columns:repeat(4,1fr)}}
        .cs-filters{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}
        .cs-filters .btn{white-space:nowrap;font-size:12px;padding:6px 11px;flex-shrink:0}
        @media print{
          .sidebar,.hamburger-btn,.sidebar-backdrop,.no-print,.app-footnote,.topbar{display:none!important}
          .main-area,.page-content,.app-shell{overflow:visible!important;height:auto!important;position:static!important}
          .page-content{padding:0!important}
          .cs-panel,.stat-card{break-inside:avoid;box-shadow:none!important}
          .page-content .card{margin:0 0 10px!important}
          html{zoom:100%!important}
        }
      `}</style>

      <div className="topbar">
        <div className="topbar-title">Clinic Statistics</div>
        <button className="btn no-print" onClick={() => window.print()} disabled={loading || !s}
          style={{ fontSize: 12, padding: '6px 11px' }}>
          <i className="ti ti-printer" /> Print / PDF
        </button>
      </div>

      <div className="page-content">
        <div className="cs-filters no-print">
          {FILTERS.map(f => (
            <button key={f.key} className={`btn ${filter === f.key ? 'btn-primary' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>

        {filter === 'custom' && (
          <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input type="date" className="form-input" style={{ flex: '1 1 130px' }} value={custom.from} max={custom.to}
              onChange={e => e.target.value && setCustom(c => ({ ...c, from: e.target.value }))} />
            <input type="date" className="form-input" style={{ flex: '1 1 130px' }} value={custom.to} min={custom.from}
              onChange={e => e.target.value && setCustom(c => ({ ...c, to: e.target.value }))} />
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--t3)', margin: '10px 2px 12px' }}>
          <i className="ti ti-calendar" /> {fmt(range.from)} – {fmt(range.to)}
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <i className="ti ti-loader-2" style={{ fontSize: 28, animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 8 }}>Loading statistics…</div>
          </div>
        )}

        {error && !loading && (
          <div className="card" style={{ padding: 16, color: 'var(--danger)', fontSize: 13 }}>{error}</div>
        )}

        {s && !loading && !error && (
          <>
            {/* 1. Overview */}
            <div className="cs-kpis">
              <Kpi icon="ti-users"        label="Registered"  value={o.patients}   color="var(--info)" />
              <Kpi icon="ti-stethoscope"  label="Visits"      value={o.visits}     color="var(--accent)" />
              <Kpi icon="ti-mood-sick"    label="Sick reports" value={o.sick}      color="var(--danger)" />
              <Kpi icon="ti-bed"          label="Admissions"  value={o.admissions} color="var(--warn)" />
              <Kpi icon="ti-logout"       label="Discharges"  value={o.discharges} color="var(--success)" />
              <Kpi icon="ti-file-export"  label="Referrals"   value={o.referrals}  color="var(--warn)" />
              <Kpi icon="ti-flask"        label="Labs done"   value={o.labsDone}   color="var(--info)" />
            </div>

            {/* 2. Who is falling sick */}
            <Section icon="ti-mood-sick" title="Who is falling sick">
              <Panel title="Sick reports per SET">
                <StackedHBar rows={s.who.setRows}
                  parts={[{ key: 'male', label: 'Male', color: 'var(--accent)' }, { key: 'female', label: 'Female', color: '#db2777' }, { key: 'other', label: 'Unknown', color: 'var(--t3)' }]} />
              </Panel>
              <Panel title="Male vs female"><Donut rows={s.who.sex} colors={['var(--accent)', '#db2777', 'var(--t3)']} /></Panel>
              <Panel title="Most sick reports — top 5 students per SET">
                <GroupStack groups={s.who.topStudents} />
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6 }}>Counts visits opened in the selected period.</div>
              </Panel>
              <Panel title="Age groups"><Donut rows={s.who.age} /></Panel>
              <Panel title="Sick reports — last 12 months">
                <ColBar rows={s.who.months} labelEvery={1} color="var(--danger)" />
                <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 6 }}>Counts patients by their latest sick report in each month.</div>
              </Panel>
            </Section>

            {/* 3. Illness and treatment */}
            <Section icon="ti-pill" title="Illness & treatment">
              <Panel title="Top complaints / diagnoses"><HBar rows={s.illness.top} /></Panel>
              <Panel title="Most prescribed drugs"><HBar rows={s.illness.drugs} color="var(--success)" /></Panel>
              <Panel title="How visits ended"><Donut rows={s.illness.outcome} /></Panel>
            </Section>

            {/* 5. Laboratory */}
            <Section icon="ti-flask" title="Laboratory">
              <Panel title="Most requested tests"><HBar rows={s.lab.tests} color="var(--info)" /></Panel>
              <Panel title="Request status"><Donut rows={s.lab.status} colors={['var(--warn)', 'var(--accent)', 'var(--success)']} /></Panel>
              <Panel title="Normal vs abnormal results"><Donut rows={s.lab.nv} colors={['var(--success)', 'var(--danger)']} /></Panel>
              <Panel title="Most common abnormal findings"><HBar rows={s.lab.abnormal} color="var(--danger)" /></Panel>
              <Panel title="Average time, request → result">
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t1)' }}>{fmtDuration(s.lab.turnaround)}</div>
              </Panel>
            </Section>

            {/* 6. Referrals */}
            <Section icon="ti-file-export" title="Referrals">
              <Panel title="By destination"><HBar rows={s.referrals.dest} color="var(--warn)" /></Panel>
              <Panel title="By reason"><HBar rows={s.referrals.reason} color="var(--warn)" /></Panel>
            </Section>

            {/* 4. Workload */}
            <Section icon="ti-activity" title="Clinic workload">
              <Panel title="Visits by day of week"><ColBar rows={s.workload.byDow} /></Panel>
              <Panel title="Visits by hour of day"><ColBar rows={s.workload.byHour} labelEvery={3} height={90} /></Panel>
              <Panel title="Triage priority"><Donut rows={s.workload.prio} colors={['var(--danger)', 'var(--warn)', 'var(--success)']} /></Panel>
              <Panel title="Sick bay">
                <div style={{ display: 'flex', gap: 24 }}>
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{fmtDuration(s.workload.avgStay)}</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>Average stay</div></div>
                  <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t1)' }}>{s.workload.readmissions}</div><div style={{ fontSize: 11, color: 'var(--t3)' }}>Readmitted patients</div></div>
                </div>
              </Panel>
              <Panel title="Sick reports by method"><Donut rows={s.workload.method} /></Panel>
            </Section>

            {/* 7. Pharmacy and nursing */}
            <Section icon="ti-building-store" title="Pharmacy & nursing">
              <Panel title="Most dispensed drugs"><HBar rows={s.pharmacy.dispensed} color="var(--success)" /></Panel>
              <Panel title="Low stock (at or below reorder level)">
                {s.pharmacy.lowStock.length ? <HBar rows={s.pharmacy.lowStock} color="var(--danger)" showZero /> : <Empty text="No low-stock items" />}
              </Panel>
              <Panel title="Nursing notes by shift"><ColBar rows={s.pharmacy.shifts} height={80} /></Panel>
            </Section>

            <div style={{ fontSize: 10.5, color: 'var(--t3)', textAlign: 'center', margin: '8px 0 20px' }}>
              Generated {new Date().toLocaleString('en-GB')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
