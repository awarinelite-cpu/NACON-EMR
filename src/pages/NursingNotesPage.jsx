// src/pages/NursingNotesPage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  listenPatients, listenNotes, addNote,
  formatTs, formatTime,
} from '../lib/emr';

const NOTE_TYPES = ['General', 'Admission', 'Shift Handover', 'Observation', 'Discharge Summary', 'Incident'];

export default function NursingNotesPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [patients,  setPatients]  = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [notes,     setNotes]     = useState([]);
  const [search,    setSearch]    = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [notesUnsub, setNotesUnsub] = useState(null);
  const [form, setForm] = useState({ type: 'General', subject: '', note: '' });

  useEffect(() => {
    const unsub = listenPatients(pts =>
      setPatients(pts.filter(p => p.status === 'active' || p.status === 'sickbay'))
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (notesUnsub) notesUnsub();
    if (!selected) { setNotes([]); return; }
    const u = listenNotes(selected.emrNumber, setNotes);
    setNotesUnsub(() => u);
    return u;
  }, [selected?.emrNumber]);

  const handleSave = async () => {
    if (!form.note.trim()) { toast.error('Note content is required'); return; }
    setSaving(true);
    try {
      await addNote(
        selected.emrNumber,
        null,
        { type: form.type, subject: form.subject, note: form.note },
        profile.displayName,
        profile.role
      );
      toast.success('Note saved');
      setShowForm(false);
      setForm({ type: 'General', subject: '', note: '' });
    } catch {
      toast.error('Failed to save note');
    }
    setSaving(false);
  };

  const filtered = patients.filter(p => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      p.surname?.toLowerCase().includes(s) ||
      p.firstName?.toLowerCase().includes(s) ||
      p.emrNumber?.toLowerCase().includes(s) ||
      p.classSet?.toLowerCase().includes(s)
    );
  });

  const getInitials = p => ((p.surname?.[0] || '') + (p.firstName?.[0] || '')).toUpperCase();

  const TYPE_COLOR = {
    'General':          { bg: 'var(--accent-bg)',  color: 'var(--accent)'  },
    'Admission':        { bg: 'var(--success-bg)', color: 'var(--success)' },
    'Shift Handover':   { bg: 'var(--warn-bg)',    color: 'var(--warn)'    },
    'Observation':      { bg: 'var(--card-bg2)',   color: 'var(--t2)'      },
    'Discharge Summary':{ bg: 'var(--danger-bg)',  color: 'var(--danger)'  },
    'Incident':         { bg: 'var(--danger-bg)',  color: 'var(--danger)'  },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-title">
          <i className="ti ti-notes-medical" style={{ marginRight: 6, color: 'var(--accent)' }} />
          Nursing Notes
        </div>
        {selected && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            <i className="ti ti-plus" /> New Note
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT — patient list */}
        {!selected && (
        <div style={{
          width: 260, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--card-bg)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-search" style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--t3)', fontSize: 13,
              }} />
              <input
                className="form-input"
                style={{ paddingLeft: 30, fontSize: 12 }}
                placeholder="Search patients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--t3)', fontSize: 12, fontWeight: 700 }}>
                No active patients
              </div>
            )}
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => setSelected(p)}
                style={{
                  padding: '11px 14px',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: selected?.emrNumber === p.emrNumber ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: selected?.emrNumber === p.emrNumber ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'background .12s',
                }}
                onMouseOver={e => { if (selected?.emrNumber !== p.emrNumber) e.currentTarget.style.background = 'var(--card-bg2)'; }}
                onMouseOut={e => { if (selected?.emrNumber !== p.emrNumber) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: p.status === 'sickbay' ? 'var(--danger-bg)' : 'var(--accent-bg)',
                    color: p.status === 'sickbay' ? 'var(--danger)' : 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700,
                  }}>{getInitials(p)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.surname} {p.firstName}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{p.emrNumber}</div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>{p.classSet}</div>
                  </div>
                  {p.status === 'sickbay' && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                      background: 'var(--danger-bg)', color: 'var(--danger)',
                    }}>Admitted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* RIGHT — notes */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!selected ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', gap: 12 }}>
              <i className="ti ti-notes-medical" style={{ fontSize: 48, opacity: .3 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Select a patient</div>
              <div style={{ fontSize: 12 }}>Choose a patient to view or add nursing notes</div>
            </div>
          ) : (
            <>
              {/* Patient header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'var(--card-bg)',
                borderRadius: 12, border: '1px solid var(--border)',
              }}>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelected(null)}
                  style={{ flexShrink: 0 }}
                  title="Back to patient list"
                >
                  <i className="ti ti-arrow-left" />
                </button>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'var(--accent-bg)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, flexShrink: 0,
                }}>{getInitials(selected)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.surname} {selected.firstName}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 10, marginTop: 2 }}>
                    <span style={{ fontFamily: 'var(--mono)' }}>{selected.emrNumber}</span>
                    <span>·</span>
                    <span>{selected.classSet}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                    <i className="ti ti-plus" /> New Note
                  </button>
                  <button className="btn btn-sm" onClick={() => navigate(`/patient/${selected.emrNumber}`)}>
                    <i className="ti ti-external-link" /> Profile
                  </button>
                </div>
              </div>

              {/* Notes list */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title"><i className="ti ti-notes-medical" /> Notes</div>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
                </div>
                {notes.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)' }}>
                    <i className="ti ti-notes-off" style={{ fontSize: 32, display: 'block', marginBottom: 8 }} />
                    <div style={{ fontWeight: 700 }}>No notes yet</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Click "New Note" to add a nursing note</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {notes.map((n, i) => {
                      const cfg = TYPE_COLOR[n.type] || TYPE_COLOR['General'];
                      return (
                        <div key={n.id} style={{
                          padding: '14px 18px',
                          borderBottom: i < notes.length - 1 ? '1px solid var(--border)' : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px',
                              borderRadius: 10, background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
                            }}>{n.type || 'General'}</span>
                            {n.subject && (
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t1)', flex: 1 }}>{n.subject}</span>
                            )}
                            <span style={{ fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap', marginLeft: 'auto' }}>
                              {formatTs(n.createdAt)} {formatTime(n.createdAt)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {n.note}
                          </div>
                          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t3)', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <i className="ti ti-user" style={{ fontSize: 12 }} />
                            <span style={{ fontWeight: 600 }}>{n.authorName}</span>
                            <span style={{ textTransform: 'capitalize' }}>({n.authorRole})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* NEW NOTE MODAL */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
          <div style={{
            background: 'var(--card-bg)', borderRadius: 16,
            width: '100%', maxWidth: 520, boxShadow: 'var(--shadow-md)', overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <i className="ti ti-notes-medical" style={{ fontSize: 20, color: 'var(--accent)' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>New Nursing Note</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>{selected?.surname} {selected?.firstName} · {selected?.emrNumber}</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: 18 }}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Note Type *</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {NOTE_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Subject (optional)</label>
                  <input className="form-input" placeholder="e.g. Post-op observation" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note *</label>
                <textarea
                  className="form-textarea full-width"
                  rows={6}
                  placeholder="Enter nursing note here…"
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>
              <div style={{
                padding: '10px 14px', borderRadius: 10, background: 'var(--accent-bg)',
                border: '1px solid var(--border)', fontSize: 11, color: 'var(--t2)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <i className="ti ti-user-check" style={{ color: 'var(--accent)', fontSize: 15 }} />
                Signing as <strong style={{ color: 'var(--accent)' }}>{profile.displayName}</strong> ({profile.role})
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : 'Save Note'}
                </button>
                <button className="btn" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
