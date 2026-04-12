require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const firebaseAdmin = require('./src/config/firebase');
const { limiter, authLimiter } = require('./src/middleware/rateLimit');
const { verifyToken } = require('./src/middleware/auth');
const { startBackgroundServices } = require('./src/services/ytdlpUpdater');

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      mediaSrc: ["'self'", 'https:', 'blob:'],
      connectSrc: [
        "'self'",
        'https://www.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://identitytoolkit.googleapis.com',
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
}));

const allowedOrigins = [
  'http://localhost:5173',
  'https://youfy.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }

    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
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

if (firebaseConfigured) {
  app.use('/playlist', verifyToken, require('./src/routes/playlist'));
  app.use('/recently-played', verifyToken, require('./src/routes/recentlyPlayed'));
} else {
  app.use('/playlist', firebaseUnavailable);
  app.use('/recently-played', (req, res) => res.status(204).end());
}

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  if (!isProd) {
    console.error(err.stack);
  }

  const status = err.status || 500;
  res.status(status).json({
    error: isProd ? 'Something went wrong' : err.message,
  });
});

startBackgroundServices();

app.listen(PORT, () => console.log(`Youtfly backend running on port ${PORT}`));
