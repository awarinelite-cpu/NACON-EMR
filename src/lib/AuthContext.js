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
          const prof = await getUser(firebaseUser.uid);
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
    if (prof) prof.uid = cred.user.uid;
    withDisplayName(prof, cred.user);
    setProfile(prof);
    return prof;
  };

  const logout = async () => {
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
