// src/pages/Settings.jsx
import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';

export default function Settings() {
  const { profile, theme, toggleTheme } = useAuth();
  const [copied, setCopied] = useState('');

  const copy = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(''), 2000);
    });
  };

  const INFO_ROWS = [
    { label: 'System name',      value: 'NACON MRS EMR' },
    { label: 'Institution',      value: 'Nigerian Army College of Nursing' },
    { label: 'Location',         value: 'Yaba, Lagos' },
    { label: 'Firebase project', value: 'nurses-vault' },
    { label: 'Version',          value: 'v1.0.0' },
    { label: 'Environment',      value: 'Production (Vercel)' },
  ];

  const FIRESTORE_INDEXES = [
    { collection: 'notes',          fields: 'emrNumber ASC, createdAt DESC' },
    { collection: 'vitals',         fields: 'emrNumber ASC, recordedAt DESC' },
    { collection: 'prescriptions',  fields: 'emrNumber ASC, createdAt DESC' },
    { collection: 'fluid_charts',   fields: 'emrNumber ASC, recordedAt ASC' },
    { collection: 'glucose_charts', fields: 'emrNumber ASC, recordedAt ASC' },
    { collection: 'uploads',        fields: 'emrNumber ASC, uploadedAt DESC' },
    { collection: 'visits',         fields: 'emrNumber ASC, createdAt DESC' },
    { collection: 'audit_log',      fields: 'timestamp DESC' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <div className="topbar">
        <div className="topbar-title">Settings</div>
      </div>

      <div className="page-content" style={{ display:'flex', flexDirection:'column', gap:14 }}>

        {/* ── APPEARANCE ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-palette" />Appearance</div>
          </div>
          <div className="card-body">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:'var(--t1)' }}>Theme</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                  Currently: <strong>{theme === 'light' ? 'Light mode' : 'Dark mode'}</strong>
                </div>
              </div>
              <button className="btn btn-primary" onClick={toggleTheme}>
                <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`} />
                Switch to {theme === 'light' ? 'Dark' : 'Light'} mode
              </button>
            </div>
          </div>
        </div>

        {/* ── LOGGED IN USER ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-user" />Your account</div>
          </div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[
                ['Display name', profile?.displayName || '—'],
                ['Email',        profile?.email       || '—'],
                ['Role',         profile?.role        || '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)', textTransform:'uppercase',
                    letterSpacing:'.04em', marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)',
                    textTransform: label === 'Role' ? 'capitalize' : 'none' }}>{value}</div>
                </div>
              ))}
            </div>
            <div className="alert alert-info" style={{ marginTop:14 }}>
              <i className="ti ti-info-circle" />
              To change your password, use the <strong>Reset link</strong> button in User Management,
              or ask another admin to reset it for you.
            </div>
          </div>
        </div>

        {/* ── SYSTEM INFO ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-info-circle" />System information</div>
          </div>
          <div className="card-body">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {INFO_ROWS.map(({ label, value }) => (
                <div key={label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--t3)',
                    textTransform:'uppercase', letterSpacing:'.04em' }}>{label}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:'var(--t1)',
                    fontFamily: label.includes('Firebase') || label.includes('Version') ? 'var(--mono)' : 'var(--font)' }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FIRESTORE INDEXES ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-database" />Required Firestore indexes</div>
            <span style={{ fontSize:11, color:'var(--t3)', fontWeight:500 }}>
              Create these in Firebase Console → Firestore → Indexes
            </span>
          </div>
          <div className="card-body">
            <div className="alert alert-warn" style={{ marginBottom:12 }}>
              <i className="ti ti-alert-triangle" />
              If patient timelines or charts show errors, a missing index is usually the cause.
              Add all indexes below in Firebase Console.
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Fields (composite index)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {FIRESTORE_INDEXES.map(idx => (
                  <tr key={idx.collection}>
                    <td style={{ fontFamily:'var(--mono)', color:'var(--accent)' }}>{idx.collection}</td>
                    <td style={{ fontFamily:'var(--mono)', fontSize:11 }}>{idx.fields}</td>
                    <td>
                      <button className="btn btn-sm" style={{ fontSize:10 }}
                        onClick={() => copy(`${idx.collection}: ${idx.fields}`, idx.collection)}>
                        <i className={`ti ${copied === idx.collection ? 'ti-check' : 'ti-copy'}`} />
                        {copied === idx.collection ? 'Copied' : 'Copy'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
