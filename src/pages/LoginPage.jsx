// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';

const ROLES = [
  { value: 'doctor',   label: 'Doctor',    icon: 'ti-stethoscope' },
  { value: 'nurse',    label: 'Nurse',     icon: 'ti-heart-rate-monitor' },
  { value: 'records',  label: 'Records',   icon: 'ti-folder' },
  { value: 'admin',    label: 'Admin',     icon: 'ti-shield-lock' },
  { value: 'subadmin', label: 'Sub-admin', icon: 'ti-user-cog' },
];

export default function LoginPage() {
  const { login, toggleTheme, theme } = useAuth();
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState('doctor');
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Enter your email and password'); return; }
    setLoading(true);
    try {
      const profile = await login(email, password);
      if (!profile) { toast.error('Account not found. Contact administrator.'); setLoading(false); return; }
      if (!profile.active) { toast.error('Account deactivated. Contact admin.'); setLoading(false); return; }
      toast.success(`Welcome, ${profile.displayName}!`);
      const dest = { doctor:'/doctor', nurse:'/nurse', records:'/records', admin:'/admin', subadmin:'/admin' }[profile.role] || '/doctor';
      navigate(dest);
    } catch (err) {
      toast.error(
        err.code === 'auth/invalid-credential' ? 'Invalid email or password' :
        err.code === 'auth/too-many-requests'  ? 'Too many attempts. Try later.' :
        'Login failed. Try again.'
      );
    }
    setLoading(false);
  };

  return (
    <div className="login-page" style={{ position: 'relative' }}>
      <div className="login-hero">
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div className="login-crest"><i className="ti ti-shield-heart" /></div>
          <div>
            <div className="login-school-name">NIGERIAN ARMY COLLEGE OF NURSING</div>
            <div className="login-school-sub">Medical Reception Station · Yaba, Lagos</div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <span className="pwa-pill"><i className="ti ti-device-mobile" style={{fontSize:12}} /> PWA — works offline</span>
              <span className="pwa-pill" style={{background:'var(--info-bg)',color:'var(--info)',borderColor:'var(--info)'}}>v1.0</span>
            </div>
          </div>
        </div>
        <button onClick={toggleTheme} aria-label="Toggle theme" style={{
          position:'absolute',top:14,right:14,background:'rgba(255,255,255,.1)',
          border:'1px solid rgba(255,255,255,.2)',borderRadius:8,padding:'6px 10px',
          color:'#B5D4F4',cursor:'pointer',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',gap:6
        }}>
          <i className={`ti ${theme==='light'?'ti-moon':'ti-sun'}`} style={{fontSize:16}} />
          {theme==='light'?'Dark':'Light'}
        </button>
      </div>

      <div className="login-body">
        <form className="login-card" onSubmit={handleLogin} noValidate>
          <h2 style={{marginBottom:4}}>Sign in</h2>
          <p className="text-muted text-sm" style={{marginBottom:20}}>NACON MRS EMR — Confidential access only</p>

          <div className="form-group" style={{marginBottom:14}}>
            <label className="form-label" htmlFor="em">Staff email</label>
            <input id="em" type="email" className="form-input" placeholder="dr.yelme@naconmrs.ng"
              value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required />
          </div>

          <div className="form-group" style={{marginBottom:18}}>
            <label className="form-label" htmlFor="pw">Password</label>
            <div style={{position:'relative'}}>
              <input id="pw" type={showPass?'text':'password'} className="form-input full-width"
                placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)}
                autoComplete="current-password" required />
              <button type="button" onClick={()=>setShowPass(s=>!s)} aria-label="Toggle password"
                style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
                  background:'none',border:'none',cursor:'pointer',color:'var(--t3)'}}>
                <i className={`ti ${showPass?'ti-eye-off':'ti-eye'}`} style={{fontSize:16}} />
              </button>
            </div>
          </div>

          <div className="form-group" style={{marginBottom:20}}>
            <label className="form-label">Your role</label>
            <div className="role-grid">
              {ROLES.map(r => (
                <button key={r.value} type="button"
                  className={`role-btn ${role===r.value?'selected':''}`}
                  onClick={()=>setRole(r.value)}>
                  <i className={`ti ${r.icon}`} style={{fontSize:14,display:'block',marginBottom:3}} />
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted" style={{marginTop:6}}>Access is verified from your account record.</p>
          </div>

          <button type="submit" className="btn btn-navy full-width btn-lg" disabled={loading}>
            {loading
              ? <><i className="ti ti-loader-2" style={{fontSize:16,animation:'spin 1s linear infinite'}} /> Signing in…</>
              : <><i className="ti ti-login" style={{fontSize:16}} /> Sign in to EMR</>}
          </button>

          <div style={{textAlign:'center',marginTop:16,fontSize:11,color:'var(--t3)',fontWeight:500}}>
            Forgot password? Contact your system administrator.<br/>
            <strong style={{color:'var(--t2)'}}>RESTRICTED — Not to be handled by patients</strong>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
