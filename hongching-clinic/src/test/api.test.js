import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the supabase module ──
// supabase client is null by default (no env vars in test),
// so Supabase-dependent paths fallback gracefully.
vi.mock('../supabase', () => ({
  supabase: null,  // default: supabase not configured
}));

// ── Mock the auth module ──
vi.mock('../auth', () => ({
  getTenantId: vi.fn(() => null),
  getAuthHeader: vi.fn(() => ({})),
}));

// ── Mock piiFields ──
vi.mock('../utils/piiFields', () => ({
  encryptPII: vi.fn(async (record) => ({ ...record, _encrypted: true })),
  decryptPII: vi.fn(async (data) => data),
}));

// Import mocked modules for assertion access
import { encryptPII, decryptPII } from '../utils/piiFields';

// Import api module once (top-level, not dynamic) so all tests share the same module reference
import {
  savePatient,
  saveRevenue,
  updateBookingStatus,
  loadAllData,
  openWhatsApp,
  sendTelegram,
  chatWithAI,
  deleteRecord,
  saveAllLocal,
  getSyncStatus,
  onSyncChange,
} from '../api';

// Keep a reference to the real localStorage methods from setup.js mock
const realGetItem = localStorage.getItem.bind(localStorage);
const realSetItem = localStorage.setItem.bind(localStorage);

beforeEach(() => {
  vi.clearAllMocks();
  // Restore localStorage methods in case a previous test replaced them
  localStorage.getItem = realGetItem;
  localStorage.setItem = realSetItem;
  localStorage.clear();
  // Reset fetch mock
  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  }));
});

// ── savePatient ──
describe('savePatient', () => {
  it('calls encryptPII on the patient record before saving', async () => {
    const record = { id: 'p1', name: 'Alice', phone: '12345678' };

    const result = await savePatient(record);

    expect(encryptPII).toHaveBeenCalledWith(record);
    expect(result).toEqual({ ok: true });
  });

  it('falls back to saving unencrypted when encryptPII throws', async () => {
    encryptPII.mockRejectedValueOnce(new Error('encrypt failed'));
    const record = { id: 'p2', name: 'Bob', phone: '99999999' };

    const result = await savePatient(record);

    // Should still return ok since it falls back to saveRecord with original record
    expect(result).toEqual({ ok: true });
  });

  it('saves encrypted record to localStorage', async () => {
    const record = { id: 'p3', name: 'Carol', phone: '55555555' };

    await savePatient(record);

    const stored = JSON.parse(localStorage.getItem('hc_data') || '{}');
    // The encrypted record (with _encrypted: true marker) should be in localStorage
    const saved = (stored.patients || []).find(r => r.id === 'p3');
    expect(saved).toBeTruthy();
    expect(saved._encrypted).toBe(true);
  });
});

// ── saveRevenue / generic saveRecord error handling ──
describe('saveRecord (via saveRevenue)', () => {
  it('returns { ok: true } on success', async () => {
    const record = { id: 'r1', amount: 100 };

    const result = await saveRevenue(record);
    expect(result).toEqual({ ok: true });
  });

  it('saves record to localStorage', async () => {
    const record = { id: 'r2', amount: 200 };

    await saveRevenue(record);

    const stored = JSON.parse(localStorage.getItem('hc_data') || '{}');
    const saved = (stored.revenue || []).find(r => r.id === 'r2');
    expect(saved).toBeTruthy();
    expect(saved.amount).toBe(200);
  });

  it('updates existing record in localStorage by id', async () => {
    // Pre-populate localStorage
    localStorage.setItem('hc_data', JSON.stringify({
      revenue: [{ id: 'r3', amount: 100 }],
    }));

    await saveRevenue({ id: 'r3', amount: 300 });

    const stored = JSON.parse(localStorage.getItem('hc_data'));
    const saved = stored.revenue.find(r => r.id === 'r3');
    expect(saved.amount).toBe(300);
    expect(stored.revenue).toHaveLength(1); // updated, not duplicated
  });
});

