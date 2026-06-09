// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';



export default function LoginPage() {
  const { login, toggleTheme, theme } = useAuth();
  const navigate = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
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
    <div style={{
      minHeight: '100vh',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      overflow: 'hidden',
    }}>

      {/* ── FULL-SCREEN BUILDING BACKGROUND ── */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: 'url(/building.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        zIndex: 0,
      }} />

      {/* ── DARK OVERLAY to deepen contrast ── */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: 'linear-gradient(135deg, rgba(6,15,30,0.72) 0%, rgba(11,31,58,0.65) 60%, rgba(6,15,30,0.78) 100%)',
        zIndex: 1,
      }} />

      {/* ── THEME TOGGLE ── */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 10,
          background: 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 10, padding: '7px 14px',
          color: '#D6E8F8', cursor: 'pointer',
          fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(8px)',
          fontFamily: 'var(--font)',
          transition: 'all .18s',
        }}
      >
        <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`} style={{ fontSize: 15 }} />
        {theme === 'light' ? 'Dark' : 'Light'}
      </button>

      {/* ── GLASS LOGIN CARD ── */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: '100%', maxWidth: 420,
        background: 'rgba(11, 31, 58, 0.55)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        border: '1px solid rgba(133, 183, 235, 0.20)',
        borderRadius: 20,
        boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>

        {/* Card header — institution branding */}
        <div style={{
          background: 'rgba(6,15,30,0.50)',
          borderBottom: '1px solid rgba(133,183,235,0.15)',
          padding: '24px 28px 20px',
          textAlign: 'center',
        }}>
          {/* Crest icon */}
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(26,95,168,0.35)',
            border: '2px solid rgba(133,183,235,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 0 20px rgba(26,95,168,0.25)',
          }}>
            <i className="ti ti-shield-heart" style={{ fontSize: 30, color: '#85B7EB' }} />
          </div>

          <div style={{
            fontSize: 13, fontWeight: 700,
            color: '#D6E8F8',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            lineHeight: 1.4,
            marginBottom: 5,
          }}>
            Nigerian Army College of Nursing
          </div>
          <div style={{ fontSize: 11, color: 'rgba(133,183,235,0.75)', fontWeight: 500 }}>
            Medical Reception Station · Yaba, Lagos
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(26,122,74,0.25)', color: '#6EE7A8',
              border: '1px solid rgba(26,122,74,0.4)',
              fontSize: 10, fontWeight: 700,
              padding: '3px 10px', borderRadius: 8,
            }}>
              <i className="ti ti-device-mobile" style={{ fontSize: 11 }} /> PWA · Works offline
            </span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'rgba(26,85,163,0.25)', color: '#85B7EB',
              border: '1px solid rgba(26,85,163,0.35)',
              fontSize: 10, fontWeight: 700,
              padding: '3px 10px', borderRadius: 8,
            }}>
              v1.0
            </span>
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleLogin} noValidate style={{ padding: '24px 28px 28px' }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#E8EFF8',
            marginBottom: 4,
          }}>
            Sign in
          </div>
          <p style={{
            fontSize: 11, color: 'rgba(133,183,235,0.65)',
            fontWeight: 500, marginBottom: 20,
          }}>
            NACON MRS EMR — Confidential access only
          </p>

          {/* Email */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Staff email</label>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-mail" style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16, color: 'rgba(133,183,235,0.5)',
                pointerEvents: 'none',
              }} />
              <input
                type="email"
                placeholder="dr.yelme@naconmrs.ng"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                style={{ ...glassInput, paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <i className="ti ti-lock" style={{
                position: 'absolute', left: 11, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 16, color: 'rgba(133,183,235,0.5)',
                pointerEvents: 'none',
              }} />
              <input
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ ...glassInput, paddingLeft: 36, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPass(s => !s)}
                style={{
                  position: 'absolute', right: 10, top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none',
                  cursor: 'pointer', color: 'rgba(133,183,235,0.5)',
                  fontSize: 16, padding: 0, lineHeight: 1,
                }}
              >
                <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} />
              </button>
            </div>
          </div>



          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 20px',
              background: loading
                ? 'rgba(26,95,168,0.4)'
                : 'linear-gradient(135deg, #1A5FA8 0%, #2E7FDB 100%)',
              border: '1px solid rgba(46,127,219,0.5)',
              borderRadius: 10,
              color: '#FFFFFF',
              fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font)',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(26,95,168,0.4)',
              transition: 'all .2s',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? (
              <>
                <i className="ti ti-loader-2" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }} />
                Signing in…
              </>
            ) : (
              <>
                <i className="ti ti-login" style={{ fontSize: 16 }} />
                Sign in to EMR
              </>
            )}
          </button>

          {/* Footer note */}
          <div style={{
            textAlign: 'center', marginTop: 16,
            fontSize: 10, color: 'rgba(133,183,235,0.45)',
            fontWeight: 500, lineHeight: 1.7,
          }}>
            Forgot password? Contact your system administrator.<br />
            <span style={{ color: 'rgba(133,183,235,0.6)', fontWeight: 700 }}>
              RESTRICTED — Not to be handled by patients
            </span>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0 1000px rgba(11,31,58,0.85) inset !important;
          -webkit-text-fill-color: #D6E8F8 !important;
          caret-color: #D6E8F8;
        }
      `}</style>
    </div>
  );
}

/* ── Shared style objects ── */
const labelStyle = {
  display: 'block',
  fontSize: 10, fontWeight: 700,
  color: 'rgba(133,183,235,0.75)',
  textTransform: 'uppercase',
  letterSpacing: '.05em',
  marginBottom: 6,
};

const glassInput = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(133,183,235,0.20)',
  borderRadius: 9,
  fontSize: 13, fontWeight: 700,
  color: '#D6E8F8',
  fontFamily: 'var(--font)',
  outline: 'none',
  transition: 'border-color .15s, background .15s',
  boxSizing: 'border-box',
};
