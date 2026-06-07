// src/pages/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';
import { getAllUsers, createUser, updateUserRole, deactivateUser } from '../lib/emr';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';

const ROLES = ['doctor', 'nurse', 'records', 'subadmin', 'admin'];

const EMPTY_USER = { displayName:'', email:'', password:'', role:'nurse', phone:'' };

export default function UserManagement() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const [users,   setUsers]   = useState([]);
  const [form,    setForm]    = useState(EMPTY_USER);
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllUsers().then(u => { setUsers(u); setLoading(false); });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAdd = async () => {
    if (!form.displayName || !form.email || !form.password || !form.role) {
      toast.error('Fill in all required fields'); return;
    }
    if (form.password.length < 8) {
      toast.error('Password must be at least 8 characters'); return;
    }
    setSaving(true);
    try {
      // Create Firebase Auth account
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      // Save profile to Firestore
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
      // Refresh list
      const updated = await getAllUsers();
      setUsers(updated);
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'Email already registered' : 'Failed to create user';
      toast.error(msg);
    }
    setSaving(false);
  };

  const handleRoleChange = async (uid, newRole) => {
    try {
      await updateUserRole(uid, newRole, profile?.displayName);
      setUsers(u => u.map(x => x.uid===uid ? {...x, role:newRole} : x));
      toast.success('Role updated');
    } catch { toast.error('Failed to update role'); }
  };

  const handleDeactivate = async (uid, name) => {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    try {
      await deactivateUser(uid, profile?.displayName);
      setUsers(u => u.map(x => x.uid===uid ? {...x, active:false} : x));
      toast.success(`${name} deactivated`);
    } catch { toast.error('Failed to deactivate'); }
  };

  const roleBadge = r => ({
    doctor:'badge-ok', nurse:'badge-info', records:'badge-warn',
    admin:'badge-danger', subadmin:'badge-neutral',
  }[r]||'badge-neutral');

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
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

        {/* Add user form */}
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
                  <input type="email" className="form-input" placeholder="dr.yelme@naconmrs.ng" value={form.email}
                    onChange={e => set('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" placeholder="08031234567" value={form.phone}
                    onChange={e => set('phone', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password <span className="req">*</span></label>
                  <input type="password" className="form-input" placeholder="Min. 8 characters" value={form.password}
                    onChange={e => set('password', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role <span className="req">*</span></label>
                  <select className="form-select" value={form.role} onChange={e => set('role', e.target.value)}>
                    {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="alert alert-warn mt-3">
                <i className="ti ti-alert-triangle" />
                The password you set will be sent to the staff member. They can change it after first login.
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

        {/* Users list */}
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
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Change role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.uid}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--accent-bg)',
                          color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:10, fontWeight:700, flexShrink:0 }}>
                          {(u.displayName||'?').slice(0,2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight:700 }}>{u.displayName}</span>
                      </div>
                    </td>
                    <td className="text-muted">{u.email}</td>
                    <td><span className={`badge ${roleBadge(u.role)}`}>{u.role}</span></td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-ok' : 'badge-neutral'}`}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {profile?.uid !== u.uid && (
                        <select className="form-select" style={{ padding:'4px 8px', fontSize:11 }}
                          value={u.role} onChange={e => handleRoleChange(u.uid, e.target.value)}>
                          {ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {profile?.uid !== u.uid && u.active && (
                        <button className="btn btn-danger btn-sm"
                          onClick={() => handleDeactivate(u.uid, u.displayName)}>
                          <i className="ti ti-user-off" /> Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign:'center', color:'var(--t3)' }}>No staff users yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
