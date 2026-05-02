const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getEncryptionKey() {
  const raw = process.env.PLAYLIST_IMPORT_ENCRYPTION_KEY || '';
  const trimmed = raw.trim();

  if (!trimmed) {
    throw new Error('PLAYLIST_IMPORT_ENCRYPTION_KEY is required');
  }

  const fromBase64 = Buffer.from(trimmed, 'base64');
  if (fromBase64.length === 32) return fromBase64;

  const fromHex = Buffer.from(trimmed, 'hex');
  if (fromHex.length === 32) return fromHex;

  throw new Error('PLAYLIST_IMPORT_ENCRYPTION_KEY must decode to 32 bytes');
}

function encryptString(value) {
  if (typeof value !== 'string' || !value) return null;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    alg: ALGORITHM,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decryptString(payload) {
  if (!payload) return '';
  if (
    payload.alg !== ALGORITHM ||
    typeof payload.iv !== 'string' ||
    typeof payload.tag !== 'string' ||
    typeof payload.ciphertext !== 'string'
  ) {
    throw new Error('Invalid encrypted payload');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('base64url');
}

module.exports = {
  decryptString,
  encryptString,
  sha256Base64Url,
};
