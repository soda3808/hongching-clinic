import { describe, it, expect } from 'vitest';
import {
  validateHKPhone,
  validateHKID,
  validateEmail,
  required,
  validateDate,
  validateName,
  validateRange,
  validateForm,
  SCHEMAS,
} from '../utils/validation';

// ── validateHKPhone ──
describe('validateHKPhone', () => {
  it('accepts valid 8-digit HK phone numbers starting with 2-9', () => {
    expect(validateHKPhone('91234567')).toEqual({ valid: true });
    expect(validateHKPhone('61234567')).toEqual({ valid: true });
    expect(validateHKPhone('21234567')).toEqual({ valid: true });
  });

  it('accepts +852 prefixed numbers', () => {
    expect(validateHKPhone('+85291234567')).toEqual({ valid: true });
    expect(validateHKPhone('+85261234567')).toEqual({ valid: true });
  });

  it('strips spaces, dashes, and parentheses before validation', () => {
    expect(validateHKPhone('9123 4567')).toEqual({ valid: true });
    expect(validateHKPhone('9123-4567')).toEqual({ valid: true });
    expect(validateHKPhone('+852 9123 4567')).toEqual({ valid: true });
  });

  it('rejects numbers that are too short', () => {
    const result = validateHKPhone('1234');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects empty or missing input', () => {
    expect(validateHKPhone('').valid).toBe(false);
    expect(validateHKPhone(null).valid).toBe(false);
    expect(validateHKPhone(undefined).valid).toBe(false);
  });

  it('rejects alphabetic strings', () => {
    expect(validateHKPhone('abcdefgh').valid).toBe(false);
  });

  it('rejects numbers starting with 0 or 1', () => {
    expect(validateHKPhone('01234567').valid).toBe(false);
    expect(validateHKPhone('11234567').valid).toBe(false);
  });
});

// ── validateHKID ──
describe('validateHKID', () => {
  it('rejects empty or missing input', () => {
    expect(validateHKID('').valid).toBe(false);
    expect(validateHKID(null).valid).toBe(false);
    expect(validateHKID(undefined).valid).toBe(false);
  });

  it('rejects invalid formats (no parentheses, no check digit)', () => {
    expect(validateHKID('A1234567').valid).toBe(false);
    expect(validateHKID('12345678').valid).toBe(false);
    expect(validateHKID('invalid').valid).toBe(false);
  });

  it('validates with correct check digit algorithm', () => {
    // A123456 -> check digit should be computed
    // space=36, A=10 -> values: [36,10,1,2,3,4,5,6]
    // weighted: 36*8 + 10*7 + 1*6 + 2*5 + 3*4 + 4*3 + 5*2 + 6*1
    //         = 288 + 70 + 6 + 10 + 12 + 12 + 10 + 6 = 414
    // 414 % 11 = 7  ->  11-7 = 4
    const result = validateHKID('A123456(4)');
    expect(result).toEqual({ valid: true });
  });

  it('rejects correct format but wrong check digit', () => {
    const result = validateHKID('A123456(0)');
    expect(result.valid).toBe(false);
  });

  it('supports two-letter prefix HKID', () => {
    // Two-letter prefix: AB123456
    // A=10, B=11 -> [10, 11, 1, 2, 3, 4, 5, 6]
    // 10*8 + 11*7 + 1*6 + 2*5 + 3*4 + 4*3 + 5*2 + 6*1
    // = 80 + 77 + 6 + 10 + 12 + 12 + 10 + 6 = 213
    // 213 % 11 = 4 -> 11-4 = 7
    const result = validateHKID('AB123456(7)');
    expect(result).toEqual({ valid: true });
  });

  it('handles check digit "A" for remainder 1', () => {
    // We need a case where remainder = 1 -> check digit = 'A'
    // Find inputs that produce remainder 1
    // Using G080002: space=36, G=16 -> [36,16,0,8,0,0,0,2]
    // 36*8 + 16*7 + 0*6 + 8*5 + 0*4 + 0*3 + 0*2 + 2*1
    // = 288 + 112 + 0 + 40 + 0 + 0 + 0 + 2 = 442
    // 442 % 11 = 2 -> 11-2 = 9 -> nope
    // Let's compute: need sum % 11 = 1, which yields 'A'
    // Try G080001: [36,16,0,8,0,0,0,1] -> 288+112+0+40+0+0+0+1 = 441
    // 441 % 11 = 441 - 40*11 = 441 - 440 = 1 -> check = 'A'
    const result = validateHKID('G080001(A)');
    expect(result).toEqual({ valid: true });
  });

  it('is case-insensitive for the letter prefix', () => {
    // Same as A123456(4) but lowercase input
    const result = validateHKID('a123456(4)');
    expect(result).toEqual({ valid: true });
  });
});

// ── validateEmail ──
describe('validateEmail', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('test@example.com')).toEqual({ valid: true });
    expect(validateEmail('user.name@domain.co')).toEqual({ valid: true });
    expect(validateEmail('user+tag@domain.org')).toEqual({ valid: true });
  });

  it('rejects empty or missing input', () => {
    expect(validateEmail('').valid).toBe(false);
    expect(validateEmail(null).valid).toBe(false);
    expect(validateEmail(undefined).valid).toBe(false);
  });

  it('rejects strings without @', () => {
    expect(validateEmail('notanemail').valid).toBe(false);
  });

  it('rejects strings without local part', () => {
    expect(validateEmail('@domain.com').valid).toBe(false);
  });

  it('rejects strings without TLD', () => {
    expect(validateEmail('user@domain').valid).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(validateEmail('  test@example.com  ')).toEqual({ valid: true });
  });
});

