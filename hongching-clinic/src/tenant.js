// ══════════════════════════════════
// Multi-Tenant Configuration Module
// Replaces hardcoded clinic names, stores, doctors, services
// Includes URL-based tenant detection, dynamic loading, and theming
// ══════════════════════════════════

import { getTenantConfig } from './auth';

const TENANT_SLUG_KEY = 'hcmc_tenant_slug';
const TENANT_KEY = 'hcmc_tenant';

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

// ══════════════════════════════════
// Tenant URL Detection
// ══════════════════════════════════

/**
 * Detect tenant slug from URL subdomain, query param, or localStorage fallback.
 * Priority:
 *   1. Subdomain: e.g. acme.clinicapp.vercel.app -> 'acme'
 *   2. Query param: ?tenant=acme
 *   3. localStorage saved slug
 * Returns slug string or null.
 */
export function detectTenant() {
  // 1. Check subdomain
  try {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    // For patterns like acme.clinicapp.vercel.app (4 parts) or acme.example.com (3 parts)
    // Exclude www, localhost, and bare domains
    if (parts.length >= 3) {
      const sub = parts[0].toLowerCase();
      // Skip common non-tenant subdomains
      if (sub !== 'www' && sub !== 'localhost' && sub !== 'app') {
        return sub;
      }
    }
  } catch { /* ignore */ }

  // 2. Check query param ?tenant=slug
  try {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');
    if (tenantParam) {
      return tenantParam.toLowerCase().replace(/[^a-z0-9-]/g, '');
    }
  } catch { /* ignore */ }

  // 3. Fall back to localStorage saved tenant slug
  try {
    const saved = localStorage.getItem(TENANT_SLUG_KEY);
    if (saved) return saved;
  } catch { /* ignore */ }

  return null;
}

/**
 * Load tenant config by slug from Supabase (via public API).
 * Stores result in sessionStorage so subsequent calls are fast.
 * Returns tenant config object or null.
 */
export async function loadTenantBySlug(slug) {
  if (!slug) return null;

  // Check if already loaded in sessionStorage
  try {
    const cached = sessionStorage.getItem(TENANT_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.slug === slug) return parsed;
    }
  } catch { /* ignore */ }

  // Fetch from Supabase via REST API (public, no auth needed for tenant lookup)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;

    const res = await fetch(
      `${supabaseUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      }
    );

    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows?.length) return null;

    const row = rows[0];
    const tenantConfig = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      nameEn: row.name_en,
      logoUrl: row.logo_url,
      stores: row.stores || [],
      doctors: row.doctors || [],
      services: row.services || [],
      settings: row.settings || {},
    };

    // Save to sessionStorage and localStorage
    sessionStorage.setItem(TENANT_KEY, JSON.stringify(tenantConfig));
    localStorage.setItem(TENANT_SLUG_KEY, slug);

    return tenantConfig;
  } catch {
    return null;
  }
}

/**
 * Initialize tenant: run detection + loading.
 * Call this on app initialization (before login).
 * Returns tenant config or null.
 */
export async function initTenant() {
  const slug = detectTenant();
  if (!slug) return null;

  // Save detected slug for future sessions
  try {
    localStorage.setItem(TENANT_SLUG_KEY, slug);
  } catch { /* ignore */ }

  const tenant = await loadTenantBySlug(slug);
  if (tenant) {
    applyTenantTheme();
  }
  return tenant;
}

// ══════════════════════════════════
// Tenant Theming
// ══════════════════════════════════

/**
 * Shift a hex color lighter (positive percent) or darker (negative percent).
 * @param {string} hex - Hex color like '#0e7490'
 * @param {number} percent - Percentage to shift (-100 to 100). Negative = darker, positive = lighter.
 * @returns {string} Adjusted hex color
 */
export function shadeColor(hex, percent) {
  // Remove # if present
  let color = hex.replace(/^#/, '');
  // Expand shorthand (e.g. 'abc' -> 'aabbcc')
  if (color.length === 3) {
    color = color[0] + color[0] + color[1] + color[1] + color[2] + color[2];
  }

  const num = parseInt(color, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;

  if (percent > 0) {
    // Lighten: blend toward white
    r = Math.round(r + (255 - r) * (percent / 100));
    g = Math.round(g + (255 - g) * (percent / 100));
    b = Math.round(b + (255 - b) * (percent / 100));
  } else {
    // Darken: blend toward black
    const factor = (100 + percent) / 100;
    r = Math.round(r * factor);
    g = Math.round(g * factor);
    b = Math.round(b * factor);
  }

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/**
 * Apply tenant theme colors and update page metadata.
 * Reads tenant config from session and sets CSS custom properties,
 * meta theme-color, and document title.
 */
export function applyTenantTheme() {
  const t = getTenantConfig();
  const primaryColor = t?.settings?.primaryColor || '#0e7490';
  const clinicName = t?.name || FALLBACK.name;

  const root = document.documentElement;

  // Set CSS custom properties for teal color scale
  root.style.setProperty('--teal-500', primaryColor);
  root.style.setProperty('--teal-600', shadeColor(primaryColor, -15));
  root.style.setProperty('--teal-700', shadeColor(primaryColor, -30));
  root.style.setProperty('--teal-50', shadeColor(primaryColor, 92));
  root.style.setProperty('--teal-100', shadeColor(primaryColor, 80));
  root.style.setProperty('--teal-200', shadeColor(primaryColor, 65));

  // Update meta[name="theme-color"]
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', primaryColor);
  }

  // Update document title
  document.title = `${clinicName} 管理系統`;
}

// ══════════════════════════════════
// Existing tenant config accessors
// ══════════════════════════════════

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
