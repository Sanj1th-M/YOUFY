const rateLimit = require('express-rate-limit');

// General API limiter — 100 req per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Slow down.' },
});

// Auth-specific limiter — 10 login attempts per 15 min per IP
// Prevents brute force attacks on login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // Deliberately vague — don't tell attacker exact limit
  message: { error: 'Too many login attempts. Try again later.' },
  skipSuccessfulRequests: true, // only count failed attempts
});

module.exports = { limiter, authLimiter };
