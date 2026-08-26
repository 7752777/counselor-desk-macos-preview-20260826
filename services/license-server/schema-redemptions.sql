-- v4.9.0 redemption-campaigns: additive migration for already deployed
-- commercial databases. It stores code hashes only, never plaintext codes.
CREATE TABLE IF NOT EXISTS cwb_license_redemption_campaigns (
  campaign_id text PRIMARY KEY,
  product_id text NOT NULL,
  plan text NOT NULL REFERENCES cwb_products(plan),
  code_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cwb_license_redemptions (
  redemption_id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES cwb_license_redemption_campaigns(campaign_id),
  workspace_id text NOT NULL,
  license_id text NOT NULL UNIQUE REFERENCES cwb_licenses(license_id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (campaign_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS cwb_license_redemptions_workspace_idx ON cwb_license_redemptions(workspace_id);

-- A friendship AI code grants access to the maintainer-hosted relay without
-- replacing the customer's normal AI license. It stores no model key or
-- prompt, and the unique pair makes repeated redemption idempotent.
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
CREATE INDEX IF NOT EXISTS cwb_license_relay_grants_license_idx ON cwb_license_relay_grants(license_id, workspace_id, status);
