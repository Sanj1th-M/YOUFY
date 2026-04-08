import { create } from 'zustand';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../services/firebase';
import axios from 'axios';
import { BASE_URL } from '../constants/api';

// Google Auth Provider — request minimal scopes only
// email + profile is all we need — never request unnecessary permissions
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
// Force account selection even if user is already signed in
// Prevents session fixation — user explicitly chooses account
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Safe user object — only store what the UI needs
// NEVER store: raw tokens, refresh tokens, Firebase internal fields
function toSafeUser(firebaseUser) {
  if (!firebaseUser) return null;
  return {
    uid:         firebaseUser.uid,
    email:       firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL:    firebaseUser.photoURL,
    provider:    firebaseUser.providerData?.[0]?.providerId || 'unknown',
  };
}

function createFirebaseConfigError() {
  const error = new Error('Firebase is not configured');
  error.code = 'auth/configuration-not-found';
  return error;
}

const useAuthStore = create((set, get) => ({
  user:    null,
  loading: true,
  error:   null,

  // Called once on app start — listens to Firebase auth state
  init: () => {
    if (!isFirebaseConfigured || !auth) {
      set({ user: null, loading: false, error: null });
      return;
    }

    onAuthStateChanged(auth, (firebaseUser) => {
      set({ user: toSafeUser(firebaseUser), loading: false });
    });
  },

  // ── Email / Password Login ─────────────────────────────
  login: async (email, password) => {
    set({ error: null });
    try {
      if (!auth) throw createFirebaseConfigError();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      set({ user: toSafeUser(cred.user) });
    } catch (err) {
      // Store error code only — never raw Firebase error messages
      set({ error: err.code });
      throw err;
    }
  },

  // ── Email / Password Register ──────────────────────────
  register: async (email, password, displayName) => {
    set({ error: null });
    try {
      if (!auth) throw createFirebaseConfigError();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) await updateProfile(cred.user, { displayName });
      set({ user: toSafeUser(cred.user) });
    } catch (err) {
      set({ error: err.code });
      throw err;
    }
  },

  // ── Google Sign-In ─────────────────────────────────────
  // Flow:
  // 1. Firebase opens Google popup (official Google OAuth 2.0)
  // 2. User selects account and consents
  // 3. Firebase returns ID token (verified by Google)
  // 4. We send token to our backend for server-side verification
  // 5. Backend verifies with Firebase Admin SDK (checks issuer, audience, expiry)
  // 6. User stored in state — only safe fields
  loginWithGoogle: async () => {
    set({ error: null });
    try {
      if (!auth) throw createFirebaseConfigError();
      // signInWithPopup handles full OAuth 2.0 flow securely
      const result = await signInWithPopup(auth, googleProvider);

      // Get ID token — short-lived (1hr), cryptographically signed by Google
      const idToken = await result.user.getIdToken();

      // Send to backend for server-side verification
      // Backend uses Firebase Admin SDK to verify signature, issuer, audience, expiry
      await axios.post(`${BASE_URL}/auth/verify`, { idToken });

      // Store only safe user fields — never the token
      set({ user: toSafeUser(result.user) });

    } catch (err) {
      // User closed popup — not an error
      if (err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request') {
        set({ error: null });
        return;
      }
      set({ error: err.code });
      throw err;
    }
  },

  // ── Logout ─────────────────────────────────────────────
  // Revokes server-side tokens + signs out locally
  logout: async () => {
    if (!auth) {
      set({ user: null, error: null });
      return;
    }

    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        // Get token to send to backend for server-side revocation
        const idToken = await currentUser.getIdToken();
        // Backend revokes refresh tokens — old tokens become invalid even if stolen
        await axios.post(`${BASE_URL}/auth/logout`, { idToken }).catch(() => {});
      }
    } catch {
      // Continue with local logout even if server call fails
    }
    await signOut(auth);
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
