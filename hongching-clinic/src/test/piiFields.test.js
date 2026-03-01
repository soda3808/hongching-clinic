import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the crypto module since crypto.subtle is not available in jsdom
vi.mock('../utils/crypto', () => ({
  encryptField: vi.fn(async (value, _passphrase) => `ENC:mock_${value}`),
  decryptField: vi.fn(async (value, _passphrase) => {
    if (value && value.startsWith('ENC:')) {
      const inner = value.slice(4);
      // If it was encrypted by our mock, strip the mock_ prefix
      if (inner.startsWith('mock_')) return inner.slice(5);
      // Otherwise just return the raw payload
      return inner;
    }
    return value;
  }),
}));

import { encryptPII, decryptPII, PII_FIELDS } from '../utils/piiFields';
import { encryptField, decryptField } from '../utils/crypto';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ── PII_FIELDS constant ──
describe('PII_FIELDS', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(PII_FIELDS)).toBe(true);
    PII_FIELDS.forEach(f => expect(typeof f).toBe('string'));
  });

  it('contains phone', () => {
    expect(PII_FIELDS).toContain('phone');
  });

  it('contains hkid', () => {
    expect(PII_FIELDS).toContain('hkid');
  });

  it('contains email', () => {
    expect(PII_FIELDS).toContain('email');
  });

  it('contains address', () => {
    expect(PII_FIELDS).toContain('address');
  });

  it('contains id_number', () => {
    expect(PII_FIELDS).toContain('id_number');
  });

  it('contains emergency_contact', () => {
    expect(PII_FIELDS).toContain('emergency_contact');
  });

  it('contains emergency_phone', () => {
    expect(PII_FIELDS).toContain('emergency_phone');
  });
});

// ── encryptPII ──
describe('encryptPII', () => {
  it('encrypts PII fields in a record', async () => {
    const record = { phone: '12345678', hkid: 'A1234567', name: 'Alice' };
    const result = await encryptPII(record);

    expect(result.phone).toBe('ENC:mock_12345678');
    expect(result.hkid).toBe('ENC:mock_A1234567');
    // encryptField should have been called for phone and hkid
    expect(encryptField).toHaveBeenCalledWith('12345678', expect.any(String));
    expect(encryptField).toHaveBeenCalledWith('A1234567', expect.any(String));
  });

  it('does not modify non-PII fields', async () => {
    const record = { name: 'Bob', age: 30, phone: '99999999' };
    const result = await encryptPII(record);

    expect(result.name).toBe('Bob');
    expect(result.age).toBe(30);
    // Only phone should be encrypted
    expect(result.phone).toBe('ENC:mock_99999999');
  });

  it('skips already-encrypted values (ENC: prefix)', async () => {
    const record = { phone: 'ENC:already_encrypted', email: 'test@test.com' };
    const result = await encryptPII(record);

    expect(result.phone).toBe('ENC:already_encrypted');
    expect(result.email).toBe('ENC:mock_test@test.com');
    // encryptField should NOT have been called for phone
    expect(encryptField).not.toHaveBeenCalledWith('ENC:already_encrypted', expect.any(String));
  });

  it('returns null/undefined/non-objects as-is', async () => {
    expect(await encryptPII(null)).toBe(null);
    expect(await encryptPII(undefined)).toBe(undefined);
    expect(await encryptPII(42)).toBe(42);
    expect(await encryptPII('string')).toBe('string');
  });

  it('handles an empty object', async () => {
    const result = await encryptPII({});
    expect(result).toEqual({});
    expect(encryptField).not.toHaveBeenCalled();
  });

  it('skips falsy PII field values (empty string, null, undefined)', async () => {
    const record = { phone: '', email: null, address: undefined, hkid: '0' };
    const result = await encryptPII(record);

    // Empty string is falsy, so not encrypted
    expect(result.phone).toBe('');
    // null stays null
    expect(result.email).toBe(null);
    // undefined stays undefined
    expect(result.address).toBe(undefined);
    // '0' is a non-empty string so it should be encrypted
    expect(result.hkid).toBe('ENC:mock_0');
  });

  it('skips PII fields that are non-string types', async () => {
    const record = { phone: 12345678, email: true, address: ['123 St'] };
    const result = await encryptPII(record);

    // Non-string values should pass through
    expect(result.phone).toBe(12345678);
    expect(result.email).toBe(true);
    expect(result.address).toEqual(['123 St']);
    expect(encryptField).not.toHaveBeenCalled();
  });

  it('returns a shallow copy without mutating the original', async () => {
    const original = { phone: '12345678', name: 'Test' };
    const result = await encryptPII(original);

    expect(result).not.toBe(original);
    expect(original.phone).toBe('12345678'); // original unchanged
    expect(result.phone).toBe('ENC:mock_12345678');
  });

  it('uses passphrase from localStorage when available', async () => {
    localStorage.setItem('pii_encryption_key', 'custom_key');
    const record = { phone: '11111111' };
    await encryptPII(record);

    expect(encryptField).toHaveBeenCalledWith('11111111', 'custom_key');
  });

  it('uses default passphrase when localStorage is empty', async () => {
    const record = { phone: '22222222' };
    await encryptPII(record);

    expect(encryptField).toHaveBeenCalledWith('22222222', 'hcmc_default_v1');
  });

  it('accepts an explicit passphrase parameter', async () => {
    const record = { phone: '33333333' };
    await encryptPII(record, 'explicit_key');

    expect(encryptField).toHaveBeenCalledWith('33333333', 'explicit_key');
  });

  it('keeps original value when encryptField throws', async () => {
    encryptField.mockRejectedValueOnce(new Error('crypto error'));
    const record = { phone: '44444444', email: 'ok@ok.com' };
    const result = await encryptPII(record);

    // phone encryption failed, so original value should be kept
    expect(result.phone).toBe('44444444');
    // email should still be encrypted
    expect(result.email).toBe('ENC:mock_ok@ok.com');
  });

  it('encrypts all PII fields when all are present', async () => {
    const record = {};
    PII_FIELDS.forEach(f => { record[f] = `value_${f}`; });
    const result = await encryptPII(record);

    PII_FIELDS.forEach(f => {
      expect(result[f]).toBe(`ENC:mock_value_${f}`);
    });
    expect(encryptField).toHaveBeenCalledTimes(PII_FIELDS.length);
  });
});

