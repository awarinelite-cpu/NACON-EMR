import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Enter your email and password');
      return;
    }
    setLoading(true);
    try {
      const profile = await login(email, password);
      if (!profile) {
        toast.error('Account not found. Contact administrator.');
        return;
      }
      if (!profile.active) {
        toast.error('Account deactivated. Contact admin.');
        return;
      }
      toast.success(`Welcome, ${profile.displayName}!`);
      const dest = {
        doctor: '/doctor',
        nurse: '/nurse',
        records: '/records',
        admin: '/admin',
        subadmin: '/admin'
      }[profile.role] || '/doctor';
      navigate(dest);
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password' : 'Login failed. Try again.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex overflow-hidden bg-white">
      {/* Left Panel - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12 relative">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="flex flex-col items-center text-center mb-10">
            <div className="text-4xl mb-3">🏥</div>
            <h1 className="text-2xl font-bold text-gray-800">NIGERIAN ARMY MEDICAL CORPS</h1>
            <p className="text-sm text-gray-600">(NAMC)</p>
            
            <div className="my-6">
              <img 
                src="/nacon-crest.png" 
                alt="NACON Crest" 
                className="w-28 h-auto mx-auto"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <div className="hidden text-5xl">🛡️</div>
            </div>

            <h2 className="text-xl font-semibold text-gray-800">NIGERIAN ARMY COLLEGE OF NURSING</h2>
            <p className="text-sm text-gray-500">Medical Reception Station • Yaba, Lagos</p>
            <p className="text-xs text-gray-400 mt-1">Global-Care HMS v1.0.0</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">👤</span>
                <input
                  type="email"
                  className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-base"
                  placeholder="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔒</span>
                <input
                  type={showPass ? "text" : "password"}
                  className="w-full pl-12 pr-12 py-4 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-base"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Third field like in screenshot */}
            <div>
              <div className="relative">
                <input
                  type="text"
                  className="w-full px-4 py-4 border border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 text-base bg-gray-50"
                  value="Nigerian Army College of Nursing (NACON)"
                  disabled
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-medium text-lg transition-all disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Log In'}
            </button>
          </form>

          <div className="text-center mt-8 text-xs text-gray-400">
            Powered by App Global Technologies Limited
          </div>
        </div>
      </div>

      {/* Right Panel - Medical Background */}
      <div 
        className="hidden lg:block w-1/2 bg-cover bg-center relative"
        style={{
          backgroundImage: `url('https://picsum.photos/id/1015/1200/900')`
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/40 to-transparent" />
        <div className="absolute bottom-10 left-10 text-white">
          <p className="text-sm opacity-90">Secure Electronic Medical Records</p>
        </div>
      </div>
    </div>
  );
}
