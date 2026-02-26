// Server-side Authorization Helpers
// Used by API endpoints to enforce role-based access

import { requireAuth } from './_middleware.js';

// Check if user has one of the allowed roles
export function requireRole(req, allowedRoles) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return { ok: false, status: 401, error: auth.error };
  if (!allowedRoles.includes(auth.user.role)) {
    return { ok: false, status: 403, error: '權限不足' };
  }
  return { ok: true, user: auth.user };
}

// Check if user can access specific store data
export function requireStore(req, storeName) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return { ok: false, status: 401, error: auth.error };
  if (auth.user.stores?.includes('all')) return { ok: true, user: auth.user };
  if (auth.user.stores?.includes(storeName)) return { ok: true, user: auth.user };
  return { ok: false, status: 403, error: '無此分店存取權限' };
}

// Doctor: can only access own data
export function requireSelfOrAdmin(req, doctorName) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return { ok: false, status: 401, error: auth.error };
  if (['admin', 'manager', 'superadmin'].includes(auth.user.role)) return { ok: true, user: auth.user };
  if (auth.user.role === 'doctor' && auth.user.name === doctorName) return { ok: true, user: auth.user };
  return { ok: false, status: 403, error: '只能存取自己的數據' };
}

// Permissions map (mirrors frontend config.js PERMISSIONS)
const ROLE_PERMISSIONS = {
  superadmin: { all: true },
  admin: {
    viewDashboard: true, editRevenue: true, viewExpenses: true, editExpenses: true,
    viewPatients: true, editPatients: true, viewBookings: true, editBookings: true,
    viewInventory: true, editInventory: true, viewPayroll: true, editPayroll: true,
    viewReports: true, manageUsers: true, viewARAP: true, editARAP: true,
    viewEMR: true, editEMR: true, switchStore: true,
  },
  manager: {
    viewDashboard: true, editRevenue: true, viewExpenses: true, editExpenses: true,
    viewPatients: true, editPatients: true, viewBookings: true, editBookings: true,
    viewInventory: true, editInventory: true, viewReports: true,
    viewARAP: true, editARAP: true, viewEMR: true,
  },
  doctor: {
    viewDashboard: true, editRevenue: true, viewPatients: true,
    viewBookings: true, viewReports: true, viewEMR: true, editEMR: true,
  },
  staff: {
    viewDashboard: true, editRevenue: true, viewPatients: true, editPatients: true,
    viewBookings: true, editBookings: true, viewInventory: true,
  },
};

export function requirePermission(req, permission) {
  const auth = requireAuth(req);
  if (!auth.authenticated) return { ok: false, status: 401, error: auth.error };
  const perms = ROLE_PERMISSIONS[auth.user.role];
  if (!perms) return { ok: false, status: 403, error: '角色未定義' };
  if (perms.all || perms[permission]) return { ok: true, user: auth.user };
  return { ok: false, status: 403, error: '權限不足' };
}
