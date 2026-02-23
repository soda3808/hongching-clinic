// ══════════════════════════════════
// Auth & Permission Utilities (JWT + Offline Fallback)
// ══════════════════════════════════

import { DEFAULT_USERS, DEFAULT_STORES, PERMISSIONS } from './config';

const AUTH_KEY = 'hcmc_user';
const TOKEN_KEY = 'hcmc_token';

export function getUsers() {
  try {
    const saved = localStorage.getItem('hc_users');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_USERS;
}

export function saveUsers(users) {
  localStorage.setItem('hc_users', JSON.stringify(users));
}

export function getStores() {
  try {
    const saved = localStorage.getItem('hc_stores');
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_STORES;
}

export function saveStores(stores) {
  localStorage.setItem('hc_stores', JSON.stringify(stores));
}

// JWT-based login: tries serverless endpoint first, falls back to local hash comparison
export async function login(username, password) {
  // Try JWT auth via serverless
  if (navigator.onLine) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        const session = data.user;
        sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
        sessionStorage.setItem(TOKEN_KEY, data.token);
        return session;
      }
      // Server said invalid credentials
      if (res.status === 401) return null;
    } catch {
      // Network error — fall through to offline mode
    }
  }

  // Offline fallback: compare against bcrypt hashes stored in config
  try {
    const { default: bcrypt } = await import('bcryptjs');
    const users = getUsers();
    const user = users.find(u => u.username === username && u.active);
    if (!user) return null;
    const hash = user.passwordHash || user.password;
    // If it looks like a bcrypt hash, use bcrypt compare
    if (hash && hash.startsWith('$2')) {
      const valid = bcrypt.compareSync(password, hash);
      if (!valid) return null;
    } else if (hash !== password) {
      // Legacy plaintext fallback for migrating users
      return null;
    }
    const session = { userId: user.id, username: user.username, name: user.name, role: user.role, stores: user.stores };
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return session;
  } catch {
    return null;
  }
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getCurrentUser() {
  try {
    const s = sessionStorage.getItem(AUTH_KEY);
    if (!s) return null;
    const session = JSON.parse(s);
    // Check JWT expiry if token exists
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          logout();
          return null;
        }
      } catch {
        // Token parse failed — keep session (offline mode)
      }
    }
    return session;
  } catch { return null; }
}

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function hasPermission(action) {
  const user = getCurrentUser();
  if (!user) return false;
  const perms = PERMISSIONS[user.role];
  return perms ? !!perms[action] : false;
}

export function canViewStore(storeName) {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.stores.includes('all')) return true;
  return user.stores.includes(storeName) || storeName === '兩店共用';
}

export function filterByPermission(data, activeStore) {
  const user = getCurrentUser();
  if (!user) return data;
  const role = user.role;

  let filtered = { ...data };

  // Admin with specific store filter
  if (role === 'admin') {
    if (activeStore && activeStore !== 'all') {
      filtered.revenue = (data.revenue || []).filter(r => r.store === activeStore);
      filtered.expenses = (data.expenses || []).filter(r => r.store === activeStore || r.store === '兩店共用');
      filtered.patients = (data.patients || []).filter(r => r.store === activeStore);
      filtered.bookings = (data.bookings || []).filter(r => r.store === activeStore);
    }
    return filtered;
  }

  // Manager/Staff: filter by their stores
  if (role === 'manager' || role === 'staff') {
    const stores = user.stores;
    filtered.revenue = (data.revenue || []).filter(r => stores.includes(r.store));
    filtered.expenses = (data.expenses || []).filter(r => stores.includes(r.store) || r.store === '兩店共用');
    filtered.patients = (data.patients || []).filter(r => stores.includes(r.store));
    filtered.bookings = (data.bookings || []).filter(r => stores.includes(r.store));
    filtered.arap = data.arap || [];
    return filtered;
  }

  // Doctor: filter by their name
  if (role === 'doctor') {
    filtered.revenue = (data.revenue || []).filter(r => r.doctor === user.name);
    filtered.expenses = [];
    filtered.patients = (data.patients || []).filter(r => r.doctor === user.name);
    filtered.bookings = (data.bookings || []).filter(r => r.doctor === user.name);
    filtered.arap = [];
    return filtered;
  }

  return filtered;
}
