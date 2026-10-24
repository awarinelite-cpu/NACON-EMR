// src/pages/NurseDutyReportPage.jsx
// Nurses write the daily MRS duty report here (one report per shift).
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import ShiftPatientCards, { SavedPatientsSeen } from '../components/nurse/ShiftPatientCards';
import { addDutyReport, updateDutyReport, listenDutyReports, saveDutyDraft, getDutyDraft, deleteDutyDraft, deleteDutyReport, setDutyMarker, listenDutyMarker, formatTs } from '../lib/emr';

const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const fmtDate = (d) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;

// Shift window for the patient cards: 1700hrs -> 0600hrs next day
// Safe date display (handles Firestore Timestamps, {seconds} objects, numbers; blank while the server time is pending)
const tsMs = (ts) => ts?.toDate ? ts.toDate().getTime()
  : (ts?.seconds != null ? ts.seconds * 1000
  : (ts?._seconds != null ? ts._seconds * 1000
  : (typeof ts === 'number' ? ts : (typeof ts === 'string' ? Date.parse(ts) || 0 : 0))));
const fmtWhen = (r) => {
  const ms = typeof r.createdMs === 'number' ? r.createdMs : tsMs(r.createdAt);
  return ms ? formatTs(new Date(ms)) : '';
};

const shiftWindow = () => {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 6 ? 1 : 0), 17, 0, 0);
  const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 6, 0, 0);
  return { start, end };
};

// Shift runs 1700hrs -> 0600hrs next day. Before 0600 we are still in the shift that began yesterday.
const makeHeading = () => {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 6 ? 1 : 0));
  const end   = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return `MRS DUTY REPORT FROM 1700HRS ${DAYS[start.getDay()]} ${fmtDate(start)} TO 0600HRS ${DAYS[end.getDay()]} ${fmtDate(end)}`;
};

