-- v4.9.0 managed relay grant migration.
-- This file is intentionally separate from schema-redemptions.sql so an
-- already-deployed redemption migration can still receive the later table.
-- It stores no model key, prompt, audio, or AI output.
CREATE TABLE IF NOT EXISTS cwb_license_relay_grants (
  grant_id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES cwb_license_redemption_campaigns(campaign_id),
  license_id text NOT NULL REFERENCES cwb_licenses(license_id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (campaign_id, license_id)
);
CREATE INDEX IF NOT EXISTS cwb_license_relay_grants_license_idx
  ON cwb_license_relay_grants(license_id, workspace_id, status);
