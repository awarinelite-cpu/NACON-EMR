// src/lib/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './firebase';
import { getUser } from './emr';

const AuthContext = createContext(null);

// Accounts created without a display name used to make every save that signs
// with profile.displayName fail (Firestore rejects undefined fields). Always
// give the profile a usable name: saved name -> auth name -> email.
// Remember the signed-in profile on the device so a reload with no internet
// still opens the app instead of dropping to the login screen.
const PROFILE_KEY = uid => `nacon-profile-${uid}`;
function saveProfileLocally(uid, prof) {
  try { if (prof) localStorage.setItem(PROFILE_KEY(uid), JSON.stringify(prof)); } catch (_) {}
}
function loadProfileLocally(uid) {
  try { const s = localStorage.getItem(PROFILE_KEY(uid)); return s ? JSON.parse(s) : null; } catch (_) { return null; }
}

function withDisplayName(prof, fbUser) {
  if (!prof) return prof;
  if (!prof.displayName || !String(prof.displayName).trim()) {
    prof.displayName = prof.name || fbUser?.displayName || fbUser?.email || prof.email || 'Staff';
  }
  return prof;
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme]     = useState(() => localStorage.getItem('nacon-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('nacon-theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          let prof = null;
          try { prof = await getUser(firebaseUser.uid); }
          catch (err) {
            console.warn('[AuthContext] profile fetch failed, trying device copy:', err);
          }
          if (prof) saveProfileLocally(firebaseUser.uid, prof);
          else prof = loadProfileLocally(firebaseUser.uid);   // offline fallback
          // Attach the Firebase Auth UID onto the profile so components can use profile.uid
          if (prof) prof.uid = firebaseUser.uid;
          setProfile(withDisplayName(prof, firebaseUser));
        } else {
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('[AuthContext] Failed to load user profile:', err);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const prof = await getUser(cred.user.uid);
    if (prof) { prof.uid = cred.user.uid; saveProfileLocally(cred.user.uid, prof); }
    withDisplayName(prof, cred.user);
    setProfile(prof);
    return prof;
  };

  const logout = async () => {
    try {
      Object.keys(localStorage).filter(k => k.startsWith('nacon-profile-')).forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    await signOut(auth);
    setUser(null);
    setProfile(null);
  };

  const toggleTheme = () =>
    setTheme(t => (t === 'light' ? 'dark' : 'light'));

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      theme,
      login,
      logout,
      toggleTheme,
      role: profile?.role,        // ← convenience shortcut used by PatientProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
