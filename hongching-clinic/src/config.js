// ══════════════════════════════════
// Users, Stores & Permissions
// ══════════════════════════════════

// Bcrypt hashes — original passwords removed for security
// To update, use: node -e "require('bcryptjs').hash('newpass',10).then(h=>console.log(h))"
export const DEFAULT_USERS = [
  { id: 'admin1', username: 'steven', passwordHash: '$2b$10$zQcoKwrA6nVPj5i.oQ2uk.scfm79UaLOsRYC37fS6cESMAECb1b0m', name: '林先生', role: 'admin', stores: ['all'], email: '', active: true },
  { id: 'mgr1', username: 'kaishing', passwordHash: '$2b$10$euZLNph3B44vWZCDj/SpbekAceKqyDrV0JcjSi053KZgSFgTiFjve', name: '常凱晴', role: 'manager', stores: ['宋皇臺', '太子'], email: '', active: true },
  { id: 'doc1', username: 'drhu', passwordHash: '$2b$10$euZLNph3B44vWZCDj/SpbekAceKqyDrV0JcjSi053KZgSFgTiFjve', name: '許植輝', role: 'doctor', stores: ['宋皇臺'], email: '', active: true },
  { id: 'doc2', username: 'drtsang', passwordHash: '$2b$10$euZLNph3B44vWZCDj/SpbekAceKqyDrV0JcjSi053KZgSFgTiFjve', name: '曾其方', role: 'doctor', stores: ['太子'], email: '', active: true },
  { id: 'staff1', username: 'yp', passwordHash: '$2b$10$euZLNph3B44vWZCDj/SpbekAceKqyDrV0JcjSi053KZgSFgTiFjve', name: '譚玉冰', role: 'staff', stores: ['宋皇臺'], email: '', active: true },
];

export const DEFAULT_STORES = [
  { id: 'tkw', name: '宋皇臺', address: '馬頭涌道97號美誠大廈地下', phone: '', active: true },
  { id: 'pe', name: '太子', address: '長沙灣道28號長康大廈地下', phone: '', active: true },
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
