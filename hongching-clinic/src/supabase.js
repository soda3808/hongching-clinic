// ══════════════════════════════════
// Supabase Client (with RLS-aware JWT)
// ══════════════════════════════════

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const SB_TOKEN_KEY = 'hcmc_sb_token';

// Create Supabase client with dynamic access token for RLS tenant isolation
// When a Supabase JWT is available (after login), it will be used instead of the anon key.
// This JWT contains tenant_id in its claims, enabling RLS policies to filter by tenant.
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {},
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

// Set the Supabase JWT after login — enables RLS tenant isolation
export function setSupabaseToken(token) {
  if (!token) {
    sessionStorage.removeItem(SB_TOKEN_KEY);
    return;
  }
  sessionStorage.setItem(SB_TOKEN_KEY, token);
  if (supabase) {
    // Update the REST client's headers to use the tenant-scoped JWT
    supabase.rest.headers = {
      ...supabase.rest.headers,
      Authorization: `Bearer ${token}`,
    };
    // Also update realtime auth
    try { supabase.realtime.setAuth(token); } catch {}
  }
}

// Restore Supabase JWT from session (called on page load)
export function restoreSupabaseToken() {
  const token = sessionStorage.getItem(SB_TOKEN_KEY);
  if (token && supabase) {
    supabase.rest.headers = {
      ...supabase.rest.headers,
      Authorization: `Bearer ${token}`,
    };
    try { supabase.realtime.setAuth(token); } catch {}
  }
}

// Clear Supabase JWT on logout
export function clearSupabaseToken() {
  sessionStorage.removeItem(SB_TOKEN_KEY);
  if (supabase) {
    // Revert to anon key
    supabase.rest.headers = {
      ...supabase.rest.headers,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    };
  }
}

export const isSupabaseConfigured = () => !!supabase;
