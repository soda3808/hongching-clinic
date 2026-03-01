// Form Validation Utilities for Hong Ching Clinic Management System
// Hong Kong specific validators + general form validation
// All error messages in Traditional Chinese (zh-HK)

import { useState, useCallback } from 'react';

// ── Hong Kong Phone Number ──
// Accepts: 8-digit local numbers or +852 prefixed numbers
export function validateHKPhone(phone) {
  if (!phone || !String(phone).trim()) {
    return { valid: false, error: '請輸入電話號碼' };
  }
  const cleaned = String(phone).trim().replace(/[\s\-()]/g, '');
  // +852 prefix followed by 8 digits
  if (/^\+852\d{8}$/.test(cleaned)) {
    return { valid: true };
  }
  // Plain 8-digit local number (starts with 2-9)
  if (/^[2-9]\d{7}$/.test(cleaned)) {
    return { valid: true };
  }
  return { valid: false, error: '請輸入有效的香港電話號碼（8位數字或+852開頭）' };
}

// ── Hong Kong Identity Card ──
// Format: 1-2 letters + 6 digits + (check digit or A)
// e.g. A123456(7), AB123456(8), Z987654(A)
export function validateHKID(id) {
  if (!id || !String(id).trim()) {
    return { valid: false, error: '請輸入身份證號碼' };
  }
  const cleaned = String(id).trim().toUpperCase().replace(/\s/g, '');

  // Match pattern: 1-2 letters + 6 digits + check digit in parentheses
  const match = cleaned.match(/^([A-Z]{1,2})(\d{6})\(([0-9A])\)$/);
  if (!match) {
    return { valid: false, error: '身份證格式不正確（例：A123456(7)）' };
  }

  const [, prefix, digits, checkChar] = match;

  // HKID check digit algorithm
  // Convert letters to values: A=10, B=11, ..., Z=35
  // For 1-letter prefix, pad with space (value 36)
  const charValues = [];
  if (prefix.length === 1) {
    charValues.push(36); // space padding
    charValues.push(prefix.charCodeAt(0) - 55); // A=10
  } else {
    charValues.push(prefix.charCodeAt(0) - 55);
    charValues.push(prefix.charCodeAt(1) - 55);
  }

  const digitValues = digits.split('').map(Number);
  const allValues = [...charValues, ...digitValues];

  // Weighted sum: positions 8,7,6,5,4,3,2 (multipliers)
  let sum = 0;
  for (let i = 0; i < allValues.length; i++) {
    sum += allValues[i] * (8 - i);
  }

  const remainder = sum % 11;
  const expectedCheck = remainder === 0 ? '0' : remainder === 1 ? 'A' : String(11 - remainder);

  if (checkChar !== expectedCheck) {
    return { valid: false, error: '身份證號碼校驗碼不正確' };
  }

  return { valid: true };
}

// ── Email (RFC-lite) ──
export function validateEmail(email) {
  if (!email || !String(email).trim()) {
    return { valid: false, error: '請輸入電郵地址' };
  }
  const trimmed = String(email).trim();
  // RFC-lite: local@domain.tld
  // Local part: alphanumeric, dots, underscores, hyphens, plus signs
  // Domain: alphanumeric, dots, hyphens; TLD at least 2 chars
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: '請輸入有效的電郵地址' };
  }
  return { valid: true };
}

// ── Required Field ──
export function required(value, fieldName) {
  const label = fieldName || '此欄位';
  if (value === null || value === undefined || String(value).trim() === '') {
    return { valid: false, error: `${label}為必填項` };
  }
  return { valid: true };
}

// ── Date Validation ──
// Accepts valid date strings parseable by Date constructor
export function validateDate(dateStr) {
  if (!dateStr || !String(dateStr).trim()) {
    return { valid: false, error: '請輸入日期' };
  }
  const trimmed = String(dateStr).trim();
  const date = new Date(trimmed);
  if (isNaN(date.getTime())) {
    return { valid: false, error: '請輸入有效的日期格式' };
  }
  // Sanity check: year between 1900 and 2100
  const year = date.getFullYear();
  if (year < 1900 || year > 2100) {
    return { valid: false, error: '日期超出有效範圍（1900-2100）' };
  }
  return { valid: true };
}

// ── Number Range ──
export function validateRange(num, min, max, fieldName) {
  const label = fieldName || '數值';
  if (num === null || num === undefined || num === '') {
    return { valid: false, error: `請輸入${label}` };
  }
  const n = Number(num);
  if (isNaN(n)) {
    return { valid: false, error: `${label}必須為數字` };
  }
  if (n < min) {
    return { valid: false, error: `${label}不能小於${min}` };
  }
  if (n > max) {
    return { valid: false, error: `${label}不能大於${max}` };
  }
  return { valid: true };
}

// ── Name Validation ──
// 2-20 characters, supports Chinese characters and English letters (with spaces/hyphens)
export function validateName(name) {
  if (!name || !String(name).trim()) {
    return { valid: false, error: '請輸入姓名' };
  }
  const trimmed = String(name).trim();
  if (trimmed.length < 2) {
    return { valid: false, error: '姓名最少需要2個字元' };
  }
  if (trimmed.length > 20) {
    return { valid: false, error: '姓名不能超過20個字元' };
  }
  // Allow Chinese characters, English letters, spaces, hyphens, dots, middot
  const nameRegex = /^[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z\s\-.\u00B7]+$/;
  if (!nameRegex.test(trimmed)) {
    return { valid: false, error: '姓名只能包含中文、英文字母、空格及連字號' };
  }
  return { valid: true };
}

// ── Form Validator ──
// Takes a schema object { fieldName: [validator1, validator2, ...] }
// and form data { fieldName: value }
// Returns { valid: boolean, errors: { fieldName: '錯誤訊息' } }
export function validateForm(schema, data) {
  const errors = {};

  for (const field of Object.keys(schema)) {
    const validators = schema[field];
    const value = data[field];

    for (const validator of validators) {
      const result = validator(value, field);
      if (!result.valid) {
        errors[field] = result.error;
        break; // Stop at first error for this field
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ── Pre-built Schemas for Common Forms ──
export const SCHEMAS = {
  patient: {
    name: [required, validateName],
    phone: [validateHKPhone],
  },
  booking: {
    patientName: [required],
    date: [required, validateDate],
    time: [required],
    doctor: [required],
  },
  revenue: {
    date: [required, validateDate],
    amount: [(v) => validateRange(v, 0.01, 999999, '金額')],
    item: [required],
  },
  expense: {
    date: [required, validateDate],
    amount: [(v) => validateRange(v, 0.01, 999999, '金額')],
    category: [required],
  },
};

// ── React Hook: useFormValidation ──
// Usage:
//   const { errors, validate, clearErrors, setFieldError } = useFormValidation(SCHEMAS.patient);
//   const isValid = validate(formData);
//   if (!isValid) { /* show errors */ }
export function useFormValidation(schema) {
  const [errors, setErrors] = useState({});

  const validate = useCallback((data) => {
    const result = validateForm(schema, data);
    setErrors(result.errors);
    return result.valid;
  }, [schema]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const setFieldError = useCallback((field, message) => {
    setErrors((prev) => ({
      ...prev,
      [field]: message,
    }));
  }, []);

  return { errors, validate, clearErrors, setFieldError };
}
