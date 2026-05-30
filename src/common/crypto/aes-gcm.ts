import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM helpers for encrypting AppSetting values at rest.
 *
 * Storage format (single string, all base64 url-safe):
 *   "gcm.v1:<saltB64>:<ivB64>:<tagB64>:<cipherB64>"
 *
 * - salt: 16 random bytes, scrypted with the master key into the encryption
 *   key. A fresh salt per write means two identical plaintexts never produce
 *   the same ciphertext, which is exactly what we want for an admin panel
 *   that might re-save the same API key on PUT.
 * - iv: 12 random bytes (GCM standard).
 * - tag: 16-byte authentication tag (GCM standard).
 * - cipher: encrypted payload.
 *
 * The master key (`APP_ENCRYPTION_KEY`) is read from env at boot. Each call
 * derives an actual encryption key via scrypt(master, salt, 32) — so leaking
 * one ciphertext does not leak the master key, and re-using the master key
 * across many secrets is safe.
 */
const PREFIX = 'gcm.v1:';
const SALT_LEN = 16;
const IV_LEN = 12;
const KEY_LEN = 32;

export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EncryptionError';
  }
}

function deriveKey(masterB64: string, salt: Buffer): Buffer {
  // scrypt is intentionally slow on the master key, fast-ish here because
  // salt is per-secret and master is high-entropy (256 bits). N=2^14 keeps
  // each call ~5ms which is acceptable for a per-write/per-read path.
  return scryptSync(Buffer.from(masterB64, 'base64'), salt, KEY_LEN);
}

export function encryptString(plaintext: string, masterB64: string): string {
  if (!masterB64) {
    throw new EncryptionError('APP_ENCRYPTION_KEY belum di-set di server.');
  }
  try {
    const salt = randomBytes(SALT_LEN);
    const iv = randomBytes(IV_LEN);
    const key = deriveKey(masterB64, salt);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      PREFIX.slice(0, -1),
      salt.toString('base64'),
      iv.toString('base64'),
      tag.toString('base64'),
      enc.toString('base64'),
    ].join(':');
  } catch (err) {
    throw new EncryptionError('Gagal mengenkripsi nilai.', err);
  }
}

export function decryptString(stored: string, masterB64: string): string {
  if (!stored.startsWith(PREFIX)) {
    // Backwards-compat: a setting saved before encryption was wired up
    // may still be plaintext. Return it as-is so the admin UI can re-save.
    return stored;
  }
  if (!masterB64) {
    throw new EncryptionError('APP_ENCRYPTION_KEY belum di-set di server.');
  }
  try {
    const parts = stored.slice(PREFIX.length).split(':');
    if (parts.length !== 4) throw new Error('format ciphertext invalid');
    const [saltB64, ivB64, tagB64, encB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const enc = Buffer.from(encB64, 'base64');
    const key = deriveKey(masterB64, salt);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (err) {
    throw new EncryptionError(
      'Gagal mendekripsi nilai (master key salah?).',
      err,
    );
  }
}

/** Show only the last 4 chars of a secret in admin UI ("sk-…aBcD"). */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}
