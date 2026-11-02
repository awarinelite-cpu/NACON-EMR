// src/pages/ApproveRegistrations.jsx
// Records/Admin: approve or reject student self-registrations.
// Only approved students become patients (EMR number, set list).
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import {
  listenRegistrationRequests, listenPendingComplaintsByMatric,
  approveRegistration, rejectRegistration,
} from '../lib/emr';

export default function ApproveRegistrations() {
  const { profile } = useAuth();
  const who  = profile?.displayName || profile?.email || 'Records';
  const role = profile?.role || null;

  const [reqs, setReqs]   = useState([]);
  const [sick, setSick]   = useState({});
  const [busy, setBusy]   = useState('');   // id being processed, or 'all'

  useEffect(() => {
    const u1 = listenRegistrationRequests(setReqs);
    const u2 = listenPendingComplaintsByMatric(setSick);
    return () => { u1(); u2(); };
  }, []);

  // students who also reported sick come first
  const list = [...reqs].sort((a, b) => (!!sick[b.matricKey]) - (!!sick[a.matricKey]));

  const approve = async (r, quiet) => {
    setBusy(r.id);
    try {
      const res = await approveRegistration(r.id, who, role);
      if (!quiet) {
        if (res.duplicate) toast('Already registered — request closed');
        else if (!res.skipped) toast.success(`Approved · ${res.emrNumber}`);
      }
      return res;
    } catch (e) {
      toast.error(`Failed: ${e.message || e}`);
    } finally { setBusy(''); }
  };

  const reject = async (r) => {
    if (!window.confirm(`Reject ${r.surname} ${r.firstName}? They can register again.`)) return;
    setBusy(r.id);
    try { await rejectRegistration(r.id, who, role); toast.success('Rejected'); }
    catch (e) { toast.error(`Failed: ${e.message || e}`); }
    setBusy('');
  };

  const approveAll = async () => {
    if (!window.confirm(`Approve all ${list.length} pending registrations?`)) return;
    setBusy('all');
    let ok = 0;
    for (const r of list) {
      try { const res = await approveRegistration(r.id, who, role); if (res && res.emrNumber) ok++; }
      catch (_) {}
    }
    setBusy('');
    toast.success(`${ok} approved`);
  };

  return (
    <div className="page-content" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ fontWeight:800, fontSize:17 }}>Approve Registrations</div>
          <div style={{ fontSize:12, color:'var(--t3)' }}>
            Student self-registrations. Only approved students join the patient and set list.
          </div>
        </div>
        {list.length > 1 && (
          <button className="btn btn-primary" disabled={!!busy} onClick={approveAll}>
            Approve all ({list.length})
          </button>
        )}
      </div>

      {list.length === 0 && (
        <div className="card" style={{ padding:28, textAlign:'center', color:'var(--t3)' }}>
          <i className="ti ti-user-check" style={{ fontSize:32, display:'block', marginBottom:8, opacity:0.4 }} />
          No pending registrations
        </div>
      )}

      {list.map(r => {
        const c = sick[r.matricKey];
        return (
          <div key={r.id} className="card" style={{ padding:14, marginBottom:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:8, alignItems:'flex-start' }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15 }}>{r.surname} {r.firstName} {r.otherNames}</div>
                <div style={{ fontSize:12, color:'var(--t3)', marginTop:2 }}>
                  {r.matricNo} · {r.classSet}{r.level ? ` · ${r.level}` : ''} · {r.sex}
                </div>
              </div>
              {c && (
                <span style={{ background:'#fee2e2', color:'#b91c1c', fontSize:10, fontWeight:800,
                  padding:'3px 8px', borderRadius:20, whiteSpace:'nowrap' }}>REPORTED SICK</span>
              )}
            </div>
            <div style={{ fontSize:12, color:'var(--t2)', marginTop:8, lineHeight:1.6 }}>
              DOB: {r.dob || '—'} · Tel: {r.tel || '—'} · Blood: {r.bloodGroup || '—'}<br />
              Allergies: {r.allergies || 'none stated'}<br />
              Next of kin: {r.nextOfKin || '—'}{r.nextOfKinRel ? ` (${r.nextOfKinRel})` : ''} {r.nextOfKinTel || ''}
            </div>
            {c && (
              <div style={{ fontSize:12, background:'#fef2f2', borderRadius:8, padding:'8px 10px', marginTop:8 }}>
                <b style={{ textTransform:'capitalize' }}>{c.severity}</b>: {c.complaint}
                {c.duration ? ` · ${c.duration}` : ''}
                <div style={{ fontSize:11, color:'#b91c1c', marginTop:2 }}>
                  Nurses can't see this until you approve.
                </div>
              </div>
            )}
            <div style={{ display:'flex', gap:8, marginTop:10 }}>
              <button className="btn btn-primary" style={{ flex:2 }} disabled={!!busy} onClick={() => approve(r)}>
                {busy === r.id ? 'Working…' : 'Approve'}
              </button>
              <button className="btn" style={{ flex:1 }} disabled={!!busy} onClick={() => reject(r)}>Reject</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
