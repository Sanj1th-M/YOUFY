const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const firebaseAdmin = require('./src/config/firebase');
const { limiter, authLimiter } = require('./src/middleware/rateLimit');
const { verifyToken } = require('./src/middleware/auth');
const { startBackgroundServices } = require('./src/services/ytdlpUpdater');
const { isPlaylistImportEnabled } = require('./src/modules/playlistImport/config');
const { createPlaylistImportRouter } = require('./src/modules/playlistImport/router');
const { startPlaylistImportWorker } = require('./src/modules/playlistImport/queue');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const firebaseConfigured = firebaseAdmin.isFirebaseConfigured;

function firebaseUnavailable(req, res) {
  res.status(503).json({ error: 'Firebase is not configured on this server.' });
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Required for React inline styles
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com', 'https://*.ytimg.com', 'https://*.ggpht.com'],
      mediaSrc: ["'self'", 'blob:', 'https://*.googlevideo.com'],
      connectSrc: [
        "'self'",
        'https://www.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://identitytoolkit.googleapis.com',
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

const allowedOrigins = [
  'http://localhost:5173',
  'https://youfy.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Dev convenience: allow any localhost port so Vite can move ports without breaking.
    if (!isProd && origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      return cb(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }

    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Reject oversized URLs to prevent memory-based DoS
app.use((req, res, next) => {
  if (req.url.length > 2048) {
    return res.status(414).json({ error: 'URI too long' });
  }
  next();
});
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));
app.use(morgan(isProd ? 'combined' : 'dev'));
app.use(limiter);
app.disable('x-powered-by');

if (firebaseConfigured) {
  app.use('/auth', authLimiter, require('./src/routes/auth'));
} else {
  console.warn('[firebase] Admin SDK disabled. Auth and cloud playlists are unavailable until FIREBASE_* values are set.');
  app.use('/auth', authLimiter, firebaseUnavailable);
}

app.use('/search', require('./src/routes/search'));
app.use('/stream', require('./src/routes/stream'));
app.use('/trending', require('./src/routes/trending'));

app.use('/lyrics', require('./src/routes/lyrics'));
app.use('/health', require('./src/routes/health'));
app.use('/playlist-import', createPlaylistImportRouter());

if (firebaseConfigured) {
  app.use('/playlist', verifyToken, require('./src/routes/playlist'));
  app.use('/recently-played', verifyToken, require('./src/routes/recentlyPlayed'));
} else {
  app.use('/playlist', firebaseUnavailable);
  app.use('/recently-played', (req, res) => res.status(204).end());
}

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  // Log full details server-side only
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  if (!isProd) console.error(err.stack);

  const status = err.status || 500;
  // Never expose internal error details to clients, even in dev
  res.status(status).json({ error: 'Something went wrong. Please try again.' });
});

startBackgroundServices();
if (firebaseConfigured && isPlaylistImportEnabled()) {
  startPlaylistImportWorker();
}

app.listen(PORT, () => console.log(`Youtfly backend running on port ${PORT}`));
