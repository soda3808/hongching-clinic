-- ═══════════════════════════════════════════════════════
-- Supabase Migration: Standalone Collections
-- Run this in Supabase SQL Editor to create all tables
-- ═══════════════════════════════════════════════════════

-- ── Batch 1: Medicine / Inventory ──

CREATE TABLE IF NOT EXISTS drug_pricing (
  id TEXT PRIMARY KEY,
  pricing JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  date TEXT,
  herb TEXT,
  tier TEXT,
  "oldPrice" NUMERIC,
  "newPrice" NUMERIC,
  change TEXT,
  "user" TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT,
  "contactPerson" TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  "paymentTerms" TEXT,
  "leadTimeDays" TEXT,
  notes TEXT,
  "createdAt" TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  date TEXT,
  type TEXT,
  "itemName" TEXT,
  qty NUMERIC,
  unit TEXT,
  details TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS herb_sourcing (
  id TEXT PRIMARY KEY,
  "herbName" TEXT,
  supplier TEXT,
  "batchNo" TEXT,
  origin TEXT,
  "harvestDate" TEXT,
  "receivedDate" TEXT,
  grade TEXT,
  "expiryDate" TEXT,
  notes TEXT,
  inspection JSONB,
  "createdAt" TEXT,
  "updatedAt" TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Batch 2: Operations / KPI ──

CREATE TABLE IF NOT EXISTS stocktaking (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_targets (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_budget (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_trail (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Batch 3: Finance / Compliance ──

CREATE TABLE IF NOT EXISTS utility_bills (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expiry_records (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disposal_log (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers_mgmt (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Batch 4: Scheduling / Marketing ──

CREATE TABLE IF NOT EXISTS room_bookings (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benchmark_targets (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS renovation_projects (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_schedule (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bday_settings (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bday_log (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Batch 5: Finance / Operations ──

CREATE TABLE IF NOT EXISTS daily_closings (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settlement_locks (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dispensing_log (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS month_close (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leave_balance (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doc_targets (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Batch 6: Emergency / Follow-up / Reminders ──

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_equipment (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drill_log (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS followup_done (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_rules (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminder_log (
  id TEXT PRIMARY KEY,
  data JSONB DEFAULT '{}',
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Enable RLS on all new tables ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'drug_pricing','price_history','suppliers','stock_movements','herb_sourcing',
      'stocktaking','kpi_targets','clinic_budget','audit_trail',
      'utility_bills','expiry_records','disposal_log','checkins','suppliers_mgmt',
      'room_bookings','benchmark_targets','renovation_projects','maintenance_schedule',
      'bday_settings','bday_log',
      'daily_closings','settlement_locks','dispensing_log','recurring_expenses',
      'budgets','month_close','leave_balance','doc_targets',
      'emergency_contacts','emergency_equipment','drill_log',
      'followup_done','reminder_rules','reminder_log'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    -- Allow all operations for authenticated users matching tenant_id
    EXECUTE format(
      'CREATE POLICY IF NOT EXISTS %I ON %I FOR ALL USING (tenant_id = current_setting(''request.jwt.claims'', true)::json->>''tenant_id'' OR tenant_id IS NULL)',
      tbl || '_tenant_policy', tbl
    );
  END LOOP;
END $$;

-- ── Indexes for tenant_id on all tables ──
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'drug_pricing','price_history','suppliers','stock_movements','herb_sourcing',
      'stocktaking','kpi_targets','clinic_budget','audit_trail',
      'utility_bills','expiry_records','disposal_log','checkins','suppliers_mgmt',
      'room_bookings','benchmark_targets','renovation_projects','maintenance_schedule',
      'bday_settings','bday_log',
      'daily_closings','settlement_locks','dispensing_log','recurring_expenses',
      'budgets','month_close','leave_balance','doc_targets',
      'emergency_contacts','emergency_equipment','drill_log',
      'followup_done','reminder_rules','reminder_log'
    ])
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant ON %I (tenant_id)', tbl, tbl);
  END LOOP;
END $$;