// ── decryptPII ──
describe('decryptPII', () => {
  it('decrypts ENC: prefixed values in PII fields', async () => {
    const record = { phone: 'ENC:mock_12345678', name: 'Alice' };
    const result = await decryptPII(record);

    expect(result.phone).toBe('12345678');
    expect(result.name).toBe('Alice');
    expect(decryptField).toHaveBeenCalledWith('ENC:mock_12345678', expect.any(String));
  });

  it('passes through non-encrypted PII field values', async () => {
    const record = { phone: 'plaintext_phone', email: 'plain@email.com' };
    const result = await decryptPII(record);

    expect(result.phone).toBe('plaintext_phone');
    expect(result.email).toBe('plain@email.com');
    expect(decryptField).not.toHaveBeenCalled();
  });

  it('handles arrays of records', async () => {
    const records = [
      { phone: 'ENC:mock_111', name: 'A' },
      { phone: 'ENC:mock_222', name: 'B' },
    ];
    const result = await decryptPII(records);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].phone).toBe('111');
    expect(result[0].name).toBe('A');
    expect(result[1].phone).toBe('222');
    expect(result[1].name).toBe('B');
  });

  it('handles an empty array', async () => {
    const result = await decryptPII([]);
    expect(result).toEqual([]);
  });

  it('returns null/undefined as-is', async () => {
    expect(await decryptPII(null)).toBe(null);
    expect(await decryptPII(undefined)).toBe(undefined);
  });

  it('returns non-objects as-is', async () => {
    expect(await decryptPII(42)).toBe(42);
    expect(await decryptPII('string')).toBe('string');
    expect(await decryptPII(true)).toBe(true);
  });

  it('returns a shallow copy without mutating the original', async () => {
    const original = { phone: 'ENC:mock_555', name: 'Test' };
    const result = await decryptPII(original);

    expect(result).not.toBe(original);
    expect(original.phone).toBe('ENC:mock_555'); // original unchanged
    expect(result.phone).toBe('555');
  });

  it('uses passphrase from localStorage when available', async () => {
    localStorage.setItem('pii_encryption_key', 'my_key');
    const record = { phone: 'ENC:mock_test' };
    await decryptPII(record);

    expect(decryptField).toHaveBeenCalledWith('ENC:mock_test', 'my_key');
  });

  it('accepts an explicit passphrase parameter', async () => {
    const record = { phone: 'ENC:mock_test' };
    await decryptPII(record, 'explicit_key');

    expect(decryptField).toHaveBeenCalledWith('ENC:mock_test', 'explicit_key');
  });

  it('keeps encrypted value when decryptField throws', async () => {
    decryptField.mockRejectedValueOnce(new Error('decrypt error'));
    const record = { phone: 'ENC:bad_data', email: 'ENC:mock_ok' };
    const result = await decryptPII(record);

    // phone decryption failed, so encrypted value should be kept
    expect(result.phone).toBe('ENC:bad_data');
    // email should still be decrypted
    expect(result.email).toBe('ok');
  });

  it('does not attempt to decrypt non-PII fields even with ENC: prefix', async () => {
    const record = { phone: 'ENC:mock_111', name: 'ENC:not_a_pii_field' };
    const result = await decryptPII(record);

    // name is not in PII_FIELDS, so it should pass through unchanged
    expect(result.name).toBe('ENC:not_a_pii_field');
    // only phone should trigger decryptField
    expect(decryptField).toHaveBeenCalledTimes(1);
  });

  it('handles mixed encrypted and unencrypted PII fields', async () => {
    const record = {
      phone: 'ENC:mock_encrypted',
      hkid: 'plain_hkid',
      email: 'ENC:mock_email_value',
      address: '',
    };
    const result = await decryptPII(record);

    expect(result.phone).toBe('encrypted');
    expect(result.hkid).toBe('plain_hkid');
    expect(result.email).toBe('email_value');
    expect(result.address).toBe('');
    expect(decryptField).toHaveBeenCalledTimes(2);
  });
});
