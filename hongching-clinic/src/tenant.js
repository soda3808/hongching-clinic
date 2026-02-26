// ══════════════════════════════════
// Multi-Tenant Configuration Module
// Replaces hardcoded clinic names, stores, doctors, services
// ══════════════════════════════════

import { getTenantConfig } from './auth';

// Fallback defaults (used when tenant config not loaded / legacy mode)
const FALLBACK = {
  name: '康晴綜合醫療中心',
  nameEn: 'Hong Ching Medical Centre',
  stores: [
    { name: '宋皇臺', address: '馬頭涌道97號美誠大廈地下' },
    { name: '太子', address: '長沙灣道28號長康大廈地下' },
  ],
  doctors: ['許植輝', '曾其方', '常凱晴'],
  services: [
    { label: '診金', fee: 350, active: true },
    { label: '針灸', fee: 450, active: true },
    { label: '推拿', fee: 350, active: true },
    { label: '天灸', fee: 388, active: true },
    { label: '拔罐', fee: 250, active: true },
    { label: '刮痧', fee: 300, active: true },
    { label: '針灸+推拿', fee: 650, active: true },
    { label: '初診', fee: 450, active: true },
  ],
  settings: { businessHours: '10:00-20:00' },
};

export function getClinicName() {
  const t = getTenantConfig();
  return t?.name || FALLBACK.name;
}

export function getClinicNameEn() {
  const t = getTenantConfig();
  return t?.nameEn || FALLBACK.nameEn;
}

export function getClinicLogo() {
  const t = getTenantConfig();
  return t?.logoUrl || null;
}

export function getTenantStores() {
  const t = getTenantConfig();
  if (t?.stores?.length) return t.stores.map(s => typeof s === 'string' ? { name: s } : s);
  return FALLBACK.stores;
}

export function getTenantStoreNames() {
  return getTenantStores().map(s => s.name);
}

export function getTenantDoctors() {
  const t = getTenantConfig();
  return t?.doctors?.length ? t.doctors : FALLBACK.doctors;
}

export function getTenantServices() {
  const t = getTenantConfig();
  return t?.services?.length ? t.services : FALLBACK.services;
}

export function getTenantSettings() {
  const t = getTenantConfig();
  return t?.settings || FALLBACK.settings;
}

export function getTenantSlug() {
  const t = getTenantConfig();
  return t?.slug || 'hongching';
}

export function isTenantLoaded() {
  return !!getTenantConfig();
}
