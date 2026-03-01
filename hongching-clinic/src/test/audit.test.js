import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  logAction,
  getAuditLog,
  clearAuditLog,
  searchAuditLog,
  logDataChange,
  logCreate,
  logDelete,
  logExport,
  logSecurity,
} from '../utils/audit';

// Mock fetch to prevent actual network calls
globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true }));

beforeEach(() => {
  clearAuditLog();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

// ── logAction / getAuditLog ──
describe('logAction', () => {
  it('logs an action retrievable via getAuditLog', () => {
    logAction({ userId: 'u1', name: 'Dr. Chan', role: 'doctor' }, 'login', 'auth', 'User logged in');
    const logs = getAuditLog();
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('login');
    expect(logs[0].userName).toBe('Dr. Chan');
    expect(logs[0].target).toBe('auth');
    expect(logs[0].userId).toBe('u1');
    expect(logs[0].role).toBe('doctor');
  });

  it('prepends new entries (most recent first)', () => {
    logAction({ userId: 'u1', name: 'A' }, 'first', 'test');
    logAction({ userId: 'u1', name: 'A' }, 'second', 'test');
    const logs = getAuditLog();
    expect(logs[0].action).toBe('second');
    expect(logs[1].action).toBe('first');
  });

  it('includes ISO timestamp', () => {
    logAction({ userId: 'u1', name: 'A' }, 'action', 'test');
    const logs = getAuditLog();
    expect(logs[0].ts).toBeTruthy();
    // Should be a valid ISO date string
    expect(new Date(logs[0].ts).toISOString()).toBe(logs[0].ts);
  });

  it('defaults to "system" userId when user is missing', () => {
    logAction(null, 'action', 'test');
    const logs = getAuditLog();
    expect(logs[0].userId).toBe('system');
    expect(logs[0].userName).toBe('System');
  });

  it('limits log entries to 500', () => {
    for (let i = 0; i < 510; i++) {
      logAction({ userId: 'u1', name: 'Test' }, 'action', 'test', `entry ${i}`);
    }
    const logs = getAuditLog();
    expect(logs.length).toBeLessThanOrEqual(500);
  });
});

// ── clearAuditLog ──
describe('clearAuditLog', () => {
  it('removes all audit log entries', () => {
    logAction({ userId: 'u1', name: 'A' }, 'action', 'test');
    expect(getAuditLog().length).toBe(1);
    clearAuditLog();
    expect(getAuditLog().length).toBe(0);
  });
});

// ── searchAuditLog ──
describe('searchAuditLog', () => {
  beforeEach(() => {
    logAction({ userId: 'u1', name: 'Dr. Chan' }, 'login', 'auth', 'logged in');
    logAction({ userId: 'u2', name: 'Dr. Wong' }, 'create', 'patient', 'new patient');
    logAction({ userId: 'u1', name: 'Dr. Chan' }, 'update', 'patient', 'modified record');
  });

  it('filters by query string matching userName', () => {
    const results = searchAuditLog('Chan');
    expect(results.length).toBe(2); // Dr. Chan has 2 entries
    results.forEach(r => expect(r.userName).toBe('Dr. Chan'));
  });

  it('filters by query string matching action', () => {
    const results = searchAuditLog('login');
    expect(results.length).toBe(1);
    expect(results[0].action).toBe('login');
  });

  it('filters by action type via filters object', () => {
    const results = searchAuditLog('', { action: 'create' });
    expect(results.length).toBe(1);
    expect(results[0].action).toBe('create');
  });

  it('filters by target via filters object', () => {
    const results = searchAuditLog('', { target: 'patient' });
    expect(results.length).toBe(2);
  });

  it('filters by userId via filters object', () => {
    const results = searchAuditLog('', { userId: 'u2' });
    expect(results.length).toBe(1);
    expect(results[0].userName).toBe('Dr. Wong');
  });

  it('combines query and filters', () => {
    const results = searchAuditLog('Chan', { action: 'update' });
    expect(results.length).toBe(1);
    expect(results[0].action).toBe('update');
  });

  it('returns empty array when nothing matches', () => {
    const results = searchAuditLog('nonexistent');
    expect(results.length).toBe(0);
  });

  it('returns all entries with empty query and no filters', () => {
    const results = searchAuditLog('');
    expect(results.length).toBe(3);
  });
});

// ── logDataChange ──
describe('logDataChange', () => {
  it('records field-level changes with diff', () => {
    const before = { name: 'Old Name', phone: '91234567' };
    const after = { name: 'New Name', phone: '91234567' };
    logDataChange({ userId: 'u1', name: 'Dr. Chan' }, 'update', 'patient', 'p1', before, after);

    const logs = getAuditLog();
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('update');
    expect(logs[0].detail.changedFields).toContain('name');
    expect(logs[0].detail.changedFields).not.toContain('phone');
    expect(logs[0].detail.changes.name.from).toBe('Old Name');
    expect(logs[0].detail.changes.name.to).toBe('New Name');
  });

  it('masks sensitive fields in the diff', () => {
    const before = { password: 'old123' };
    const after = { password: 'new456' };
    logDataChange({ userId: 'u1', name: 'Admin' }, 'update', 'user', 'u2', before, after);

    const logs = getAuditLog();
    expect(logs[0].detail.changes.password.from).toBe('***');
    expect(logs[0].detail.changes.password.to).toBe('***');
  });

  it('skips internal fields like updated_at, created_at', () => {
    const before = { name: 'A', updated_at: '2024-01-01' };
    const after = { name: 'A', updated_at: '2024-01-02' };
    logDataChange({ userId: 'u1', name: 'Admin' }, 'update', 'patient', 'p1', before, after);

    const logs = getAuditLog();
    expect(logs[0].detail.changedFields).not.toContain('updated_at');
  });
});

// ── logCreate ──
describe('logCreate', () => {
  it('logs creation with field list', () => {
    logCreate({ userId: 'u1', name: 'Dr. Chan' }, 'patient', 'p1', { name: 'John', phone: '91234567' });
    const logs = getAuditLog();
    expect(logs[0].action).toBe('create');
    expect(logs[0].detail.fields).toContain('name');
    expect(logs[0].detail.fields).toContain('phone');
  });
});

// ── logDelete ──
describe('logDelete', () => {
  it('logs deletion with entity name', () => {
    logDelete({ userId: 'u1', name: 'Admin' }, 'patient', 'p1', { name: 'John Doe' });
    const logs = getAuditLog();
    expect(logs[0].action).toBe('delete');
    expect(logs[0].detail.deletedName).toBe('John Doe');
  });
});

// ── logExport ──
describe('logExport', () => {
  it('logs export action with count and format', () => {
    logExport({ userId: 'u1', name: 'Dr. Chan' }, 'patients', 50, 'csv');
    const logs = getAuditLog();
    expect(logs[0].action).toBe('export');
    expect(logs[0].detail.count).toBe(50);
    expect(logs[0].detail.format).toBe('csv');
  });
});

// ── logSecurity ──
describe('logSecurity', () => {
  it('logs security events', () => {
    logSecurity({ userId: 'u1', name: 'Dr. Chan' }, 'failed_login', 'Invalid password');
    const logs = getAuditLog();
    expect(logs[0].action).toBe('failed_login');
    expect(logs[0].target).toBe('security');
  });
});
