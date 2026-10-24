// src/pages/NurseDutyReportPage.jsx
// Nurses write the daily MRS duty report here (one report per shift).
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import ShiftPatientCards from '../components/nurse/ShiftPatientCards';
import { addDutyReport, updateDutyReport, listenDutyReports, formatTs } from '../lib/emr';

const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const fmtDate = (d) =>
  `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;

// Shift window for the patient cards: 1700hrs -> 0600hrs next day
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
  const { start: shiftStart, end: shiftEnd } = shiftWindow();

  useEffect(() => listenDutyReports(setReports), []);

  const reset = () => { setHeading(makeHeading()); setBody(''); setEditingId(null); };

  const save = async () => {
    if (!body.trim()) { toast.error('Write the report first'); return; }
    setSaving(true);
    try {
      const who = profile?.displayName || profile?.email || 'Unknown staff';
      if (editingId) {
        await updateDutyReport(editingId, { heading, body }, who, profile?.role);
        toast.success('Report updated');
      } else {
        await addDutyReport({ heading, body }, who, profile?.role);
        toast.success('Duty report saved');
      }
      reset();
    } catch (e) {
      console.error('duty report', e);
      toast.error('Failed to save report');
    }
    setSaving(false);
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
          <ShiftPatientCards start={shiftStart} end={shiftEnd} />
        </div>

        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <i className="ti ti-device-floppy" /> {saving ? 'Saving…' : editingId ? 'Update report' : 'Save report'}
          </button>
          {editingId && <button className="btn" onClick={reset}>Cancel</button>}
        </div>

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
                  {r.authorName} · {formatTs(r.createdAt)}{r.editedAt ? ' · edited' : ''}
                </div>
              </div>
              {openId === r.id && (
                <>
                  <div style={{ whiteSpace:'pre-wrap', fontSize:13, lineHeight:1.6, marginTop:8, color:'var(--t1)', overflowWrap:'anywhere' }}>
                    {r.body}
                  </div>
                  <button className="btn btn-sm" style={{ marginTop:8 }} onClick={() => startEdit(r)}>
                    <i className="ti ti-edit" /> Edit
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
