// ══════════════════════════════════
// Utilities & Seed Data
// ══════════════════════════════════

export const uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

export const fmt = (n) => Math.round(n).toLocaleString('en-HK');
export const fmtM = (n) => `$${fmt(n)}`;
export const getMonth = (d) => d ? String(d).substring(0, 7) : '';
export const monthLabel = (m) => {
  if (!m) return '';
  const [y, mo] = m.split('-');
  const names = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[+mo]} ${y}`;
};

// ── Linear Regression (for revenue forecast) ──
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ── Membership Tiers ──
export const MEMBERSHIP_TIERS = [
  { name: '普通', minSpent: 0, discount: 0, color: '#888', bg: '#f5f5f5' },
  { name: '銅卡', minSpent: 3000, discount: 0.05, color: '#CD7F32', bg: '#FFF8F0' },
  { name: '銀卡', minSpent: 8000, discount: 0.10, color: '#A0A0A0', bg: '#F8F8F8' },
  { name: '金卡', minSpent: 20000, discount: 0.15, color: '#DAA520', bg: '#FFFDF0' },
];

export function getMembershipTier(totalSpent) {
  let tier = MEMBERSHIP_TIERS[0];
  for (const t of MEMBERSHIP_TIERS) {
    if (totalSpent >= t.minSpent) tier = t;
  }
  return tier;
}

// ── TCM Expanded Databases (re-exported for backward compatibility) ──
import { TCM_HERBS_DB, HERB_CATEGORIES, searchHerbs, formatHerbInfo } from './data/herbs';
import { TCM_FORMULAS_DB, FORMULA_CATEGORIES, searchFormulas, getFormulasByCategory } from './data/formulas';
import { ACUPOINTS_DB, MERIDIANS, searchAcupoints, getAcupointsByMeridian } from './data/acupoints';
import { GRANULE_PRODUCTS, GRANULE_SUPPLIERS, searchGranules, convertToGranule } from './data/granules';

// Backward-compatible simple arrays
export const TCM_HERBS = TCM_HERBS_DB.map(h => h.n);

// Re-export expanded databases
export { TCM_HERBS_DB, HERB_CATEGORIES, searchHerbs, formatHerbInfo };
export { TCM_FORMULAS_DB, FORMULA_CATEGORIES, searchFormulas, getFormulasByCategory };
export { ACUPOINTS_DB, MERIDIANS, searchAcupoints, getAcupointsByMeridian };
export { GRANULE_PRODUCTS, GRANULE_SUPPLIERS, searchGranules, convertToGranule };

// ── TCM Formula Templates (backward-compatible format from expanded DB) ──
export const TCM_FORMULAS = TCM_FORMULAS_DB.map(f => ({
  name: f.name,
  herbs: f.herbs.map(h => ({ herb: h.h, dosage: h.d })),
  indication: f.ind,
  category: f.cat,
  source: f.src,
  contraindication: f.contra,
}));

// ── TCM Treatment Types ──
export const TCM_TREATMENTS = ['內服中藥','針灸','推拿','天灸','拔罐','刮痧','艾灸','耳穴','其他'];

// ── Common Acupuncture Points (backward-compatible from expanded DB) ──
export const ACUPOINTS = ACUPOINTS_DB.map(a => a.name);

export const EXPENSE_CATEGORIES = {
  '固定成本': ['租金', '管理費', '保險', '牌照/註冊'],
  '人事成本': ['人工', 'MPF', '勞保', '培訓'],
  '營運成本': ['藥材/耗材', '電費', '水費', '電話/網絡', '醫療器材', '電腦/軟件'],
  '行政雜費': ['日常雜費', '文具/印刷', '交通', '飲食招待', '清潔'],
  '資本開支': ['裝修工程', '傢俬/設備', '按金/訂金'],
  '市場推廣': ['廣告/宣傳', '推廣活動'],
  '其他': ['其他'],
};

export const ALL_CATEGORIES = Object.values(EXPENSE_CATEGORIES).flat();

// Default employees — real staff data
export const DEFAULT_EMPLOYEES = [
  { id: 'hui', name: '許植輝', nameEn: 'Hui Chik Fai', pos: '主診醫師', regNo: '007476', type: 'monthly', rate: 33000, start: '2026-02-01',
    stores: ['宋皇臺店', '太子店'], note: '底薪$33,000+階梯佣金，合約2026-02-01起，試用期1個月，工作6日/週',
    comm: { tiers: [
      { min: 0, max: 100000, r: 0.02 },
      { min: 100000, max: 150000, r: 0.05 },
      { min: 150000, max: 250000, r: 0.15 },
      { min: 250000, max: 400000, r: 0.30 },
    ]}
  },
  { id: 'sheung', name: '常凱晴', nameEn: 'Sheung Hoi Ching', pos: '主診醫師', type: 'monthly', rate: 0, start: '2025-10-01',
    stores: ['宋皇臺店', '太子店'], note: '創辦人/主診醫師，2025-10起',
    comm: null, ectcmId: '5063'
  },
  { id: 'tsang', name: '曾其方', nameEn: 'Tsang Ki Fong', pos: '兼職中醫師', type: 'commission', rate: 0, start: '', stores: ['太子店'], note: '按診金分成',
    comm: null, ectcmId: '6262'
  },
  { id: 'zoe', name: 'Zoe趙穎欣', pos: '診所助理', type: 'hourly', rate: 60, start: '', stores: ['宋皇臺店', '太子店'], note: '兼職，$60/小時，6小時以上扣1小時飯鐘', comm: null },
  { id: 'kelly', name: 'Kelly', pos: '診所助理', type: 'monthly', rate: 0, start: '', stores: ['宋皇臺店'], note: '月薪制', comm: null },
];

// Dynamic getters — use tenant config when available, fallback to defaults
import { getTenantDoctors, getTenantStoreNames, getTenantServices, getClinicName } from './tenant';

export function getEmployees() {
  try { return JSON.parse(localStorage.getItem('hcmc_employees')) || DEFAULT_EMPLOYEES; }
  catch { return DEFAULT_EMPLOYEES; }
}

export function saveEmployees(employees) {
  localStorage.setItem('hcmc_employees', JSON.stringify(employees));
}

export function getDoctors() {
  return getTenantDoctors();
}

export function getStoreNames() {
  return getTenantStoreNames();
}

export function getDefaultStore() {
  const stores = getStoreNames();
  return stores[0] || '';
}

// Backward-compatible static exports (seed data fallback)
export const EMPLOYEES = DEFAULT_EMPLOYEES;
export const DOCTORS = ['醫師A', '醫師B', '醫師C'];

// ── Clinic Pricing (for AI chatbot) ── Dynamic from tenant services
export function getClinicPricing() {
  const services = getTenantServices();
  const pricing = {};
  services.forEach(s => {
    if (s.active !== false) {
      pricing[s.label] = { price: s.fee, desc: s.label };
    }
  });
  return Object.keys(pricing).length ? pricing : CLINIC_PRICING;
}

export const CLINIC_PRICING = {
  '初診': { price: 450, desc: '首次診症（含診金+藥費）' },
  '覆診': { price: 350, desc: '覆診（含診金+藥費）' },
  '針灸': { price: 450, desc: '針灸治療' },
  '推拿': { price: 350, desc: '推拿治療' },
  '天灸': { price: 388, desc: '天灸貼藥' },
  '拔罐': { price: 250, desc: '拔罐治療' },
  '刮痧': { price: 300, desc: '刮痧治療' },
  '針灸+推拿': { price: 650, desc: '針灸加推拿套餐' },
};

// Sample seed data — all data is fictional / anonymized. Real data is in the database.
export const SEED_DATA = {
  revenue: [],
  expenses: [],
  arap: [],
  patients: [],
  bookings: [],
  payslips: [],
  consultations: [],
  packages: [],
  enrollments: [],
  conversations: [],
  inventory: [],
  queue: [],
};
