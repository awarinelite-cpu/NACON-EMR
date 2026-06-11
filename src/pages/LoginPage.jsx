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
      if (!profile)        { toast.error('Account not found. Contact administrator.'); setLoading(false); return; }
      if (!profile.active) { toast.error('Account deactivated. Contact admin.');       setLoading(false); return; }
      toast.success(`Welcome, ${profile.displayName}!`);
      const dest = {
        doctor:'doctor', nurse:'nurse', records:'records',
        admin:'admin', subadmin:'admin',
      }[profile.role] || 'doctor';
      navigate(`/${dest}`);
    } catch (err) {
      toast.error(
        err.code === 'auth/invalid-credential' ? 'Invalid email or password' :
        err.code === 'auth/too-many-requests'  ? 'Too many attempts. Try later.' :
        'Login failed. Please try again.'
      );
    }
    setLoading(false);
  };

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Full page — NACON building as background ── */
        .lp-root {
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          position: relative;
          /* The actual NACON building photo */
          background: url('/building.jpg') center / cover no-repeat fixed;
        }

        /* Dark overlay so the card is readable while building stays visible */
        .lp-root::before {
          content: '';
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.38);
          pointer-events: none;
          z-index: 0;
        }

        /* ── Centered floating transparent card ── */
        .lp-card {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 340px;
          /* Transparent so building shows through */
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.30);
          border-radius: 12px;
          padding: 32px 28px 26px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: fadeIn 0.5s ease both;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
        }

        /* ── Hospital icon ── */
        .lp-icon {
          font-size: 42px;
          color: #FFFFFF;
          margin-bottom: 10px;
          line-height: 1;
          text-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }

        /* ── School name ── */
        .lp-name {
          font-family: Arial, sans-serif;
          font-size: 13.5px;
          font-weight: 700;
          color: #FFFFFF;
          text-align: center;
          line-height: 1.45;
          margin-bottom: 14px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          text-shadow: 0 1px 6px rgba(0,0,0,0.5);
        }

        /* ── NACON crest image ── */
        .lp-crest-img {
          width: 100px;
          height: 100px;
          object-fit: contain;
          border-radius: 50%;
          margin-bottom: 20px;
          border: none;
          background: transparent;
          padding: 0;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.45));
        }

        /* Fallback crest */
        .lp-crest-fallback {
          width: 86px;
          height: 86px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.4);
          background: rgba(11,31,58,0.6);
          display: none;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .lp-crest-fallback i { font-size: 36px; color: #85B7EB; }

        /* ── Input fields ── */
        .lp-field {
          width: 100%;
          margin-bottom: 10px;
          position: relative;
        }

        .lp-field-icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 16px;
          color: rgba(255,255,255,0.75);
          pointer-events: none;
          z-index: 1;
        }

        .lp-input {
          width: 100%;
          padding: 11px 12px 11px 36px;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 6px;
          font-size: 14px;
          color: #FFFFFF;
          background: rgba(255, 255, 255, 0.15);
          font-family: Arial, sans-serif;
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }

        .lp-input:focus {
          border-color: rgba(255, 255, 255, 0.70);
          background: rgba(255, 255, 255, 0.22);
        }

        .lp-input::placeholder {
          color: rgba(255, 255, 255, 0.60);
        }

        /* Eye toggle */
        .lp-eye {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.70);
          padding: 0;
          line-height: 1;
          font-size: 16px;
          z-index: 1;
        }

        /* ── Log In button ── */
        .lp-btn {
          width: 100%;
          padding: 12px;
          background: #1A7EE6;
          color: #FFFFFF;
          border: none;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          font-family: Arial, sans-serif;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 2px;
          transition: background 0.15s, transform 0.1s;
          box-shadow: 0 2px 10px rgba(26,126,230,0.45);
        }

        .lp-btn:hover:not(:disabled) { background: #1565C0; }
        .lp-btn:active:not(:disabled) { transform: scale(0.99); }
        .lp-btn:disabled { opacity: 0.65; cursor: not-allowed; }

        /* ── Footer note ── */
        .lp-footer {
          margin-top: 14px;
          font-size: 10px;
          color: rgba(255,255,255,0.65);
          text-align: center;
          line-height: 1.6;
          font-family: Arial, sans-serif;
        }

        .lp-footer strong {
          color: rgba(255,255,255,0.85);
        }

        /* ── Theme toggle ── */
        .lp-theme {
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 10;
          background: rgba(0,0,0,0.40);
          border: 1px solid rgba(255,255,255,0.25);
          border-radius: 6px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          color: rgba(255,255,255,0.85);
          font-family: Arial, sans-serif;
          transition: background 0.15s;
        }

        .lp-theme:hover { background: rgba(0,0,0,0.55); }

        /* ── Dark mode — deepen the overlay ── */
        [data-theme="dark"] .lp-root::before {
          background: rgba(0, 0, 0, 0.58);
        }

        /* ── Responsive ── */
        @media (max-width: 480px) {
          .lp-card { padding: 26px 20px 22px; }
          .lp-name { font-size: 12.5px; }
        }
      `}</style>

      <div className="lp-root">

        {/* Theme toggle */}
        <button className="lp-theme" onClick={toggleTheme} aria-label="Toggle theme">
          <i className={`ti ${theme === 'light' ? 'ti-moon' : 'ti-sun'}`} style={{ fontSize: 13 }} />
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>

        {/* Centered transparent card */}
        <div className="lp-card">

          {/* Hospital icon */}
          <i className="ti ti-building-hospital lp-icon" aria-hidden="true" />

          {/* School name */}
          <div className="lp-name">
            NIGERIAN ARMY COLLEGE OF NURSING<br />(NACON)
          </div>

          {/* Crest — actual NACON crest image in public/nacon-crest.png */}
          <img
            src="/nacon-crest.png"
            alt="NACON Crest"
            className="lp-crest-img"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling.style.display = 'flex';
            }}
          />
          <div className="lp-crest-fallback">
            <i className="ti ti-shield-heart" />
          </div>

          {/* Form */}
          <form style={{ width: '100%' }} onSubmit={handleLogin} noValidate>

            {/* Email */}
            <div className="lp-field">
              <i className="ti ti-user lp-field-icon" aria-hidden="true" />
              <input
                type="email"
                className="lp-input"
                placeholder="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div className="lp-field">
              <i className="ti ti-lock lp-field-icon" aria-hidden="true" />
              <input
                type={showPass ? 'text' : 'password'}
                className="lp-input"
                placeholder="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                style={{ paddingRight: 38 }}
              />
              <button
                type="button"
                className="lp-eye"
                onClick={() => setShowPass(s => !s)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                <i className={`ti ${showPass ? 'ti-eye-off' : 'ti-eye'}`} />
              </button>
            </div>

            {/* Submit */}
            <button type="submit" className="lp-btn" disabled={loading}>
              {loading
                ? <><i className="ti ti-loader-2" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }} /> Signing in…</>
                : 'Log In'
              }
            </button>

          </form>

          <div className="lp-footer">
            Forgot password? Contact your system administrator.<br />
            <strong>RESTRICTED — Not to be handled by patients</strong>
          </div>

        </div>
      </div>
    </>
  );
}
