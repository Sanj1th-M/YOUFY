const crypto = require('crypto');

function createCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

function createCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

module.exports = {
  createCodeChallenge,
  createCodeVerifier,
};