// ── updateBookingStatus ──
describe('updateBookingStatus', () => {
  it('updates booking status in localStorage and returns { ok: true }', async () => {
    localStorage.setItem('hc_data', JSON.stringify({
      bookings: [{ id: 'b1', status: 'pending', patient: 'Alice' }],
    }));

    const result = await updateBookingStatus('b1', 'confirmed');

    expect(result).toEqual({ ok: true });
    const stored = JSON.parse(localStorage.getItem('hc_data'));
    expect(stored.bookings[0].status).toBe('confirmed');
  });

  it('returns { ok: true } even if booking is not found in localStorage', async () => {
    localStorage.setItem('hc_data', JSON.stringify({ bookings: [] }));

    const result = await updateBookingStatus('nonexistent', 'confirmed');

    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: false } when an error occurs during processing', async () => {
    // Use a spy to make getItem throw, then restore via mockRestore
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage error');
    });

    const result = await updateBookingStatus('b1', 'confirmed');

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();

    spy.mockRestore();
  });

  it('returns { ok: false, error } with the error message on failure', async () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await updateBookingStatus('b1', 'done');

    expect(result).toEqual({ ok: false, error: 'boom' });

    spy.mockRestore();
  });
});

// ── loadAllData fallback chain ──
describe('loadAllData', () => {
  it('falls back to localStorage when supabase is null and GAS fails', async () => {
    const localData = {
      revenue: [{ id: 'r1', amount: 100 }],
      patients: [],
      expenses: [],
    };
    localStorage.setItem('hc_data', JSON.stringify(localData));

    // Make fetch (used by gasCall) throw so GAS path fails
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    const result = await loadAllData();

    expect(result.revenue).toEqual([{ id: 'r1', amount: 100 }]);
  });

  it('returns empty collections when all sources fail', async () => {
    // No localStorage data, no supabase, GAS fails
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    const result = await loadAllData();

    // Should return an object with empty arrays for all collections
    expect(result).toBeTruthy();
    expect(Array.isArray(result.revenue)).toBe(true);
    expect(Array.isArray(result.patients)).toBe(true);
    expect(Array.isArray(result.expenses)).toBe(true);
    expect(result.revenue).toHaveLength(0);
  });

  it('calls decryptPII on patients from localStorage', async () => {
    const localData = {
      revenue: [{ id: 'r1' }],
      patients: [{ id: 'p1', phone: 'ENC:mock_111' }],
      expenses: [],
    };
    localStorage.setItem('hc_data', JSON.stringify(localData));

    // Make GAS fail so we fall through to localStorage
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    await loadAllData();

    expect(decryptPII).toHaveBeenCalled();
  });

  it('returns all expected collection keys when falling back to empty', async () => {
    // Make all sources fail
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    const result = await loadAllData();

    // Check a sampling of expected collections exist
    expect(result).toHaveProperty('revenue');
    expect(result).toHaveProperty('patients');
    expect(result).toHaveProperty('expenses');
    expect(result).toHaveProperty('bookings');
    expect(result).toHaveProperty('inventory');
  });

  it('uses GAS data when GAS returns valid data', async () => {
    const gasResponse = {
      revenue: [{ id: 'gas1', amount: 500 }],
      patients: [],
      expenses: [{ id: 'e1' }],
    };
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(gasResponse),
    }));

    const result = await loadAllData();

    expect(result.revenue).toEqual([{ id: 'gas1', amount: 500 }]);
  });

  it('skips GAS data that has an error property', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ error: 'GAS script error' }),
    }));

    localStorage.setItem('hc_data', JSON.stringify({
      revenue: [{ id: 'local1' }],
      patients: [],
      expenses: [],
    }));

    const result = await loadAllData();

    // Should have fallen through to localStorage since gasData.error is truthy
    expect(result.revenue).toEqual([{ id: 'local1' }]);
  });
});