export default function NurseDutyReportPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [heading,   setHeading]   = useState(makeHeading);
  const [body,      setBody]      = useState('');
  const [reports,   setReports]   = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [openId,    setOpenId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftAt,   setDraftAt]   = useState(null);
  const [seenSnap,  setSeenSnap]  = useState(null);   // live snapshot of the patient cards (null while loading)
  const [clearedMs,  setClearedMs]  = useState(0);      // saved cutoff for this shift (survives deleting reports)
  const [localCut,   setLocalCut]   = useState(0);      // instant clear on submit, before the server time arrives
  const { start: shiftStart, end: shiftEnd } = shiftWindow();

  // Cards restart after the latest report submitted in this shift, so a submitted patient never comes back
  // under the textarea (until that patient is seen again later). Works for older reports too: if a report has
  // no saved time, the time of the last event in its saved patients is used.
  const lastSaved = reports.reduce((m, r) => {
    if (r.type && r.type !== 'duty_report') return m;
    let t = typeof r.createdMs === 'number' ? r.createdMs : tsMs(r.createdAt);
    if (!t && r.createdAt === null) t = Date.now();          // pending server time = just now
    const evMax = (r.patientsSeen || []).reduce((x, c) => (c.events || []).reduce((y, e) => Math.max(y, e.time || 0), x), 0);
    const c = Math.max(t || 0, evMax ? evMax + 1 : 0);
    return c >= shiftStart.getTime() && c > m ? c : m;
  }, 0);
  const cardsStart = new Date(Math.max(shiftStart.getTime(), lastSaved, localCut, clearedMs));

  useEffect(() => listenDutyReports(setReports), []);

  // One draft per shift, keyed by the shift's start date
  const shiftKey = `${shiftStart.getFullYear()}-${String(shiftStart.getMonth()+1).padStart(2,'0')}-${String(shiftStart.getDate()).padStart(2,'0')}`;

  useEffect(() => listenDutyMarker(shiftKey, setClearedMs), [shiftKey]);

  // Come back later and continue where you stopped
  useEffect(() => {
    let alive = true;
    getDutyDraft(shiftKey).then(d => {
      if (!alive || !d) return;
      setBody(b => (b ? b : (d.body || '')));
      setDraftAt(d.updatedAt || null);
    }).catch(e => console.error('load draft', e));
    return () => { alive = false; };
  }, [shiftKey]);

  const reset = () => { setHeading(makeHeading()); setBody(''); setEditingId(null); };

  const who = () => profile?.displayName || profile?.email || 'Unknown staff';

  // SAVE = keep as a draft so the nurse can continue later. Does NOT go to Previous reports.
  const saveDraft = async () => {
    if (!body.trim()) { toast.error('Write the report first'); return; }
    setDraftBusy(true);
    try {
      await saveDutyDraft(shiftKey, { heading, body }, who());
      setDraftAt(new Date());
      toast.success('Draft saved — you can continue later');
    } catch (e) {
      console.error('duty draft', e);
      toast.error('Failed to save draft');
    }
    setDraftBusy(false);
  };

  // SUBMIT = push to Previous reports (with the patients seen) and clear for the next shift.
  const submit = async () => {
    if (!body.trim()) { toast.error('Write the report first'); return; }
    if (!editingId && seenSnap === null) { toast.error('Patients seen are still loading — try again in a moment'); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateDutyReport(editingId, { heading, body }, who(), profile?.role);
        toast.success('Report updated');
      } else {
        await addDutyReport({ heading, body, patientsSeen: seenSnap || [] }, who(), profile?.role);
        setLocalCut(Date.now());
        try { await setDutyMarker(shiftKey, who()); } catch (e) { console.error('duty marker', e); }
        try { await deleteDutyDraft(shiftKey); } catch (e) { console.error('delete draft', e); }
        setDraftAt(null);
        toast.success('Report submitted');
      }
      reset();
    } catch (e) {
      console.error('duty report', e);
      toast.error('Failed to submit report');
    }
    setSaving(false);
  };

  const removeReport = async (r) => {
    if (!window.confirm('Delete this saved report permanently? This cannot be undone.')) return;
    try {
      await deleteDutyReport(r.id, who(), profile?.role, r.heading);
      if (editingId === r.id) reset();
      setOpenId(null);
      toast.success('Report deleted');
    } catch (e) {
      console.error('delete duty report', e);
      toast.error('Failed to delete report');
    }
  };

  const startEdit = (r) => {
    setEditingId(r.id); setHeading(r.heading || makeHeading()); setBody(r.body || '');
    window.scrollTo?.(0, 0);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding:'6px 10px', flexShrink:0 }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div className="topbar-title">
          <i className="ti ti-report-medical" style={{ color:'var(--accent)', marginRight:6 }} />
          Nurses Report
        </div>
      </div>

      <div className="page-content" style={{ flex:1, display:'flex', flexDirection:'column', gap:14 }}>
        <div className="card" style={{ flexShrink:0 }}>
          <div className="card-body">
            <div className="form-group duty-heading-wrap">
              <label className="duty-heading">
                {heading}
              </label>
              <textarea className="form-textarea full-width" rows={16}
                placeholder="Write the duty report here…"
                value={body} onChange={e => setBody(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Patients seen this shift — standalone, never clipped by the report card */}
        <div style={{ flexShrink:0 }}>
          <ShiftPatientCards start={cardsStart} end={shiftEnd} onCards={setSeenSnap} />
        </div>

        <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' }}>
          {!editingId && (
            <button className="btn" onClick={saveDraft} disabled={draftBusy || saving}>
              <i className="ti ti-device-floppy" /> {draftBusy ? 'Saving…' : 'Save'}
            </button>
          )}
          <button className="btn btn-primary" onClick={submit} disabled={saving || draftBusy}>
            <i className="ti ti-send" /> {saving ? 'Submitting…' : editingId ? 'Update report' : 'Submit'}
          </button>
          {editingId && <button className="btn" onClick={reset}>Cancel</button>}
        </div>
        {!editingId && draftAt && (
          <div style={{ fontSize:12, color:'var(--t3)', marginTop:-6 }}>Draft saved {formatTs(draftAt)} {draftAt?.toDate ? draftAt.toDate().toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'}) : new Date(draftAt).toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})} — not yet in Previous reports</div>
        )}

        <div className="card" style={{ flexShrink:0 }}>
          <div className="card-header">
            <div className="card-title"><i className="ti ti-history" />Previous reports ({reports.length})</div>
          </div>
          {reports.length === 0 && (
            <div style={{ padding:20, textAlign:'center', color:'var(--t3)', fontWeight:700 }}>No reports yet</div>
          )}
          {reports.map(r => (
            <div key={r.id} style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <div onClick={() => setOpenId(openId === r.id ? null : r.id)} style={{ cursor:'pointer' }}>
                <div style={{ fontWeight:800, fontSize:13, color:'var(--t1)', overflowWrap:'anywhere' }}>{r.heading}</div>
                <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>
                  {r.authorName} · {fmtWhen(r)}{r.editedAt ? ' · edited' : ''}{Array.isArray(r.patientsSeen) ? ` · ${r.patientsSeen.length} patient${r.patientsSeen.length === 1 ? '' : 's'} seen` : ''}
                </div>
              </div>
              {openId === r.id && (
                <>
                  <div style={{ whiteSpace:'pre-wrap', fontSize:13, lineHeight:1.6, marginTop:8, color:'var(--t1)', overflowWrap:'anywhere' }}>
                    {r.body}
                  </div>
                  <SavedPatientsSeen patients={r.patientsSeen} />

                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button className="btn btn-sm" onClick={() => startEdit(r)}>
                      <i className="ti ti-edit" /> Edit
                    </button>
                    <button className="btn btn-sm" style={{ color:'var(--danger)' }} onClick={() => removeReport(r)}>
                      <i className="ti ti-trash" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
