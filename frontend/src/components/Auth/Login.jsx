import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { isFirebaseConfigured } from '../../services/firebase';

// Max lengths — prevents oversized inputs reaching Firebase
const MAX_EMAIL    = 254; // RFC 5321 max email length
const MAX_PASSWORD = 128;

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [gLoading, setGLoading] = useState(false);
  const [error,    setError]    = useState('');

  const login            = useAuthStore(s => s.login);
  const loginWithGoogle  = useAuthStore(s => s.loginWithGoogle);
  const navigate         = useNavigate();
  const authDisabled     = !isFirebaseConfigured;

  // ── Email login ──────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (authDisabled) {
      setError('Firebase web config is missing in this app.');
      return;
    }

    // Client-side length validation — secondary to server validation
    if (email.length > MAX_EMAIL || password.length > MAX_PASSWORD) {
      setError('Input too long.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  // ── Google Sign-In ───────────────────────────────────────
  const handleGoogle = async () => {
    setError('');

    if (authDisabled) {
      setError('Firebase web config is missing in this app.');
      return;
    }

    setGLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      // Only show error if it's not user-cancelled
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(friendlyError(err?.code));
      }
    } finally {
      setGLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg?v=2" alt="Youfy" className="w-16 h-16 object-contain mb-1" />
          <h1 className="text-white text-2xl font-bold">Youfy</h1>
          <p className="text-gray-400 text-sm mt-1">Log in to your account</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3
                          text-red-400 text-sm mb-4">
            {error}
          </div>
        )}

        {authDisabled && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3
                          text-amber-300 text-sm mb-4">
            Firebase web config is missing. You can still explore the app and use local playlists.
          </div>
        )}

        {/* Google Sign-In button */}
        <button
          onClick={handleGoogle}
          disabled={authDisabled || gLoading || loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-800
                     font-semibold py-3 rounded-full mb-4 hover:bg-gray-100
                     transition-colors disabled:opacity-50"
        >
          {gLoading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent
                            rounded-full animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          {gLoading ? 'Signing in...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-subtle" />
          <span className="text-gray-500 text-xs">or</span>
          <div className="flex-1 h-px bg-subtle" />
        </div>

        {/* Email / Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Email</label>
            <input
              type="email"
              required
              disabled={authDisabled}
              maxLength={MAX_EMAIL}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full bg-elevated text-white rounded-lg px-4 py-3 text-sm
                         border border-subtle focus:border-[#FCFFF9] outline-none transition-colors"
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 mb-1.5 block">Password</label>
            <input
              type="password"
              required
              disabled={authDisabled}
              maxLength={MAX_PASSWORD}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full bg-elevated text-white rounded-lg px-4 py-3 text-sm
                         border border-subtle focus:border-[#FCFFF9] outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={authDisabled || loading || gLoading}
            className="w-full bg-[#FCFFF9] text-black font-bold py-3 rounded-full
                       hover:scale-105 transition-transform
                       disabled:opacity-50 disabled:scale-100"
          >
            {authDisabled ? 'Firebase Config Needed' : loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>

        <p className="text-center text-gray-400 text-sm mt-6">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#FCFFF9] hover:underline font-medium">
            Sign up
          </Link>
        </p>

        <p className="text-center mt-4">
          <Link to="/" className="text-gray-500 text-sm hover:text-gray-300 transition-colors">
            Continue without account →
          </Link>
        </p>
      </div>
    </div>
  );
}

// Google's official brand icon — SVG inline so no external fetch needed
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

// Friendly errors — deliberately vague to prevent user enumeration
// Never say "email not found" — attacker learns valid emails
function friendlyError(code) {
  const map = {
    'auth/invalid-email':         'Invalid email or password.',
    'auth/user-not-found':        'Invalid email or password.',  // intentionally same
    'auth/wrong-password':        'Invalid email or password.',  // intentionally same
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/invalid-credential':    'Invalid email or password.',
    'auth/configuration-not-found':'This sign-in method is not enabled in Firebase Authentication.',
    'auth/unauthorized-domain':   'This device opened the app from a domain or IP that Firebase Authentication does not trust yet.',
    'auth/user-disabled':         'This account has been disabled.',
    'auth/popup-blocked':         'Popup was blocked. Allow popups for this site.',
    'auth/network-request-failed':'Network error. Check your connection.',
  };
  return map[code] || 'Login failed. Please try again.';
}
