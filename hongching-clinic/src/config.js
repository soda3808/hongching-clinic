// ══════════════════════════════════
// Users, Stores & Permissions
// ══════════════════════════════════

export const DEFAULT_USERS = [
  { id: 'admin1', username: 'steven', password: 'hcmc2026', name: '林先生', role: 'admin', stores: ['all'], email: '', active: true },
  { id: 'mgr1', username: 'kaishing', password: 'ks2026', name: '常凱晴', role: 'manager', stores: ['宋皇臺', '太子'], email: '', active: true },
  { id: 'doc1', username: 'drhu', password: 'dh2026', name: '許植輝', role: 'doctor', stores: ['宋皇臺'], email: '', active: true },
  { id: 'doc2', username: 'drtsang', password: 'dt2026', name: '曾其方', role: 'doctor', stores: ['太子'], email: '', active: true },
  { id: 'staff1', username: 'yp', password: 'yp2026', name: '譚玉冰', role: 'staff', stores: ['宋皇臺'], email: '', active: true },
];

export const DEFAULT_STORES = [
  { id: 'tkw', name: '宋皇臺', address: '馬頭涌道97號美誠大廈地下', phone: '', active: true },
  { id: 'pe', name: '太子', address: '長沙灣道28號長康大廈地下', phone: '', active: true },
];

export const ROLE_LABELS = { admin: '管理員', manager: '店長', doctor: '醫師', staff: '助理' };
export const ROLE_TAGS = { admin: 'tag-overdue', manager: 'tag-fps', doctor: 'tag-paid', staff: 'tag-other' };

export const PERMISSIONS = {
  admin: {
    viewAllStores: true, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: true, editPayroll: true, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: true, manageUsers: true, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
  },
  manager: {
    viewAllStores: false, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
  },
  doctor: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: false, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: false, viewPatients: true, viewBookings: true,
  },
  staff: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: true, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: false, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
  },
};

// Map page IDs to required permissions
export const PAGE_PERMISSIONS = {
  dash: 'viewDashboard',
  rev: 'editRevenue',
  exp: 'editExpenses',
  scan: 'viewReceiptScanner',
  arap: 'editARAP',
  patient: 'viewPatients',
  booking: 'viewBookings',
  pay: 'viewPayroll',
  doc: 'viewDoctorAnalytics',
  report: 'viewReports',
  settings: 'viewSettings',
};
