-- Migration 001: Create password_resets table
-- Required by: api/auth/reset-request.js, api/auth/reset.js
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token) WHERE used = false;

-- Index for cleanup of expired tokens
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at) WHERE used = false;

-- Auto-delete expired tokens after 24 hours (cron handles this too, belt + suspenders)
-- Note: Supabase doesn't support pg_cron by default, so data-retention.js cron handles cleanup
