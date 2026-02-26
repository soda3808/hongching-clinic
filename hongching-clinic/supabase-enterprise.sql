-- ══════════════════════════════════════════════════
-- Enterprise SaaS Migration — Multi-Tenant + Security
-- Run this AFTER supabase-schema.sql
-- ══════════════════════════════════════════════════

-- ── 1. Tenants Table ──
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  logo_url TEXT,
  stores JSONB DEFAULT '[]'::jsonb,
  doctors JSONB DEFAULT '[]'::jsonb,
  services JSONB DEFAULT '[]'::jsonb,
  settings JSONB DEFAULT '{}'::jsonb,
  plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic','pro','enterprise')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Users Table (replaces hardcoded config.js) ──
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','doctor','staff','superadmin')),
  email TEXT,
  stores JSONB DEFAULT '["all"]'::jsonb,
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, username)
);

-- ── 3. Audit Logs Table (immutable) ──
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_date ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);

-- ── 4. Consent Management (PDPO) ──
CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  patient_id TEXT NOT NULL,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  version TEXT NOT NULL DEFAULT '1.0',
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  method TEXT DEFAULT 'digital',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consent_patient ON consents(tenant_id, patient_id);

-- ── 5. Data Subject Access Requests (PDPO) ──
CREATE TABLE IF NOT EXISTS dsar_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  request_type TEXT NOT NULL CHECK (request_type IN ('access','correction','deletion','portability')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  handler_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Add tenant_id to ALL existing tables ──
DO $$ BEGIN
  -- Revenue
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='revenue' AND column_name='tenant_id') THEN
    ALTER TABLE revenue ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Expenses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expenses' AND column_name='tenant_id') THEN
    ALTER TABLE expenses ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Patients
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patients' AND column_name='tenant_id') THEN
    ALTER TABLE patients ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Bookings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='tenant_id') THEN
    ALTER TABLE bookings ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Consultations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='consultations' AND column_name='tenant_id') THEN
    ALTER TABLE consultations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Inventory
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' AND column_name='tenant_id') THEN
    ALTER TABLE inventory ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Queue
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='queue' AND column_name='tenant_id') THEN
    ALTER TABLE queue ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- ARAP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='arap' AND column_name='tenant_id') THEN
    ALTER TABLE arap ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Packages
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='packages' AND column_name='tenant_id') THEN
    ALTER TABLE packages ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Enrollments
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='enrollments' AND column_name='tenant_id') THEN
    ALTER TABLE enrollments ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='tenant_id') THEN
    ALTER TABLE products ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- ProductSales
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='productSales' AND column_name='tenant_id') THEN
    ALTER TABLE "productSales" ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Leaves
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leaves' AND column_name='tenant_id') THEN
    ALTER TABLE leaves ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Payslips
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payslips' AND column_name='tenant_id') THEN
    ALTER TABLE payslips ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Sickleaves
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='sickleaves' AND column_name='tenant_id') THEN
    ALTER TABLE sickleaves ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Surveys
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='surveys' AND column_name='tenant_id') THEN
    ALTER TABLE surveys ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Inquiries
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inquiries' AND column_name='tenant_id') THEN
    ALTER TABLE inquiries ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
  -- Conversations
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='tenant_id') THEN
    ALTER TABLE conversations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  END IF;
END $$;

-- ── 7. Enable Row Level Security on ALL tables ──
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
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE "productSales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE sickleaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsar_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS Policies — Service role bypass (for server-side API) ──
-- Service role key bypasses RLS automatically in Supabase
-- Anon key policies: allow access only with matching tenant_id

-- Helper: create tenant isolation policy for a table
-- Note: These policies allow full CRUD when tenant_id matches
-- The server sets the tenant context before queries

-- For tables with tenant_id: allow all operations if tenant matches
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
    -- Drop existing policy if any
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbl);
    -- Create new policy
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting(''app.tenant_id'', true)::uuid)',
      tbl
    );
  END LOOP;
END $$;

-- ProductSales (quoted table name)
DROP POLICY IF EXISTS tenant_isolation ON "productSales";
CREATE POLICY tenant_isolation ON "productSales" FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Audit logs: read own tenant, insert any
DROP POLICY IF EXISTS audit_read ON audit_logs;
CREATE POLICY audit_read ON audit_logs FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);
DROP POLICY IF EXISTS audit_insert ON audit_logs;
CREATE POLICY audit_insert ON audit_logs FOR INSERT WITH CHECK (true);

-- Users table: only own tenant
DROP POLICY IF EXISTS users_tenant ON users;
CREATE POLICY users_tenant ON users FOR ALL USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Tenants table: own tenant only
DROP POLICY IF EXISTS tenants_own ON tenants;
CREATE POLICY tenants_own ON tenants FOR ALL USING (id = current_setting('app.tenant_id', true)::uuid);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ── 9. Seed Hong Ching as first tenant ──
INSERT INTO tenants (slug, name, name_en, stores, doctors, services, settings)
VALUES (
  'hongching',
  '康晴綜合醫療中心',
  'Hong Ching Medical Centre',
  '[{"name":"宋皇臺","address":"馬頭涌道97號美誠大廈地下","phone":""},{"name":"太子","address":"長沙灣道28號長康大廈地下","phone":""}]'::jsonb,
  '["許植輝","曾其方","常凱晴"]'::jsonb,
  '[{"label":"診金","fee":350,"active":true},{"label":"針灸","fee":450,"active":true},{"label":"推拿","fee":350,"active":true},{"label":"天灸","fee":388,"active":true},{"label":"拔罐","fee":250,"active":true},{"label":"刮痧","fee":300,"active":true},{"label":"針灸+推拿","fee":650,"active":true},{"label":"初診","fee":450,"active":true}]'::jsonb,
  '{"businessHours":"10:00-20:00","closedDays":["日"]}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ── 10. Migrate existing data to hongching tenant ──
DO $$
DECLARE
  tid UUID;
BEGIN
  SELECT id INTO tid FROM tenants WHERE slug = 'hongching';
  IF tid IS NOT NULL THEN
    UPDATE revenue SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE expenses SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE patients SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE bookings SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE consultations SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE inventory SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE queue SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE arap SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE packages SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE enrollments SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE products SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE "productSales" SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE leaves SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE payslips SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE sickleaves SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE surveys SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE inquiries SET tenant_id = tid WHERE tenant_id IS NULL;
    UPDATE conversations SET tenant_id = tid WHERE tenant_id IS NULL;
  END IF;
END $$;

-- Done! Run this migration in Supabase SQL Editor.
-- After running, set SUPABASE_SERVICE_KEY in Vercel env vars
-- (service role key bypasses RLS for server-side operations).
