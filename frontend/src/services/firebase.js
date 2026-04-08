import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  ...(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
    ? { measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID }
    : {}),
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(Boolean);

// Fix: app must exist before getAuth()/getFirestore() are called
// Module-level init so auth/db are always ready on import
function getFirebaseApp() {
  if (!isFirebaseConfigured) return null;
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function initFirebase() {
  return getFirebaseApp();
}

// Initialize at module level — prevents blank screen on first load
const app = getFirebaseApp();

if (!isFirebaseConfigured) {
  console.warn('[firebase] Web SDK disabled. Login and cloud sync stay off until VITE_FIREBASE_* values are set.');
}

export const auth = app ? getAuth(app) : null;
export const db   = app ? getFirestore(app) : null;
