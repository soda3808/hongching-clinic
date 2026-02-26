-- Migration 003: Enable RLS on ALL data tables
-- This is CRITICAL for multi-tenant security
-- Run this in Supabase SQL Editor

-- Enable RLS on all data tables
ALTER TABLE revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE arap ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productSales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sickleaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies for each table
-- Note: These use the service_role key which bypasses RLS,
-- so the app's Supabase client (using anon key) will be restricted.
-- The API layer also filters by tenant_id as defense-in-depth.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'revenue', 'expenses', 'patients', 'bookings', 'consultations',
    'inventory', 'queue', 'arap', 'packages', 'enrollments',
    'conversations', 'products', 'productSales', 'leaves',
    'payslips', 'sickleaves', 'surveys', 'inquiries'
  ]
  LOOP
    -- Drop existing policy if any (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    -- Create tenant isolation policy
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      t
    );
  END LOOP;
END $$;

-- Users table: users can only see users in their own tenant
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Audit logs: tenant isolation + immutable (no update/delete)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
CREATE POLICY tenant_isolation_audit ON audit_logs
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- Only allow insert (immutable audit trail)
DROP POLICY IF EXISTS audit_insert_only ON audit_logs;
CREATE POLICY audit_insert_only ON audit_logs
  FOR INSERT WITH CHECK (true);

-- Tenants table: only superadmin can see all, others see their own
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenant_self ON tenants
  FOR ALL USING (id = current_setting('app.tenant_id', true)::uuid);
