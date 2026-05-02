const rateLimit = require('express-rate-limit');
const isProd = process.env.NODE_ENV === 'production';

function skipLocalhostInDev(req) {
  if (isProd) return false;

  return req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
}

// General API limiter — 100 req per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: skipLocalhostInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});

// Auth-specific limiter — 10 login attempts per 15 min per IP
// Prevents brute force attacks on login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipLocalhostInDev,
  standardHeaders: true,
  legacyHeaders: false,
  // Deliberately vague — don't tell attacker exact limit
  message: { error: 'Too many login attempts. Try again later.' },
  skipSuccessfulRequests: true, // only count failed attempts
});

const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: skipLocalhostInDev,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many import requests. Try again later.' },
});

module.exports = { limiter, authLimiter, importLimiter };
