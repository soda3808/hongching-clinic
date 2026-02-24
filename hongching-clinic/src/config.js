// ══════════════════════════════════
// Users, Stores & Permissions
// ══════════════════════════════════

// Bcrypt hashes — original passwords removed for security
// To update, use: node -e "require('bcryptjs').hash('newpass',10).then(h=>console.log(h))"
export const DEFAULT_USERS = [
  { id: 'admin1', username: 'steven', passwordHash: '$2b$10$kI4qR12wGonUs58zOylbKudsSCZC.NN5yub0uX/QE3LTPMXglvRu6', name: '林先生', role: 'admin', stores: ['all'], email: '', active: true },
  { id: 'mgr1', username: 'kaishing', passwordHash: '$2b$10$qgcVH8CLVitleWL7rgFyoemLpmep43LaojojcsuJs7VGDLElAz6we', name: '常凱晴', role: 'manager', stores: ['宋皇臺', '太子'], email: '', active: true },
  { id: 'doc1', username: 'drhu', passwordHash: '$2b$10$P/2pTKGetrr2KPnjReGnr.UcdSfpXKOL3CTbYqXk1q/OJOeLWQFq2', name: '許植輝', role: 'doctor', stores: ['宋皇臺'], email: '', active: true },
  { id: 'doc2', username: 'drtsang', passwordHash: '$2b$10$YThHuXkY2osQVWeiALOti.5s1bBE8S.z2KVf87Nqv.IF4t7oylTmu', name: '曾其方', role: 'doctor', stores: ['太子'], email: '', active: true },
  { id: 'staff1', username: 'yp', passwordHash: '$2b$10$qxM1sJg7K.AEJZetmWMGN.ijubEhlgekOnqHbdrB93gxNTl5AOEG6', name: '譚玉冰', role: 'staff', stores: ['宋皇臺'], email: '', active: true },
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
    viewEMR: true, editEMR: true, viewPackages: true, editPackages: true,
  },
  manager: {
    viewAllStores: false, viewDashboard: true, editRevenue: true, editExpenses: true, editARAP: true,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: true,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: true, editPackages: true,
  },
  doctor: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: false, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: true, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: false, viewPatients: true, viewBookings: true,
    viewEMR: true, editEMR: true, viewPackages: false, editPackages: false,
  },
  staff: {
    viewAllStores: false, viewDashboard: false, editRevenue: true, editExpenses: true, editARAP: false,
    viewPayroll: false, editPayroll: false, viewDoctorAnalytics: false, viewReports: false,
    viewSettings: false, manageUsers: false, viewReceiptScanner: true, viewPatients: true, viewBookings: true,
    viewEMR: false, editEMR: false, viewPackages: true, editPackages: false,
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
  emr: 'viewEMR',
  package: 'viewPackages',
  pay: 'viewPayroll',
  doc: 'viewDoctorAnalytics',
  report: 'viewReports',
  settings: 'viewSettings',
};