// ── required ──
describe('required', () => {
  it('rejects empty string', () => {
    expect(required('').valid).toBe(false);
  });

  it('rejects null', () => {
    expect(required(null).valid).toBe(false);
  });

  it('rejects undefined', () => {
    expect(required(undefined).valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    expect(required('   ').valid).toBe(false);
  });

  it('accepts non-empty values', () => {
    expect(required('hello')).toEqual({ valid: true });
  });

  it('accepts numeric zero as valid', () => {
    expect(required(0)).toEqual({ valid: true });
  });

  it('includes field name in error message', () => {
    const result = required('', '電話');
    expect(result.error).toContain('電話');
  });
});

// ── validateDate ──
describe('validateDate', () => {
  it('accepts valid date strings', () => {
    expect(validateDate('2024-01-15')).toEqual({ valid: true });
    expect(validateDate('2024-12-31')).toEqual({ valid: true });
  });

  it('rejects empty or missing input', () => {
    expect(validateDate('').valid).toBe(false);
    expect(validateDate(null).valid).toBe(false);
  });

  it('rejects non-date strings', () => {
    expect(validateDate('not-a-date').valid).toBe(false);
  });

  it('rejects dates outside 1900-2100', () => {
    expect(validateDate('1800-01-01').valid).toBe(false);
    expect(validateDate('2200-01-01').valid).toBe(false);
  });
});

// ── validateName ──
describe('validateName', () => {
  it('accepts Chinese names', () => {
    expect(validateName('陳大文')).toEqual({ valid: true });
  });

  it('accepts English names', () => {
    expect(validateName('John Smith')).toEqual({ valid: true });
  });

  it('rejects names shorter than 2 characters', () => {
    expect(validateName('A').valid).toBe(false);
  });

  it('rejects names longer than 20 characters', () => {
    expect(validateName('A'.repeat(21)).valid).toBe(false);
  });

  it('rejects names with special characters', () => {
    expect(validateName('test@123').valid).toBe(false);
  });

  it('rejects empty or missing input', () => {
    expect(validateName('').valid).toBe(false);
    expect(validateName(null).valid).toBe(false);
  });
});

// ── validateRange ──
describe('validateRange', () => {
  it('accepts values within range', () => {
    expect(validateRange(50, 0, 100)).toEqual({ valid: true });
    expect(validateRange(0, 0, 100)).toEqual({ valid: true });
    expect(validateRange(100, 0, 100)).toEqual({ valid: true });
  });

  it('rejects values below min', () => {
    expect(validateRange(-1, 0, 100).valid).toBe(false);
  });

  it('rejects values above max', () => {
    expect(validateRange(101, 0, 100).valid).toBe(false);
  });

  it('rejects non-numeric values', () => {
    expect(validateRange('abc', 0, 100).valid).toBe(false);
  });

  it('rejects empty or null input', () => {
    expect(validateRange('', 0, 100).valid).toBe(false);
    expect(validateRange(null, 0, 100).valid).toBe(false);
  });
});

// ── validateForm ──
describe('validateForm', () => {
  it('returns valid when all fields pass', () => {
    const schema = {
      name: [required, validateName],
      phone: [validateHKPhone],
    };
    const data = { name: '陳大文', phone: '91234567' };
    const result = validateForm(schema, data);
    expect(result.valid).toBe(true);
    expect(Object.keys(result.errors)).toHaveLength(0);
  });

  it('returns errors for invalid fields', () => {
    const schema = {
      name: [required, validateName],
      phone: [validateHKPhone],
    };
    const data = { name: '', phone: '123' };
    const result = validateForm(schema, data);
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.phone).toBeTruthy();
  });

  it('stops at first error per field', () => {
    const schema = {
      name: [required, validateName],
    };
    // Empty string fails 'required' first; validateName is not reached
    const result = validateForm(schema, { name: '' });
    expect(result.errors.name).toBeTruthy();
  });
});

// ── SCHEMAS ──
describe('SCHEMAS', () => {
  it('defines patient schema', () => {
    expect(SCHEMAS.patient).toBeDefined();
    expect(SCHEMAS.patient.name).toBeDefined();
    expect(SCHEMAS.patient.phone).toBeDefined();
  });

  it('defines booking schema', () => {
    expect(SCHEMAS.booking).toBeDefined();
    expect(SCHEMAS.booking.patientName).toBeDefined();
    expect(SCHEMAS.booking.date).toBeDefined();
    expect(SCHEMAS.booking.time).toBeDefined();
    expect(SCHEMAS.booking.doctor).toBeDefined();
  });

  it('defines revenue schema', () => {
    expect(SCHEMAS.revenue).toBeDefined();
    expect(SCHEMAS.revenue.date).toBeDefined();
    expect(SCHEMAS.revenue.amount).toBeDefined();
    expect(SCHEMAS.revenue.item).toBeDefined();
  });
});
