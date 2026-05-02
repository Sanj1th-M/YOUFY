const { Router } = require('express');
const admin = require('../config/firebase');
const { sanitizeString } = require('../middleware/validate');
const r = Router();

/**
 * POST /auth/verify
 * Called after Google Sign-In on frontend.
 * Receives Firebase ID token, verifies it server-side,
 * returns safe user profile. NEVER returns sensitive fields.
 *
 * Security: Firebase Admin SDK validates:
 *   - Token signature (Google public keys)
 *   - Issuer (accounts.google.com or securetoken.google.com)
 *   - Audience (your Firebase project ID)
 *   - Expiry (not expired — 1hr max)
 * This is equivalent to Google's recommended server-side verification.
 */
r.post('/verify', async (req, res) => {
  const { idToken } = req.body;

  // Validate token exists and is a string
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    // Firebase Admin verifies token cryptographically
    // Checks: signature, issuer, audience, expiry — all OWASP requirements
    const decoded = await admin.auth().verifyIdToken(idToken, true); // checkRevoked=true

    // Return only safe, non-sensitive user fields
    // NEVER return: tokens, internal Firebase fields, raw decoded payload
    const safeUser = {
      uid:         decoded.uid,
      email:       sanitizeString(decoded.email || '', 200),
      displayName: sanitizeString(decoded.name || '', 100),
      photoURL:    decoded.picture || null,
      provider:    decoded.firebase?.sign_in_provider || 'unknown',
    };

    res.json({ user: safeUser });
  } catch (err) {
    // Log server-side only — never expose to client
    console.error('[auth/verify] token verification failed:', err.code || err.message);

    // Generic error — don't leak WHY it failed (prevents token probing)
    res.status(401).json({ error: 'Authentication failed' });
  }
});

/**
 * POST /auth/logout
 * Revokes the user's refresh tokens server-side.
 * Even if attacker has old tokens, they become invalid.
 */
r.post('/logout', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken, true); // checkRevoked=true
    // Revoke all refresh tokens — server-side logout
    await admin.auth().revokeRefreshTokens(decoded.uid);
    res.json({ success: true });
  } catch {
    // Silent fail — logout should always succeed from user perspective
    res.json({ success: true });
  }
});

module.exports = r;
