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

module.exports = { verifyToken };
