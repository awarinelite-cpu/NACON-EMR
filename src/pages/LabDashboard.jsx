// src/pages/LabDashboard.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  listenLabRequests, enterLabResults,
  updateLabRequestStatus, formatTs, LAB_TESTS,
  uploadLabResultFile, listenLabCatalogue, saveLabCatalogueOverrides,
} from '../lib/emr';
import {
  analytesFor, rangeText, autoFlag, flagLetter, isAbnormalFlag,
} from '../lib/labCatalogue';
import LabReportTable from '../components/shared/LabReportTable';
import LabRangesEditor from '../components/lab/LabRangesEditor';
import toast from 'react-hot-toast';

const URGENCY_STYLE = {
  stat:    { bg:'#fee2e2', color:'#b91c1c', label:'STAT' },
  urgent:  { bg:'#ffedd5', color:'#c2410c', label:'URGENT' },
  routine: { bg:'var(--accent-bg)', color:'var(--accent)', label:'Routine' },
};

const FLAG_STYLE = {
  high:   { color:'#dc2626', label:'H' },
  low:    { color:'#d97706', label:'L' },
  normal: { color:'var(--success)', label:'N' },
  '':     { color:'var(--t3)', label:'—' },
};

export default function LabDashboard() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const fileInputRef = useRef(null);
  const [requests,       setRequests]       = useState([]);
  const [tab,            setTab]            = useState('pending');
  const [selected,       setSelected]       = useState(null);
  const [rows,           setRows]           = useState([]);   // one entry per analyte (HGB, WBC…)
  const [catalogue,      setCatalogue]      = useState({});   // lab's saved unit/range overrides
  const [editRanges,     setEditRanges]     = useState({});   // test name → show unit/range boxes
  const [showRanges,     setShowRanges]     = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [search,         setSearch]         = useState('');
  const [customTests,    setCustomTests]    = useState([]);   // extra "Others" rows
  const [attachedFile,   setAttachedFile]   = useState(null); // File object
  const [comments,       setComments]       = useState('');   // lab remarks shown under the result table
  const [uploading,      setUploading]      = useState(false);

  useEffect(() => {
    const unsub = listenLabRequests(setRequests);
    return unsub;
  }, []);

  useEffect(() => listenLabCatalogue(setCatalogue), []);

  const pending    = requests.filter(r => r.status === 'pending');
  const processing = requests.filter(r => r.status === 'processing');
  const completed  = requests.filter(r => r.status === 'completed');

  const displayed = (tab === 'pending' ? pending : tab === 'processing' ? processing : completed)
    .filter(r => !search ||
      r.patientName?.toLowerCase().includes(search.toLowerCase()) ||
      r.emrNumber?.toLowerCase().includes(search.toLowerCase())
    );

  const openRequest = async (req) => {
    setSelected(req);
    setCustomTests([]);
    setAttachedFile(null);
    setComments(req.comments || '');
    // One row per analyte of every ordered test, with unit + normal range for this
    // patient's sex already filled in (from the catalogue / the lab's saved ranges).
    const used = new Set();
    const init = [];
    (req.tests || []).forEach(t => {
      const abbr = LAB_TESTS.find(x => x.name === t)?.abbr || t;
      analytesFor(t, catalogue).forEach(a => {
        let key = a.name;
        if (used.has(key)) key = `${a.name} (${abbr})`;
        used.add(key);
        const prev = req.results?.[key];
        init.push({
          key, test: t, analyte: a,
          value:    prev?.value ?? '',
          unit:     prev?.unit ?? a.unit ?? '',
          rangeStr: prev?.referenceRange ?? rangeText(a, req.sex),
          flag:     prev?.flag ?? '',
        });
      });
    });
    setRows(init);
    setEditRanges({});
    // Mark as processing if still pending
    if (req.status === 'pending') {
      await updateLabRequestStatus(req.id, 'processing', profile.displayName || 'Lab', profile.role);
    }
  };

  // Change a field of one row. Unless the lab sets the flag by hand, H / L is worked
  // out again from the value and the range shown on screen.
  const setRow = (key, patch) => setRows(prev => prev.map(r => {
    if (r.key !== key) return r;
    const n = { ...r, ...patch };
    if (!('flag' in patch)) n.flag = autoFlag(n.analyte, n.value, n.rangeStr);
    return n;
  }));

  // Tap the flag chip to override it by hand: normal → high → low → normal
  const cycleFlag = (row) => {
    const order = row.analyte.kind === 'select' ? ['normal', 'abnormal'] : ['normal', 'high', 'low'];
    const next = order[(order.indexOf(row.flag) + 1) % order.length];
    setRow(row.key, { flag: next });
  };

  // The saved result object: only rows that have a value, plus the "Others" rows
  const buildResults = () => {
    const out = {};
    rows.forEach(r => {
      if (!String(r.value ?? '').trim()) return;
      out[r.key] = {
        value: String(r.value).trim(), unit: r.unit || '',
        flag: r.flag || (r.analyte.kind === 'text' ? '' : 'normal'),
        referenceRange: r.rangeStr || '',
      };
    });
    customTests.forEach(r => {
      if (r.testName?.trim() && r.value?.trim()) {
        out[r.testName.trim()] = {
          value: r.value, unit: r.unit, flag: r.flag, referenceRange: r.referenceRange,
        };
      }
    });
    return out;
  };

  // Custom "Others" test row helpers
  const addCustomTest = () =>
    setCustomTests(prev => [...prev, { id: Date.now(), testName:'', value:'', unit:'', flag:'normal', referenceRange:'' }]);
  const setCustomField = (id, field, val) =>
    setCustomTests(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  const removeCustomTest = (id) =>
    setCustomTests(prev => prev.filter(r => r.id !== id));

  const handleSubmit = async () => {
    const mergedResults = buildResults();
    if (Object.keys(mergedResults).length === 0 && !attachedFile) {
      toast.error('Enter at least one result value, custom test, or attach a file'); return;
    }

    setSaving(true);
    try {
      await enterLabResults(selected.id, mergedResults, profile.displayName || profile.email || 'Lab', profile.role, comments.trim());

      // Upload attached file if any
      if (attachedFile) {
        setUploading(true);
        await uploadLabResultFile(
          selected.emrNumber, selected.id, attachedFile,
          profile.displayName || profile.email || 'Lab',
          profile.role
        );
        setUploading(false);
      }

      toast.success('Results saved successfully');
      setSelected(null);
      setCustomTests([]);
      setAttachedFile(null);
      setComments('');
    } catch(e) {
      toast.error('Failed to save results: ' + e.message);
    }
    setSaving(false);
  };

  const tabStyle = (id) => ({
    flex:1, padding:'9px 0', fontSize:12, fontWeight:700,
    border:'none', borderRadius:8, cursor:'pointer',
    background: tab===id ? 'var(--accent)' : 'transparent',
    color:      tab===id ? '#fff'          : 'var(--t2)',
  });

  // ── Result Entry Modal ──────────────────────
  if (selected) {
    const u = URGENCY_STYLE[selected.urgency] || URGENCY_STYLE.routine;
    return (
      <div className="lab-detail" style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', background:'var(--main-bg)' }}>
        <div className="topbar lab-topbar-detail">
          <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{padding:'6px 10px', flexShrink:0}}>
            <i className="ti ti-arrow-left" />
          </button>
          <div className="topbar-title">
            <i className="ti ti-flask" style={{color:'#0891b2', marginRight:6}} />
            Enter Results — {selected.patientName}
          </div>
          <span style={{background:u.bg,color:u.color,padding:'3px 12px',borderRadius:20,fontSize:11,fontWeight:800,flexShrink:0}}>
            {u.label}
          </span>
        </div>

        <div className="page-content">
          {/* Patient info */}
          <div className="card" style={{marginBottom:12}}>
            <div className="card-body lab-patient" style={{display:'flex', gap:16, alignItems:'center'}}>
              <div style={{
                width:48, height:48, borderRadius:'50%', flexShrink:0,
                background:'#cffafe', color:'#0891b2',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:17, fontWeight:800,
              }}>
                {selected.patientName?.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:800, fontSize:15, color:'var(--t1)'}}>{selected.patientName}</div>
                <div style={{fontSize:11, color:'var(--t3)'}}>
                  {selected.emrNumber} · {selected.classSet} · {selected.sex}
                </div>
                <div style={{fontSize:11, color:'var(--t3)'}}>
                  Requested by: <strong style={{color:'var(--t2)'}}>{selected.requestedBy}</strong>
                  {' '}· {formatTs(selected.requestedAt)}
                </div>
                {selected.notes && (
                  <div style={{fontSize:11, color:'var(--warn)', marginTop:3, fontWeight:700}}>
                    Clinical note: {selected.notes}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Result entry: one card per ordered test, one line per analyte */}
          {(selected.tests || []).map(testName => {
            const testRows = rows.filter(r => r.test === testName);
            const editing  = !!editRanges[testName];
            const hasNum   = testRows.some(r => r.analyte.kind === 'num');
            return (
              <div key={testName} className="card" style={{marginBottom:10}}>
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-test-pipe" style={{color:'#0891b2'}} />
                    {testName}
                  </div>
                  {hasNum && (
                    <button className="btn btn-sm" onClick={() => setEditRanges(p => ({...p, [testName]: !p[testName]}))}
                      style={{background:'rgba(8,145,178,.1)', color:'#0891b2', borderColor:'rgba(8,145,178,.25)'}}>
                      <i className="ti ti-adjustments" /> {editing ? 'Done' : 'Unit / range'}
                    </button>
                  )}
                </div>
                <div className="card-body" style={{padding:'6px 12px 12px'}}>
                  {testRows.map(r => {
                    const kind = r.analyte.kind;
                    const abn  = isAbnormalFlag(r.flag);
                    const chip = abn ? '#dc2626' : r.flag === 'normal' ? 'var(--success)' : 'var(--t3)';
                    return (
                      <div key={r.key} style={{padding:'8px 0', borderBottom:'1px solid var(--border)'}}>
                        <div style={{display:'grid', gridTemplateColumns: kind === 'text' ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1.1fr) 44px', gap:8, alignItems:'center'}}>
                          <div style={{minWidth:0, overflowWrap:'anywhere'}}>
                            <div style={{fontSize:13, fontWeight:800, color: abn ? '#dc2626' : 'var(--t1)'}}>{r.key}</div>
                            {kind === 'num' && (
                              <div style={{fontSize:10, color:'var(--t3)', fontWeight:600}}>
                                {r.rangeStr ? `Normal: ${r.rangeStr}` : 'No range set'}{r.unit ? ` ${r.unit}` : ''}
                              </div>
                            )}
                          </div>
                          {kind === 'select' ? (
                            <select className="form-input" value={r.value}
                              onChange={e => setRow(r.key, { value: e.target.value })}>
                              <option value="">— select —</option>
                              {r.analyte.options.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input className="form-input" value={r.value}
                              inputMode={kind === 'num' ? 'decimal' : 'text'}
                              placeholder={kind === 'num' ? 'Value' : 'Enter result'}
                              onChange={e => setRow(r.key, { value: e.target.value })}
                              style={abn ? {borderColor:'#dc2626', color:'#dc2626', fontWeight:800} : undefined} />
                          )}
                          {kind !== 'text' && (
                            <button onClick={() => cycleFlag(r)} disabled={!r.flag} title="Tap to change flag"
                              style={{height:38, borderRadius:8, border:'1px solid var(--border)', background:'var(--card-bg2)',
                                color:chip, fontWeight:800, fontSize: flagLetter(r.flag).length > 1 ? 10 : 14, cursor:'pointer', fontFamily:'var(--font)'}}>
                              {flagLetter(r.flag) || (r.flag === 'normal' ? 'N' : '–')}
                            </button>
                          )}
                        </div>
                        {editing && kind === 'num' && (
                          <div style={{display:'grid', gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)', gap:8, marginTop:6}}>
                            <input className="form-input" placeholder="Unit" value={r.unit}
                              onChange={e => setRow(r.key, { unit: e.target.value })} />
                            <input className="form-input" placeholder="Range e.g. 130 - 179" value={r.rangeStr}
                              onChange={e => setRow(r.key, { rangeStr: e.target.value })} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* ── OTHERS / CUSTOM TEST SECTION ── */}
          <div className="card" style={{marginBottom:10}}>
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-plus" style={{color:'#0891b2'}} />
                Other Investigations / Screenings
              </div>
              <button className="btn btn-sm" onClick={addCustomTest}
                style={{background:'rgba(8,145,178,.1)', color:'#0891b2', borderColor:'rgba(8,145,178,.25)'}}>
                <i className="ti ti-plus" /> Add
              </button>
            </div>
            {customTests.length === 0 ? (
              <div style={{padding:'12px 16px', textAlign:'center'}}>
                <p style={{fontSize:12, color:'var(--t3)', fontWeight:600, margin:0}}>
                  Click <strong>Add</strong> to enter any additional investigation or screening not in the ordered list
                </p>
              </div>
            ) : (
              <div className="card-body">
                {customTests.map((row) => (
                  <div key={row.id} style={{marginBottom:14, padding:'12px', borderRadius:8,
                    background:'var(--accent-bg)', border:'1px solid var(--border)'}}>
                    {/* Test name input */}
                    <div className="form-group" style={{marginBottom:8}}>
                      <label className="form-label">
                        Type of Investigation / Screening <span className="req">*</span>
                      </label>
                      <textarea className="form-textarea" rows={2}
                        placeholder="e.g. Urinalysis (microscopy, pH 6.0, protein trace, glucose neg, blood neg), Widal titre 1:160, Blood Culture — pending…"
                        value={row.testName}
                        onChange={e => setCustomField(row.id, 'testName', e.target.value)}
                        style={{resize:'vertical'}}
                      />
                    </div>
                    {/* Result fields */}
                    <div className="lab-grid3" style={{display:'grid', gridTemplateColumns:'2fr 1fr 2fr', gap:8, marginBottom:8}}>
                      <div className="form-group">
                        <label className="form-label">Result Value</label>
                        <input className="form-input" placeholder="e.g. Positive / 5.4 / See above"
                          value={row.value} onChange={e => setCustomField(row.id,'value',e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Unit</label>
                        <input className="form-input" placeholder="g/dL"
                          value={row.unit} onChange={e => setCustomField(row.id,'unit',e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Reference Range</label>
                        <input className="form-input" placeholder="e.g. Negative"
                          value={row.referenceRange} onChange={e => setCustomField(row.id,'referenceRange',e.target.value)} />
                      </div>
                    </div>
                    <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                      {/* Flag */}
                      <div style={{display:'flex', gap:4}}>
                        {['normal','high','low'].map(f => (
                          <button key={f} onClick={() => setCustomField(row.id,'flag',f)} style={{
                            padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:800,
                            border: row.flag===f ? 'none' : '1px solid var(--border)',
                            background: row.flag===f ? FLAG_STYLE[f].color : 'var(--card-bg2)',
                            color:      row.flag===f ? '#fff'              : 'var(--t3)',
                            cursor:'pointer', fontFamily:'var(--font)',
                          }}>{f.toUpperCase()}</button>
                        ))}
                      </div>
                      <button className="btn btn-sm btn-danger btn-icon" onClick={() => removeCustomTest(row.id)}>
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── LAB COMMENTS (printed under the result table) ── */}
          <div className="card" style={{marginBottom:10}}>
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-message-2" style={{color:'#0891b2'}} />
                Extra comments (optional)
              </div>
            </div>
            <div className="card-body">
              <textarea className="form-textarea" rows={4}
                placeholder={"Abnormal values are commented automatically. Add anything else here, one remark per line, e.g.\nRBC: NORMOCYTIC NORMOCHROMIC"}
                value={comments} onChange={e => setComments(e.target.value)}
                style={{resize:'vertical', width:'100%', boxSizing:'border-box'}} />
            </div>
          </div>

          {/* ── FILE / DOCUMENT UPLOAD ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-paperclip" style={{color:'#0891b2'}} />
                Attach Lab Report Document
              </div>
            </div>
            <div className="card-body">
              <input
                type="file"
                ref={fileInputRef}
                style={{display:'none'}}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setAttachedFile(f); toast.success(`"${f.name}" ready to upload`); }
                  e.target.value = '';
                }}
              />
              {attachedFile ? (
                <div style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
                  borderRadius:8, background:'rgba(8,145,178,.07)', border:'1px solid rgba(8,145,178,.2)'}}>
                  <i className={`ti ${attachedFile.type.includes('pdf') ? 'ti-file-text' : 'ti-photo'}`}
                    style={{fontSize:22, color:'#0891b2'}} />
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:12, fontWeight:700, color:'var(--t1)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {attachedFile.name}
                    </div>
                    <div style={{fontSize:10, color:'var(--t3)'}}>
                      {(attachedFile.size / 1024).toFixed(1)} KB — will be uploaded with results
                    </div>
                  </div>
                  <button className="btn btn-sm btn-danger btn-icon" onClick={() => setAttachedFile(null)}>
                    <i className="ti ti-x" />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border:'2px dashed var(--border)', borderRadius:10, padding:'18px 12px',
                    textAlign:'center', cursor:'pointer', transition:'all .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor='#0891b2'}
                  onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}
                >
                  <i className="ti ti-cloud-upload" style={{fontSize:26, color:'#0891b2', display:'block', marginBottom:6}} />
                  <p style={{fontSize:12, fontWeight:700, color:'var(--t2)', margin:0}}>
                    Tap to attach a lab report, scan, or document
                  </p>
                  <p style={{fontSize:10, color:'var(--t3)', marginTop:4}}>PDF · JPG · PNG · Word — max 10MB</p>
                </div>
              )}
            </div>
          </div>

          {/* ── PREVIEW: exactly what will appear in the patient timeline ── */}
          {Object.keys(buildResults()).length > 0 && (
            <div className="card" style={{marginBottom:14}}>
              <div className="card-header">
                <div className="card-title">
                  <i className="ti ti-eye" style={{color:'#0891b2'}} />
                  Preview
                </div>
              </div>
              <div className="card-body">
                <LabReportTable result={{
                  results: buildResults(), comments,
                  resultEnteredBy: profile?.displayName || profile?.email || '',
                  requestedBy: selected.requestedBy, tests: selected.tests,
                }} />
              </div>
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving || uploading} style={{
            width:'100%', padding:'12px', background:'var(--accent)', color:'#fff',
            border:'none', borderRadius:10, fontWeight:800, fontSize:14, cursor:'pointer',
            fontFamily:'var(--font)', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            opacity: (saving || uploading) ? .6 : 1,
          }}>
            <i className="ti ti-device-floppy" style={{fontSize:18}} />
            {uploading ? 'Uploading file…' : saving ? 'Saving Results…' : 'Save & Complete'}
          </button>
        </div>
      </div>
    );
  }

  // ── Main Dashboard ──────────────────────────
  return (
    <div className="lab-root" style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', background:'var(--main-bg)' }}>
      <div className="topbar lab-topbar">
        <div className="topbar-title">
          <i className="ti ti-flask" style={{color:'#0891b2', marginRight:6}} />
          Laboratory — {profile?.displayName}
        </div>
        <input
          className="lab-search"
          placeholder="Search patient / EMR…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex:1, maxWidth:240, padding:'7px 12px', borderRadius:20,
            border:'1px solid var(--border)', background:'var(--main-bg)',
            fontSize:12, fontWeight:600, color:'var(--t1)', fontFamily:'var(--font)', outline:'none',
          }}
        />
        <button className="btn btn-sm" onClick={() => setShowRanges(true)}
          style={{background:'rgba(8,145,178,.1)', color:'#0891b2', borderColor:'rgba(8,145,178,.25)', flexShrink:0}}>
          <i className="ti ti-adjustments" /> Test ranges
        </button>
      </div>

      {showRanges && (
        <LabRangesEditor
          overrides={catalogue}
          onClose={() => setShowRanges(false)}
          onSave={(o) => saveLabCatalogueOverrides(o, profile?.displayName || profile?.email || 'Lab', profile?.role)}
        />
      )}

      <div className="page-content">
        {/* Summary cards */}
        <div className="lab-stats" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
          <div className="stat-card" style={{cursor:'pointer', borderTop: pending.length ? '3px solid #f97316' : undefined}} onClick={() => setTab('pending')}>
            <div className="stat-label"><i className="ti ti-clock" style={{color:'#f97316'}} />Pending</div>
            <div className="stat-value" style={{color:'#f97316'}}>{pending.length}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:4}}>Awaiting processing</div>
          </div>
          <div className="stat-card" style={{cursor:'pointer', borderTop: processing.length ? '3px solid var(--accent)' : undefined}} onClick={() => setTab('processing')}>
            <div className="stat-label"><i className="ti ti-test-pipe" style={{color:'var(--accent)'}} />Processing</div>
            <div className="stat-value" style={{color:'var(--accent)'}}>{processing.length}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:4}}>In progress</div>
          </div>
          <div className="stat-card" style={{cursor:'pointer'}} onClick={() => setTab('completed')}>
            <div className="stat-label"><i className="ti ti-check" style={{color:'var(--success)'}} />Completed</div>
            <div className="stat-value" style={{color:'var(--success)'}}>{completed.length}</div>
            <div style={{fontSize:10,color:'var(--t3)',marginTop:4}}>Results ready</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="lab-tabs" style={{display:'flex', gap:4, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:12}}>
          <button style={tabStyle('pending')}    onClick={() => setTab('pending')}>Pending ({pending.length})</button>
          <button style={tabStyle('processing')} onClick={() => setTab('processing')}>Processing ({processing.length})</button>
          <button style={tabStyle('completed')}  onClick={() => setTab('completed')}>Completed - last 7 days ({completed.length})</button>
        </div>

        {/* Request list */}
        <div className="card">
          {displayed.length === 0
            ? <div style={{padding:40,textAlign:'center',color:'var(--t3)',fontWeight:700,fontSize:13}}>
                <i className="ti ti-flask" style={{fontSize:36,display:'block',marginBottom:8,opacity:.3}} />
                {tab==='pending' ? 'No pending lab requests' : tab==='processing' ? 'No requests in processing' : 'No completed results yet'}
              </div>
            : displayed.map(req => {
                const u = URGENCY_STYLE[req.urgency] || URGENCY_STYLE.routine;
                return (
                  <div key={req.id}
                    onClick={() => tab !== 'completed' ? openRequest(req) : null}
                    style={{
                      padding:'12px 16px', borderBottom:'1px solid var(--border)',
                      cursor: tab!=='completed' ? 'pointer' : 'default',
                      transition:'background .12s',
                    }}
                    onMouseEnter={e => { if(tab!=='completed') e.currentTarget.style.background='var(--card-bg2)'; }}
                    onMouseLeave={e => e.currentTarget.style.background=''}
                  >
                    <div className="lab-req-row" style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
                      {/* Avatar */}
                      <div style={{
                        width:36, height:36, borderRadius:'50%', flexShrink:0,
                        background:'#cffafe', color:'#0891b2',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:800,
                      }}>
                        {req.patientName?.split(' ').map(w=>w[0]).join('').slice(0,2) || '?'}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:800, fontSize:13, color:'var(--t1)'}}>{req.patientName}</div>
                        <div style={{fontSize:10, color:'var(--t3)'}}>
                          {req.emrNumber} · {req.classSet} · {req.sex}
                          {' '}· Req. by {req.requestedBy} · {formatTs(req.requestedAt)}
                        </div>
                      </div>
                      <span style={{background:u.bg,color:u.color,padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:800,flexShrink:0}}>
                        {u.label}
                      </span>
                      {tab !== 'completed' && (
                        <button onClick={(e) => { e.stopPropagation(); openRequest(req); }} style={{
                          background:'var(--accent)', color:'#fff', border:'none', borderRadius:8,
                          padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)',
                          flexShrink:0,
                        }}>
                          <i className="ti ti-pencil" style={{marginRight:4}} />Enter Results
                        </button>
                      )}
                    </div>

                    {/* Tests chips */}
                    <div className="lab-indent" style={{display:'flex', gap:5, flexWrap:'wrap', paddingLeft:46}}>
                      {(req.tests||[]).map(t => (
                        <span key={t} style={{
                          fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6,
                          background:'var(--card-bg2)', color:'var(--t2)',
                          border:'1px solid var(--border)',
                        }}>{t}</span>
                      ))}
                    </div>

                    {/* Completed results: same report table the patient timeline shows */}
                    {tab === 'completed' && req.results && (
                      <div className="lab-indent" style={{marginTop:10, paddingLeft:46}}>
                        <LabReportTable result={{
                          results: req.results, comments: req.comments, tests: req.tests,
                          resultEnteredBy: req.resultEnteredBy, requestedBy: req.requestedBy,
                        }} />
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
      </div>
    </div>
  );
}