// ── openWhatsApp ──
describe('openWhatsApp', () => {
  it('opens a WhatsApp link with formatted phone number', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    const result = openWhatsApp('12345678', 'Hello');

    expect(result).toEqual({ success: true });
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://wa.me/85212345678'),
      '_blank'
    );
  });

  it('prepends 852 for 8-digit HK numbers', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    openWhatsApp('98765432', 'Hi');

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('85298765432');
  });

  it('strips spaces and dashes from phone numbers', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    openWhatsApp('1234 5678', 'Test');

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain('85212345678');
  });

  it('does not prepend 852 for non-8-digit numbers', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    openWhatsApp('+85212345678', 'Test');

    const url = openSpy.mock.calls[0][0];
    // After stripping formatting chars, '+85212345678' is 12 chars, so no 852 prefix
    expect(url).not.toContain('852852');
  });

  it('URL-encodes the message', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    openWhatsApp('12345678', 'Hello World & More');

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('Hello World & More'));
  });

  it('handles null phone gracefully', () => {
    const openSpy = vi.fn();
    window.open = openSpy;

    const result = openWhatsApp(null, 'Hi');

    expect(result).toEqual({ success: true });
    // Should not throw
  });
});

// ── sendTelegram ──
describe('sendTelegram', () => {
  it('sends a POST request to /api/messaging with message and chatId', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    }));

    const result = await sendTelegram('Test message', 'chat123');

    expect(result).toEqual({ success: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/messaging?action=telegram',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'Test message', chatId: 'chat123' }),
      })
    );
  });

  it('returns { success: false, error } on network failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')));

    const result = await sendTelegram('Test', 'chat123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('network down');
  });
});

// ── chatWithAI ──
describe('chatWithAI', () => {
  it('returns { success: false } on network failure', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('fail')));

    const result = await chatWithAI('hello', {});

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

// ── deleteRecord ──
describe('deleteRecord', () => {
  it('removes the record from localStorage', async () => {
    localStorage.setItem('hc_data', JSON.stringify({
      revenue: [{ id: 'r1', amount: 100 }, { id: 'r2', amount: 200 }],
    }));

    await deleteRecord('revenue', 'r1');

    const stored = JSON.parse(localStorage.getItem('hc_data'));
    expect(stored.revenue).toHaveLength(1);
    expect(stored.revenue[0].id).toBe('r2');
  });

  it('handles deletion when collection does not exist in localStorage', async () => {
    localStorage.setItem('hc_data', JSON.stringify({}));

    // Should not throw
    await deleteRecord('nonexistent', 'id1');

    const stored = JSON.parse(localStorage.getItem('hc_data'));
    expect(stored).toBeTruthy();
  });
});

// ── saveAllLocal ──
describe('saveAllLocal', () => {
  it('persists data to hc_data in localStorage', () => {
    const data = { revenue: [{ id: 'x' }], patients: [] };
    saveAllLocal(data);

    const stored = JSON.parse(localStorage.getItem('hc_data'));
    expect(stored).toEqual(data);
  });

  it('overwrites existing localStorage data', () => {
    localStorage.setItem('hc_data', JSON.stringify({ old: true }));

    const newData = { revenue: [], patients: [{ id: 'p1' }] };
    saveAllLocal(newData);

    const stored = JSON.parse(localStorage.getItem('hc_data'));
    expect(stored).toEqual(newData);
    expect(stored.old).toBeUndefined();
  });
});

// ── getSyncStatus / onSyncChange ──
describe('sync status', () => {
  it('returns sync status with status and pending properties', () => {
    const status = getSyncStatus();
    // Should have status and pending properties
    expect(status).toHaveProperty('status');
    expect(status).toHaveProperty('pending');
    expect(typeof status.pending).toBe('number');
  });

  it('onSyncChange returns an unsubscribe function', () => {
    const fn = vi.fn();
    const unsub = onSyncChange(fn);
    expect(typeof unsub).toBe('function');
    unsub(); // should not throw
  });
});
