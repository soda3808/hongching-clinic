// Field-level encryption for sensitive PII data
// Uses Web Crypto API (AES-256-GCM) — available in all modern browsers

const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;

// Derive a CryptoKey from a passphrase
async function deriveKey(passphrase) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('hcmc_salt_v1'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a string → base64 encoded ciphertext
export async function encryptField(plaintext, passphrase) {
  if (!plaintext) return plaintext;
  try {
    const key = await deriveKey(passphrase);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(plaintext));
    // Combine iv + ciphertext and base64 encode
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return 'ENC:' + btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('Encryption failed:', err);
    return plaintext; // Return unencrypted on failure
  }
}

// Decrypt a base64 ciphertext → string
export async function decryptField(ciphertext, passphrase) {
  if (!ciphertext || !ciphertext.startsWith('ENC:')) return ciphertext;
  try {
    const key = await deriveKey(passphrase);
    const combined = Uint8Array.from(atob(ciphertext.slice(4)), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('Decryption failed:', err);
    return '[加密數據]'; // Return placeholder on failure
  }
}

// Check if a field is encrypted
export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('ENC:');
}
