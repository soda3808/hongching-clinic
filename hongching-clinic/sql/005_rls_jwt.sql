-- Migration 005: Update RLS policies to use JWT claims
-- This fixes the critical issue where current_setting('app.tenant_id') never gets set
-- because PostgREST does not support PostgreSQL session variables.
--
-- Instead, we use auth.jwt() which reads claims from the Authorization Bearer token.
-- The login endpoint now mints a Supabase-compatible JWT containing tenant_id.
--
-- Run this in Supabase SQL Editor AFTER 004_tenant_indexes.sql

-- ── Update tenant isolation policies for all data tables ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'revenue','expenses','patients','bookings','consultations',
    'inventory','queue','arap','packages','enrollments',
    'products','leaves','payslips','sickleaves','surveys',
    'inquiries','conversations','consents','dsar_requests'
  ] LOOP
    -- Drop old policy
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    -- Create JWT-based tenant isolation policy
    -- Allows access if: tenant_id is NULL (legacy) OR matches JWT claim
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (
        tenant_id IS NULL
        OR tenant_id = COALESCE(
          (current_setting(''request.jwt.claims'', true)::jsonb ->> ''tenant_id'')::uuid,
          (current_setting(''app.tenant_id'', true))::uuid
        )
      )',
      tbl
    );
  END LOOP;
END $$;

-- ProductSales (quoted table name)
DROP POLICY IF EXISTS tenant_isolation ON "productSales";
CREATE POLICY tenant_isolation ON "productSales" FOR ALL USING (
  tenant_id IS NULL
  OR tenant_id = COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    (current_setting('app.tenant_id', true))::uuid
  )
);

-- Audit logs: tenant-scoped read, unrestricted insert
DROP POLICY IF EXISTS audit_read ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation ON audit_logs;
DROP POLICY IF EXISTS tenant_isolation_audit ON audit_logs;
CREATE POLICY audit_read ON audit_logs FOR SELECT USING (
  tenant_id IS NULL
  OR tenant_id = COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    (current_setting('app.tenant_id', true))::uuid
  )
);
DROP POLICY IF EXISTS audit_insert ON audit_logs;
DROP POLICY IF EXISTS audit_insert_only ON audit_logs;
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);

-- Users table: own tenant only
DROP POLICY IF EXISTS users_tenant ON users;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY users_tenant ON users FOR ALL USING (
  tenant_id IS NULL
  OR tenant_id = COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    (current_setting('app.tenant_id', true))::uuid
  )
);

-- Tenants table: own tenant only
DROP POLICY IF EXISTS tenants_own ON tenants;
DROP POLICY IF EXISTS tenant_self ON tenants;
CREATE POLICY tenants_own ON tenants FOR ALL USING (
  id = COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    (current_setting('app.tenant_id', true))::uuid
  )
);
