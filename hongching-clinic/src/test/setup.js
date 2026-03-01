import '@testing-library/jest-dom';

// Mock localStorage
const createMockStorage = () => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] || null,
  };
};

Object.defineProperty(window, 'localStorage', { value: createMockStorage() });
Object.defineProperty(window, 'sessionStorage', { value: createMockStorage() });

// Mock fetch for audit server calls
globalThis.fetch = globalThis.fetch || (() => Promise.resolve({ ok: true }));
