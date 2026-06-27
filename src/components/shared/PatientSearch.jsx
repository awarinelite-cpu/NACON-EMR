// src/components/shared/PatientSearch.jsx
// Reusable top-bar search for Doctor, Nurse, Records pages
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { searchPatients } from '../../lib/emr';

export default function PatientSearch({ placeholder = 'Search by EMR, name, or class (e.g. SET 49)…' }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [open,      setOpen]      = useState(false);
  const [coords,    setCoords]    = useState(null); // {top,left,width} for the portaled dropdown
  const timer   = useRef(null);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // On mobile, .main-area is a single continuously-scrolling container (instead of
  // the topbar staying put while only .page-content scrolls, like on desktop). That
  // meant this dropdown — position:absolute relative to the search box — could end
  // up visually painted behind the dashboard cards below it, even with overflow:visible
  // set on every ancestor. Rendering it into a body-level portal with position:fixed,
  // anchored to the search box's real on-screen coordinates, sidesteps that entirely
  // instead of fighting ancestor stacking/overflow rules again.
  const updateCoords = useCallback(() => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  const handleInput = (val) => {
    setQuery(val);
    clearTimeout(timer.current);
    if (!val.trim()) { setResults([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchPatients(val);
      setResults(res.slice(0, 8));
      updateCoords();
      setOpen(true);
      setSearching(false);
    }, 280);
  };

  const openProfile = (emr) => {
    setQuery(''); setResults([]); setOpen(false);
    navigate(`/patient/${emr}`);
  };

  const getInitials = (p) =>
    ((p.surname?.[0] || '') + (p.firstName?.[0] || '')).toUpperCase();

  const statusColor = (s) => {
    if (s === 'active')     return { bg:'var(--danger-bg)',  color:'var(--danger)'  };
    if (s === 'discharged') return { bg:'var(--success-bg)', color:'var(--success)' };
    if (s === 'referred')   return { bg:'var(--warn-bg)',    color:'var(--warn)'    };
    return                         { bg:'var(--info-bg)',    color:'var(--info)'    };
  };

  return (
    <div ref={wrapRef} className="patient-search" style={{ position:'relative', flex:1 }}>
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        background:'var(--main-bg)', border:'1px solid var(--border2)',
        borderRadius:'var(--radius)', padding:'7px 12px',
      }}>
        <i className={`ti ${searching?'ti-loader-2':'ti-search'}`}
          style={{ fontSize:16, color:'var(--t3)', flexShrink:0,
            ...(searching?{animation:'spin 1s linear infinite'}:{}) }}
          aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          style={{
            flex:1, border:'none', outline:'none',
            background:'transparent', fontSize:13,
            fontWeight:700, color:'var(--t1)', fontFamily:'var(--font)',
          }}
          aria-label="Search patients"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <i className="ti ti-x" style={{cursor:'pointer',fontSize:14,color:'var(--t3)'}}
            onMouseDown={()=>{setQuery('');setResults([]);setOpen(false);}}
            aria-label="Clear" />
        )}
      </div>

      {/* Criteria hint tags */}
      {!query && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:150,
          display:'flex', gap:6, padding:'6px 8px',
          background:'var(--card-bg)', border:'1px solid var(--border)',
          borderRadius:'var(--radius)', boxShadow:'var(--shadow)',
          pointerEvents:'none', opacity: 0,  // hidden by default, shown on focus via JS
        }} className="search-hint">
          <span style={{fontSize:10,color:'var(--t3)',fontWeight:700}}>Search by:</span>
          {['EMR number','Full name','Class / SET'].map(t=>(
            <span key={t} style={{fontSize:10,padding:'2px 7px',borderRadius:6,
              background:'var(--card-bg2)',color:'var(--t2)',fontWeight:700,
              border:'1px solid var(--border)'}}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Results / no-results dropdown — portaled to <body> so mobile's single
          continuous main-area scroll can never visually bury it under the
          dashboard content below the search box (see comment near updateCoords). */}
      {open && coords && createPortal(
        <>
          {results.length > 0 && (
            <div style={{
              position:'fixed', top:coords.top, left:coords.left, width:coords.width, zIndex:9999,
              background:'var(--card-bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-lg)', boxShadow:'var(--shadow-md)', overflow:'hidden',
              maxHeight:'70vh', overflowY:'auto',
            }} role="listbox">
              <div style={{padding:'6px 12px 5px',fontSize:10,fontWeight:700,
                color:'var(--t3)',borderBottom:'1px solid var(--border)',
                textTransform:'uppercase',letterSpacing:'.05em'}}>
                {results.length} result{results.length!==1?'s':''} — click to open profile
              </div>
              {results.map(p => {
                const sc = statusColor(p.status);
                return (
                  <div key={p.id} role="option" tabIndex={0}
                    onMouseDown={() => openProfile(p.emrNumber)}
                    onKeyDown={e => e.key==='Enter' && openProfile(p.emrNumber)}
                    style={{
                      display:'flex', alignItems:'center', gap:10,
                      padding:'9px 12px', cursor:'pointer',
                      borderBottom:'1px solid var(--border)',
                      transition:'background .1s',
                    }}
                    onMouseOver={e=>e.currentTarget.style.background='var(--card-bg2)'}
                    onMouseOut={e=>e.currentTarget.style.background=''}
                  >
                    <div style={{
                      width:32,height:32,borderRadius:'50%',
                      background:'var(--accent-bg)',color:'var(--accent)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:12,fontWeight:700,flexShrink:0,
                    }}>{getInitials(p)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t1)'}}>
                        {p.surname} {p.firstName} {p.otherNames}
                      </div>
                      <div style={{fontSize:10,color:'var(--t3)',fontWeight:500}}>
                        {p.classSet} · {p.matricNo}
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4}}>
                      <span className="emr-tag">{p.emrNumber}</span>
                      <span style={{fontSize:9,padding:'2px 6px',borderRadius:6,fontWeight:700,...sc}}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {query && results.length === 0 && !searching && (
            <div style={{
              position:'fixed', top:coords.top, left:coords.left, width:coords.width, zIndex:9999,
              background:'var(--card-bg)', border:'1px solid var(--border)',
              borderRadius:'var(--radius)', padding:'14px 12px',
              textAlign:'center', fontSize:12, color:'var(--t3)', fontWeight:700,
              boxShadow:'var(--shadow)',
            }}>
              <i className="ti ti-search-off" style={{fontSize:20,display:'block',marginBottom:4}} />
              No patient found for "{query}"
            </div>
          )}
        </>,
        document.body
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
