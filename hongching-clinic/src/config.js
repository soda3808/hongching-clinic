// ══════════════════════════════════
// Users, Stores & Permissions
// ══════════════════════════════════

// Offline fallback credentials — used only when tenant DB is not available.
// In production multi-tenant mode, users are managed per-tenant in the database.
// To generate a hash: node -e "require('bcryptjs').hash('newpass',10).then(h=>console.log(h))"
export const DEFAULT_USERS = [
  { id: 'admin1', username: 'admin', passwordHash: '', name: '管理員', role: 'admin', stores: ['all'], email: '', active: true },
];

// Fallback stores — in multi-tenant mode, stores come from tenant config in the database.
export const DEFAULT_STORES = [
  { id: 'store1', name: '分店A', address: '', phone: '', active: true },
];

export const ROLE_LABELS = { admin: '管理員', manager: '店長', doctor: '醫師', staff: '助理' };
export const ROLE_TAGS = { admin: 'tag-overdue', manager: 'tag-fps', doctor: 'tag-paid', staff: 'tag-other' };

export const PERMISSIONS = {
  superadmin: {
    viewAllStores: true, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: true, editPayroll: true, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: true, manageUsers: true, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: true, editPackages: true,
    viewQueue: true, editQueue: true, viewBilling: true, editBilling: true,
    viewLeave: true, viewPrivacy: true, viewSuperAdmin: true,
  },
  admin: {
    viewAllStores: true, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: true, editPayroll: true, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: true, manageUsers: true, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: true, editPackages: true,
    viewQueue: true, editQueue: true, viewBilling: true, editBilling: true,
    viewLeave: true, viewPrivacy: true, viewSuperAdmin: true,
  },
  manager: {
    viewAllStores: false, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: true, editPackages: true,
    viewQueue: true, editQueue: true, viewBilling: true, editBilling: true,
    viewLeave: true,
  },
  doctor: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: false, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: false, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: false, editPackages: false,
    viewQueue: true, editQueue: false, viewBilling: false, editBilling: false,
    viewLeave: true,
  },
  staff: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: true, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: false, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: false, editEMR: false, viewPackages: true, editPackages: false,
    viewQueue: true, editQueue: true, viewBilling: true, editBilling: true,
    viewLeave: true,
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
  queue: 'viewQueue',
  emr: 'viewEMR',
  package: 'viewPackages',
  billing: 'viewBilling',
  pay: 'viewPayroll',
  doc: 'viewDoctorAnalytics',
  report: 'viewReports',
  settings: 'viewSettings',
  sickleave: 'viewEMR',
  schedule: 'viewDoctorAnalytics',
  leave: 'viewLeave',
  products: 'editExpenses',
  ai: 'viewDashboard',
  compare: 'viewDashboard',
  survey: 'viewDashboard',
  voucher: 'viewPatients',
  ehealth: 'viewEMR',
  privacy: 'viewPrivacy',
  superadmin: 'viewSuperAdmin',
};

// ══════════════════════════════════
// Configurable Services
// ══════════════════════════════════
export const DEFAULT_SERVICES = [
  { id: 's1', label: '診金', fee: 350, category: '診症', active: true, sortOrder: 1 },
  { id: 's2', label: '針灸治療', fee: 450, category: '治療', active: true, sortOrder: 2 },
  { id: 's3', label: '推拿治療', fee: 350, category: '治療', active: true, sortOrder: 3 },
  { id: 's4', label: '天灸', fee: 388, category: '治療', active: true, sortOrder: 4 },
  { id: 's5', label: '拔罐', fee: 250, category: '治療', active: true, sortOrder: 5 },
  { id: 's6', label: '刮痧', fee: 300, category: '治療', active: true, sortOrder: 6 },
];

export function getServices() {
  try { return JSON.parse(localStorage.getItem('hcmc_services')) || DEFAULT_SERVICES; }
  catch { return DEFAULT_SERVICES; }
}

export function saveServices(services) {
  localStorage.setItem('hcmc_services', JSON.stringify(services));
}

// ══════════════════════════════════
// Doctor Schedule
// ══════════════════════════════════
export function getDoctorSchedule() {
  try { return JSON.parse(localStorage.getItem('hcmc_doctor_schedule')) || {}; }
  catch { return {}; }
}

export function saveDoctorSchedule(schedule) {
  localStorage.setItem('hcmc_doctor_schedule', JSON.stringify(schedule));
}
