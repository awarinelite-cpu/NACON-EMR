// src/pages/Settings.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import toast from 'react-hot-toast';
import { generateLinkCode, listenTelegramLink, unlinkTelegram } from '../lib/telegramReminders';

const BOT_USERNAME = process.env.REACT_APP_TELEGRAM_BOT_USERNAME || null;

export default function Settings() {
  const { profile, theme, toggleTheme } = useAuth();
  const [copied, setCopied] = useState('');
  const [tgLink, setTgLink] = useState(null);
  const [tgCode, setTgCode] = useState(null);
  const [tgLoading, setTgLoading] = useState(false);

  useEffect(() => {
    if (!profile?.uid) return;
    return listenTelegramLink(profile.uid, setTgLink);
  }, [profile?.uid]);

  const handleGenerateCode = async () => {
    setTgLoading(true);
    try {
      const code = await generateLinkCode(profile.uid, profile.displayName);
      setTgCode(code);
    } catch (err) {
      console.error('[Settings] generateLinkCode failed:', err);
      toast.error('Could not generate a code — try again');
    }
    setTgLoading(false);
  };

  const handleUnlink = async () => {
    try {
      await unlinkTelegram(profile.uid);
      toast.success('Telegram unlinked');
    } catch (err) {
      console.error('[Settings] unlinkTelegram failed:', err);
      toast.error('Failed to unlink');
    }
  };

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
    { collection: 'med_reminders',    fields: 'status ASC, nextDueAt ASC' },
    { collection: 'med_reminders',    fields: 'assignedNurseUid ASC, status ASC' },
    { collection: 'iv_infusions',     fields: 'status ASC, endAt ASC' },
    { collection: 'iv_infusions',     fields: 'assignedNurseUid ASC, status ASC' },
    { collection: 'glucose_schedule', fields: 'status ASC, dueAt ASC' },
    { collection: 'glucose_schedule', fields: 'assignedNurseUid ASC, status ASC' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
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

        {/* ── TELEGRAM BOT ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-brand-telegram" />Telegram Bot</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize:13, color:'var(--t2)', marginTop:0 }}>
              Link your account to get medication, IV infusion, and FBS/RBS glucose-check
              reminders as DMs on Telegram.
            </p>
            {tgLink ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                <span className="badge" style={{ background:'var(--success-bg)', color:'var(--success)' }}>
                  ✅ Linked{tgLink.telegramFirstName ? ` as ${tgLink.telegramFirstName}` : ''}
                </span>
                <button className="btn btn-sm btn-outline" onClick={handleUnlink}>Unlink</button>
              </div>
            ) : (
              <div>
                {tgCode ? (
                  <div className="alert alert-info" style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    <div>
                      In Telegram, open {BOT_USERNAME ? <strong>@{BOT_USERNAME}</strong> : 'the NACON-EMR bot'} and send:
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <code style={{ fontSize:16, fontWeight:700 }}>/link {tgCode}</code>
                      <button className="btn btn-sm" onClick={() => copy(`/link ${tgCode}`, 'Command')}>
                        {copied === 'Command' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div style={{ fontSize:11, color:'var(--t3)' }}>Code expires in 15 minutes.</div>
                  </div>
                ) : (
                  <button className="btn" disabled={tgLoading} onClick={handleGenerateCode}>
                    <i className="ti ti-link" /> {tgLoading ? 'Generating…' : 'Generate link code'}
                  </button>
                )}
              </div>
            )}
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
            <div className="table-scroll">
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
    </div>
  );
}
