// src/pages/LabDashboard.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import {
  listenLabRequests, enterLabResults,
  updateLabRequestStatus, formatTs, LAB_TESTS,
  uploadLabResultFile,
} from '../lib/emr';
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
  const [results,        setResults]        = useState({});
  const [saving,         setSaving]         = useState(false);
  const [search,         setSearch]         = useState('');
  const [customTests,    setCustomTests]    = useState([]);   // extra "Others" rows
  const [attachedFile,   setAttachedFile]   = useState(null); // File object
  const [uploading,      setUploading]      = useState(false);

  useEffect(() => {
    const unsub = listenLabRequests(setRequests);
    return unsub;
  }, []);

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
    // Pre-fill results object with empty values for each test
    const init = {};
    (req.tests || []).forEach(t => {
      init[t] = req.results?.[t] || { value:'', unit:'', flag:'normal', referenceRange:'' };
    });
    setResults(init);
    // Mark as processing if still pending
    if (req.status === 'pending') {
      await updateLabRequestStatus(req.id, 'processing', profile.displayName || 'Lab');
    }
  };

  const setResult = (test, field, val) => {
    setResults(prev => ({ ...prev, [test]: { ...prev[test], [field]: val } }));
  };

  // Custom "Others" test row helpers
  const addCustomTest = () =>
    setCustomTests(prev => [...prev, { id: Date.now(), testName:'', value:'', unit:'', flag:'normal', referenceRange:'' }]);
  const setCustomField = (id, field, val) =>
    setCustomTests(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  const removeCustomTest = (id) =>
    setCustomTests(prev => prev.filter(r => r.id !== id));

  const handleSubmit = async () => {
    const hasValue = Object.values(results).some(r => r.value?.trim());
    const hasCustom = customTests.some(r => r.testName?.trim() && r.value?.trim());
    if (!hasValue && !hasCustom && !attachedFile) {
      toast.error('Enter at least one result value, custom test, or attach a file'); return;
    }

    setSaving(true);
    try {
      // Merge standard results with custom test results
      const mergedResults = { ...results };
      customTests.forEach(r => {
        if (r.testName?.trim()) {
          mergedResults[r.testName.trim()] = {
            value: r.value, unit: r.unit, flag: r.flag, referenceRange: r.referenceRange,
          };
        }
      });

      await enterLabResults(selected.id, mergedResults, profile.displayName || profile.email || 'Lab');

      // Upload attached file if any
      if (attachedFile) {
        setUploading(true);
        await uploadLabResultFile(
          selected.emrNumber, selected.id, attachedFile,
          profile.displayName || profile.email || 'Lab'
        );
        setUploading(false);
      }

      toast.success('Results saved successfully');
      setSelected(null);
      setCustomTests([]);
      setAttachedFile(null);
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
      <div style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', background:'var(--main-bg)' }}>
        <div className="topbar">
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
            <div className="card-body" style={{display:'flex', gap:16, alignItems:'center'}}>
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

          {/* Result entry per test */}
          {(selected.tests || []).map(testName => {
            const res = results[testName] || {};
            return (
              <div key={testName} className="card" style={{marginBottom:10}}>
                <div className="card-header">
                  <div className="card-title">
                    <i className="ti ti-test-pipe" style={{color:'#0891b2'}} />
                    {testName}
                  </div>
                  {/* Flag selector */}
                  <div style={{display:'flex', gap:4}}>
                    {['normal','high','low'].map(f => (
                      <button key={f} onClick={() => setResult(testName,'flag',f)} style={{
                        padding:'3px 10px', borderRadius:6, fontSize:11, fontWeight:800,
                        border: res.flag===f ? 'none' : '1px solid var(--border)',
                        background: res.flag===f ? FLAG_STYLE[f].color : 'var(--card-bg2)',
                        color:      res.flag===f ? '#fff'              : 'var(--t3)',
                        cursor:'pointer', fontFamily:'var(--font)',
                      }}>{f.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div className="card-body">
                  <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 2fr', gap:10}}>
                    <div className="form-group">
                      <label className="form-label">Result Value <span className="req">*</span></label>
                      <input className="form-input"
                        value={res.value||''}
                        onChange={e => setResult(testName,'value',e.target.value)}
                        placeholder="e.g. 12.5 or Positive"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unit</label>
                      <input className="form-input"
                        value={res.unit||''}
                        onChange={e => setResult(testName,'unit',e.target.value)}
                        placeholder="e.g. g/dL"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Reference Range</label>
                      <input className="form-input"
                        value={res.referenceRange||''}
                        onChange={e => setResult(testName,'referenceRange',e.target.value)}
                        placeholder="e.g. 11.5–16.5 g/dL"
                      />
                    </div>
                  </div>
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
                    <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 2fr', gap:8, marginBottom:8}}>
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
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflowY:'auto', background:'var(--main-bg)' }}>
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-flask" style={{color:'#0891b2', marginRight:6}} />
          Laboratory — {profile?.displayName}
        </div>
        <input
          placeholder="Search patient / EMR…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{
            flex:1, maxWidth:240, padding:'7px 12px', borderRadius:20,
            border:'1px solid var(--border)', background:'var(--main-bg)',
            fontSize:12, fontWeight:600, color:'var(--t1)', fontFamily:'var(--font)', outline:'none',
          }}
        />
      </div>

      <div className="page-content">
        {/* Summary cards */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12}}>
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
        <div style={{display:'flex', gap:4, background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:4, marginBottom:12}}>
          <button style={tabStyle('pending')}    onClick={() => setTab('pending')}>Pending ({pending.length})</button>
          <button style={tabStyle('processing')} onClick={() => setTab('processing')}>Processing ({processing.length})</button>
          <button style={tabStyle('completed')}  onClick={() => setTab('completed')}>Completed ({completed.length})</button>
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
                    <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
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
                    <div style={{display:'flex', gap:5, flexWrap:'wrap', paddingLeft:46}}>
                      {(req.tests||[]).map(t => (
                        <span key={t} style={{
                          fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6,
                          background:'var(--card-bg2)', color:'var(--t2)',
                          border:'1px solid var(--border)',
                        }}>{t}</span>
                      ))}
                    </div>

                    {/* Completed results preview */}
                    {tab === 'completed' && req.results && (
                      <div style={{marginTop:8, paddingLeft:46, display:'flex', gap:6, flexWrap:'wrap'}}>
                        {Object.entries(req.results).map(([test, res]) => (
                          <div key={test} style={{
                            background:'var(--card-bg2)', border:'1px solid var(--border)',
                            borderRadius:8, padding:'4px 10px',
                          }}>
                            <div style={{fontSize:9, color:'var(--t3)', fontWeight:700}}>{test}</div>
                            <div style={{
                              fontSize:13, fontWeight:800,
                              color: res.flag==='high'?'#dc2626':res.flag==='low'?'#d97706':'var(--success)',
                            }}>
                              {res.value} <span style={{fontSize:10, fontWeight:500}}>{res.unit}</span>
                              {res.flag !== 'normal' && (
                                <span style={{fontSize:10, marginLeft:4}}>{FLAG_STYLE[res.flag]?.label}</span>
                              )}
                            </div>
                            {res.referenceRange && (
                              <div style={{fontSize:9, color:'var(--t3)'}}>Ref: {res.referenceRange}</div>
                            )}
                          </div>
                        ))}
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
