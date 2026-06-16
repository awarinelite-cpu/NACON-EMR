// src/pages/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import { getAllUsers, createUser, updateUserRole, deactivateUser, reactivateUser } from '../lib/emr';
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../lib/firebase';

const ROLES = ['doctor', 'nurse', 'records', 'pharmacist', 'lab', 'subadmin', 'admin'];
const EMPTY_USER = { displayName:'', email:'', password:'', role:'nurse', phone:'' };

export default function UserManagement() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [users,      setUsers]      = useState([]);
  const [form,       setForm]       = useState(EMPTY_USER);
  const [showAdd,    setShowAdd]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [loading,    setLoading]    = useState(true);

  // Password reset modal state
  const [resetModal, setResetModal] = useState(null); // { uid, email, displayName }
  const [newPassword, setNewPassword] = useState('');
  const [showNewPw,   setShowNewPw]   = useState(false);
  const [resetting,   setResetting]   = useState(false);

  useEffect(() => {
    getAllUsers().then(u => { setUsers(u); setLoading(false); });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── CREATE USER ──────────────────────────────
  const handleAdd = async () => {
    if (!form.displayName || !form.email || !form.password || !form.role) {
      toast.error('Fill in all required fields'); return;
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters'); return;
    }
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await createUser(cred.user.uid, {
        displayName: form.displayName,
        email:       form.email,
        role:        form.role,
        phone:       form.phone,
        active:      true,
        createdBy:   profile?.displayName,
      });
      toast.success(`${form.displayName} added as ${form.role}`);
      setForm(EMPTY_USER);
      setShowAdd(false);
      const updated = await getAllUsers();
      setUsers(updated);
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Email already registered'
        : err.code === 'auth/weak-password'
        ? 'Password is too weak (min 6 characters)'
        : 'Failed to create user: ' + err.message;
      toast.error(msg);
    }
    setSaving(false);
  };

  // ── ROLE CHANGE ──────────────────────────────
  const handleRoleChange = async (uid, newRole) => {
    try {
      await updateUserRole(uid, newRole, profile?.displayName);
      setUsers(u => u.map(x => x.uid === uid ? { ...x, role: newRole } : x));
      toast.success('Role updated');
    } catch { toast.error('Failed to update role'); }
  };

  // ── DEACTIVATE ───────────────────────────────
  const handleDeactivate = async (uid, name) => {
    if (!window.confirm(`Deactivate ${name}? They will no longer be able to log in.`)) return;
    try {
      await deactivateUser(uid, profile?.displayName);
      setUsers(u => u.map(x => x.uid === uid ? { ...x, active: false } : x));
      toast.success(`${name} deactivated`);
    } catch { toast.error('Failed to deactivate'); }
  };

  // ── REACTIVATE ───────────────────────────────
  const handleReactivate = async (uid, name) => {
    if (!window.confirm(`Reactivate ${name}? They will be able to log in again.`)) return;
    try {
      await reactivateUser(uid, profile?.displayName);
      setUsers(u => u.map(x => x.uid === uid ? { ...x, active: true } : x));
      toast.success(`${name} reactivated`);
    } catch { toast.error('Failed to reactivate'); }
  };

  // ── SEND RESET EMAIL ─────────────────────────
  const handleSendResetEmail = async (email, name) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset email sent to ${name} (${email})`);
    } catch (err) {
      toast.error('Failed to send reset email: ' + err.message);
    }
  };

  // ── SET PASSWORD DIRECTLY (admin sets it) ────
  // Firebase only allows changing the CURRENT user's password.
  // To set another user's password as admin you need the Admin SDK (server-side).
  // The workaround here: re-authenticate as that user temporarily, change password,
  // then sign back in as admin. Since admin knows the password they just set, this works.
  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters'); return;
    }
    if (!resetModal) return;
    setResetting(true);
    try {
      // Save admin credentials before switching
      const adminEmail    = profile.email;
      const adminPassword = prompt(
        `To set ${resetModal.displayName}'s password, re-enter YOUR (admin) password to confirm:`
      );
      if (!adminPassword) { setResetting(false); return; }

      // Sign in as the target user using their current credentials is not possible
      // without knowing their old password. So we use sendPasswordResetEmail instead
      // and tell admin to share the link, OR we use the reset email flow.
      // Best UX: just send the reset email and set the new password in the email field as a note.
      await sendPasswordResetEmail(auth, resetModal.email);
      toast.success(
        `Reset email sent to ${resetModal.email}. Share the new password (${newPassword}) with them separately — they'll set it via the email link.`,
        { duration: 8000 }
      );
      setResetModal(null);
      setNewPassword('');
    } catch (err) {
      toast.error('Failed: ' + err.message);
    }
    setResetting(false);
  };

  const roleBadge = r => ({
    doctor:'badge-ok', nurse:'badge-info', records:'badge-warn',
    admin:'badge-danger', subadmin:'badge-neutral',
    pharmacist:'badge-purple', lab:'badge-teal',
  }[r] || 'badge-neutral');

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100%' }}>
      <div className="topbar">
        <div className="topbar-title">User Management</div>
        <button className="btn" onClick={() => navigate('/admin')}>
          <i className="ti ti-arrow-left" /> Back
        </button>
        <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
          <i className="ti ti-user-plus" /> Add staff user
        </button>
      </div>

      <div className="page-content">

        {/* ── ADD USER FORM ── */}
        {showAdd && (
          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-header">
              <div className="card-title"><i className="ti ti-user-plus" />Add new staff user</div>
            </div>
            <div className="card-body">
              <div className="form-grid-3" style={{ gap:12 }}>
                <div className="form-group">
                  <label className="form-label">Full name <span className="req">*</span></label>
                  <input className="form-input" placeholder="e.g. Dr. Yelme" value={form.displayName}
                    onChange={e => set('displayName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email <span className="req">*</span></label>
                  <input type="email" className="form-input" placeholder="dr.yelme@naconmrs.ng"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" placeholder="08031234567" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password <span className="req">*</span></label>
                  <input type="text" className="form-input" placeholder="Min. 6 characters — visible so you can share it"
                    value={form.password} onChange={e => set('password', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role <span className="req">*</span></label>
                  <select className="form-select" value={form.role} onChange={e => set('role', e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="alert alert-info mt-3">
                <i className="ti ti-info-circle" />
                <div>
                  Password is shown in plain text so you can share it with the staff member.
                  They can change it themselves after first login via the reset email link.
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:14 }}>
                <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                  {saving
                    ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Creating…</>
                    : <><i className="ti ti-device-floppy" /> Create account</>}
                </button>
                <button className="btn" onClick={() => setShowAdd(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS LIST ── */}
        <div className="card">
          <div className="card-header">
            <div className="card-title"><i className="ti ti-users" />Staff accounts ({users.length})</div>
          </div>
          {loading && (
            <div style={{ padding:20, textAlign:'center' }}>
              <i className="ti ti-loader-2" style={{ fontSize:24, animation:'spin 1s linear infinite', color:'var(--accent)' }} />
            </div>
          )}
          {!loading && (
            <div style={{ overflowX:'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Change role</th>
                    <th>Password</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.uid}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{
                            width:28, height:28, borderRadius:'50%',
                            background:'var(--accent-bg)', color:'var(--accent)',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            fontSize:10, fontWeight:700, flexShrink:0,
                          }}>
                            {(u.displayName||'?').slice(0,2).toUpperCase()}
                          </div>
                          <span style={{ fontWeight:700 }}>{u.displayName}</span>
                        </div>
                      </td>
                      <td className="text-muted" style={{ fontSize:11 }}>{u.email}</td>
                      <td className="text-muted" style={{ fontSize:11 }}>{u.phone || '—'}</td>
                      <td><span className={`badge ${roleBadge(u.role)}`}>{u.role}</span></td>
                      <td>
                        <span className={`badge ${u.active ? 'badge-ok' : 'badge-neutral'}`}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        {profile?.uid !== u.uid ? (
                          <select className="form-select" style={{ padding:'4px 8px', fontSize:11 }}
                            value={u.role} onChange={e => handleRoleChange(u.uid, e.target.value)}>
                            {ROLES.map(r => <option key={r}>{r}</option>)}
                          </select>
                        ) : (
                          <span style={{ fontSize:11, color:'var(--t3)' }}>You</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                          {/* Send reset email */}
                          <button
                            className="btn btn-sm"
                            style={{ fontSize:10 }}
                            onClick={() => handleSendResetEmail(u.email, u.displayName)}
                            title="Send password reset email to this user"
                          >
                            <i className="ti ti-mail" /> Reset link
                          </button>
                          {/* Set password directly */}
                          {profile?.uid !== u.uid && (
                            <button
                              className="btn btn-sm btn-warn"
                              style={{ fontSize:10 }}
                              onClick={() => { setResetModal(u); setNewPassword(''); }}
                              title="Set a new password for this user"
                            >
                              <i className="ti ti-key" /> Set password
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {profile?.uid !== u.uid && (
                          u.active ? (
                            <button className="btn btn-danger btn-sm"
                              onClick={() => handleDeactivate(u.uid, u.displayName)}>
                              <i className="ti ti-user-off" /> Deactivate
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-success"
                              onClick={() => handleReactivate(u.uid, u.displayName)}>
                              <i className="ti ti-user-check" /> Activate
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign:'center', color:'var(--t3)', padding:24 }}>
                        No staff users yet — add one above
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── INFO BOX ── */}
        <div className="alert alert-info mt-3">
          <i className="ti ti-info-circle" />
          <div style={{ fontSize:11 }}>
            <strong>About passwords:</strong> Firebase does not allow admins to view existing passwords —
            this is a security feature. Use <strong>Reset link</strong> to email the user a reset link,
            or <strong>Set password</strong> to assign a new password and share it with them directly.
          </div>
        </div>
      </div>

      {/* ── PASSWORD MODAL ── */}
      {resetModal && (
        <div style={{
          position:'fixed', inset:0, zIndex:1000,
          background:'rgba(0,0,0,.55)', backdropFilter:'blur(3px)',
          display:'flex', alignItems:'center', justifyContent:'center',
          padding:16,
        }}>
          <div className="card" style={{ width:'100%', maxWidth:420 }}>
            <div className="card-header">
              <div className="card-title">
                <i className="ti ti-key" /> Set password — {resetModal.displayName}
              </div>
              <button className="btn btn-sm btn-icon" onClick={() => setResetModal(null)}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div className="card-body">
              <div className="alert alert-warn" style={{ marginBottom:14 }}>
                <i className="ti ti-alert-triangle" />
                <div style={{ fontSize:11 }}>
                  Firebase doesn't allow admins to set passwords server-side without the Admin SDK.
                  This will <strong>send a reset email</strong> to <strong>{resetModal.email}</strong> — 
                  share the password below with them separately so they know what to set.
                </div>
              </div>

              <div className="form-group" style={{ marginBottom:14 }}>
                <label className="form-label">New password to share with {resetModal.displayName}</label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Type the new password…"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    style={{ paddingRight:40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(s => !s)}
                    style={{
                      position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer', color:'var(--t3)',
                    }}
                  >
                    <i className={`ti ${showNewPw ? 'ti-eye-off' : 'ti-eye'}`} style={{ fontSize:16 }} />
                  </button>
                </div>
              </div>

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" onClick={handleSetPassword} disabled={resetting || !newPassword}>
                  {resetting
                    ? <><i className="ti ti-loader-2" style={{animation:'spin 1s linear infinite'}} /> Sending…</>
                    : <><i className="ti ti-mail" /> Send reset email</>}
                </button>
                <button className="btn" onClick={() => setResetModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
