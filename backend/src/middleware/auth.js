const admin = require('../config/firebase');

async function verifyToken(req, res, next) {
  if (!admin.isFirebaseConfigured) {
    return res.status(503).json({ error: 'Firebase authentication is unavailable.' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

async function attachUserIfPresent(req, res, next) {
  if (!admin.isFirebaseConfigured) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = authHeader.split('Bearer ')[1];
    req.user = await admin.auth().verifyIdToken(token);
  } catch {
    // Continue without authentication — route should still work for guests.
  }

  next();
}

module.exports = { verifyToken, attachUserIfPresent };
