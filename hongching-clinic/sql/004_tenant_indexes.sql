-- Migration 004: Add indexes on tenant_id for all data tables
-- CRITICAL for query performance in multi-tenant mode
-- Run this in Supabase SQL Editor

-- Core clinical tables
CREATE INDEX IF NOT EXISTS idx_revenue_tenant ON revenue(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_patients_tenant ON patients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant ON bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consultations_tenant ON consultations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_queue_tenant ON queue(tenant_id);

-- Financial tables
CREATE INDEX IF NOT EXISTS idx_arap_tenant ON arap(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslips_tenant ON payslips(tenant_id);

-- Package tables
CREATE INDEX IF NOT EXISTS idx_packages_tenant ON packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON enrollments(tenant_id);

-- Product tables
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_productsales_tenant ON "productSales"(tenant_id);

-- HR tables
CREATE INDEX IF NOT EXISTS idx_leaves_tenant ON leaves(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sickleaves_tenant ON sickleaves(tenant_id);

-- CRM tables
CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_tenant ON inquiries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON surveys(tenant_id);

-- PDPO compliance tables
CREATE INDEX IF NOT EXISTS idx_consents_tenant ON consents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dsar_tenant ON dsar_requests(tenant_id);

-- User lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_revenue_tenant_date ON revenue(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON expenses(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_tenant_date ON bookings(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_patients_tenant_name ON patients(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_consultations_tenant_date ON consultations(tenant_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_queue_tenant_date ON queue(tenant_id, date);
