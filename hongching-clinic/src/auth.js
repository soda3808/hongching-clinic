// ══════════════════════════════════
// Auth & Permission Utilities
// ══════════════════════════════════

import { DEFAULT_USERS, DEFAULT_STORES, PERMISSIONS } from './config';

const AUTH_KEY = 'hcmc_user';

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

export function login(username, password) {
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === password && u.active);
  if (!user) return null;
  const session = { userId: user.id, username: user.username, name: user.name, role: user.role, stores: user.stores };
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  sessionStorage.removeItem(AUTH_KEY);
}

export function getCurrentUser() {
  try {
    const s = sessionStorage.getItem(AUTH_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
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
