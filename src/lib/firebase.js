import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeApp as _initApp, getApps } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";        // ← add this

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
// Persistent on-device cache: data already downloaded is reused after reloads
// and across tabs instead of being re-read (and re-billed) from the server.
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  _db = getFirestore(app); // already initialised / cache unsupported in this browser
}
export const db = _db;
export const rtdb = getDatabase(app);
export const storage = getStorage(app);   // ← add this

// A second, separate sign-in session used ONLY to create staff logins.
// Creating a login on the main session signs the admin out and signs in the
// new person, so the admin could no longer save the new staff profile.
export function getStaffCreationAuth() {
  const NAME = 'staff-creation';
  const existing = getApps().find(a => a.name === NAME);
  return getAuth(existing || _initApp(firebaseConfig, NAME));
}

export default app;
