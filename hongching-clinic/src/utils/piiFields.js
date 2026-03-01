// PII (Personally Identifiable Information) field-level encryption utility
// Wraps crypto.js encryptField/decryptField for batch processing of patient records

import { encryptField, decryptField } from './crypto';

// Fields that contain PII and should be encrypted at rest
export const PII_FIELDS = [
  'phone',
  'hkid',
  'id_number',
  'address',
  'email',
  'emergency_contact',
  'emergency_phone',
];

// Retrieve encryption passphrase (falls back to a default for dev/demo)
function getPassphrase() {
  try {
    return localStorage.getItem('pii_encryption_key') || 'hcmc_default_v1';
  } catch {
    // localStorage may be unavailable (SSR, tests, etc.)
    return 'hcmc_default_v1';
  }
}

/**
 * Encrypt PII fields in a data object before saving to Supabase.
 * Non-PII fields and falsy values are left untouched.
 * Already-encrypted values (prefixed with "ENC:") are skipped.
 *
 * @param {Object} data  - The record to encrypt (e.g. a patient object)
 * @param {string} [passphrase] - Optional override; defaults to localStorage key
 * @returns {Promise<Object>} A shallow copy with PII fields encrypted
 */
export async function encryptPII(data, passphrase) {
  if (!data || typeof data !== 'object') return data;

  const key = passphrase || getPassphrase();
  const result = { ...data };

  for (const field of PII_FIELDS) {
    if (result[field] && typeof result[field] === 'string' && !result[field].startsWith('ENC:')) {
      try {
        result[field] = await encryptField(result[field], key);
      } catch (err) {
        // On failure, keep the original value so we never lose data
        console.warn(`[piiFields] encrypt failed for "${field}":`, err);
      }
    }
  }

  return result;
}

/**
 * Decrypt PII fields in a data object after loading from Supabase.
 * Only values prefixed with "ENC:" are decrypted; all others pass through.
 * Works on a single record or an array of records.
 *
 * @param {Object|Array} data - A record or array of records to decrypt
 * @param {string} [passphrase] - Optional override; defaults to localStorage key
 * @returns {Promise<Object|Array>} A shallow copy with PII fields decrypted
 */
export async function decryptPII(data, passphrase) {
  if (!data) return data;

  // Handle arrays (e.g. a list of patients from sbSelect)
  if (Array.isArray(data)) {
    return Promise.all(data.map(item => decryptPII(item, passphrase)));
  }

  if (typeof data !== 'object') return data;

  const key = passphrase || getPassphrase();
  const result = { ...data };

  for (const field of PII_FIELDS) {
    if (result[field] && typeof result[field] === 'string' && result[field].startsWith('ENC:')) {
      try {
        result[field] = await decryptField(result[field], key);
      } catch (err) {
        // On failure, keep the encrypted value — UI will show "[加密數據]" via crypto.js
        console.warn(`[piiFields] decrypt failed for "${field}":`, err);
      }
    }
  }

  return result;
}
