-- Counselor Desk commercial service schema.
-- This database contains licenses and order metadata only. It must never
-- receive student records, business attachments, model API keys, or prompts.

CREATE TABLE IF NOT EXISTS cwb_products (
  plan text PRIMARY KEY,
  product_id text NOT NULL,
  label text NOT NULL,
  ai_enabled boolean NOT NULL DEFAULT false,
  perpetual_updates boolean NOT NULL DEFAULT false,
  major_version integer NOT NULL CHECK (major_version BETWEEN 1 AND 99),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'CNY',
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO cwb_products (plan, product_id, label, ai_enabled, perpetual_updates, major_version, price_minor, currency, metadata)
VALUES
  ('standard', 'counselor-desk', '普通版', false, false, 4, 1000, 'CNY', '{"description":"完整业务功能；当前主版本内的安全和必要修复","display_price":"10 元"}'::jsonb),
  ('standard_perpetual', 'counselor-desk', '普通永久更新版', false, true, 4, 2000, 'CNY', '{"description":"完整业务功能；后续核心版本持续更新","display_price":"20 元"}'::jsonb),
  ('ai', 'counselor-desk', 'AI 增强版', true, false, 4, 4000, 'CNY', '{"description":"完整业务功能；当前主版本 AI 能力","display_price":"40 元"}'::jsonb),
  ('ai_perpetual', 'counselor-desk', '永久 AI 增强版', true, true, 4, 6000, 'CNY', '{"description":"完整业务功能；后续核心与 AI 版本持续更新","display_price":"60 元"}'::jsonb)
ON CONFLICT (plan) DO UPDATE SET
  product_id=EXCLUDED.product_id,
  label=EXCLUDED.label,
  ai_enabled=EXCLUDED.ai_enabled,
  perpetual_updates=EXCLUDED.perpetual_updates,
  major_version=EXCLUDED.major_version,
  price_minor=EXCLUDED.price_minor,
  currency=EXCLUDED.currency,
  metadata=EXCLUDED.metadata,
  updated_at=now();

CREATE TABLE IF NOT EXISTS cwb_orders (
  order_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  request_hash text NOT NULL,
  product_id text NOT NULL,
  plan text NOT NULL REFERENCES cwb_products(plan),
  customer_email text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL,
  provider text,
  provider_order_id text,
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'fulfilled', 'refunded', 'cancelled', 'failed')),
  access_token_hash text NOT NULL,
  access_token_expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cwb_orders ADD COLUMN IF NOT EXISTS request_hash text;
ALTER TABLE cwb_orders ADD COLUMN IF NOT EXISTS access_token_expires_at timestamptz;
CREATE INDEX IF NOT EXISTS cwb_orders_email_idx ON cwb_orders(customer_email);
CREATE INDEX IF NOT EXISTS cwb_orders_status_idx ON cwb_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS cwb_orders_request_hash_idx ON cwb_orders(request_hash);

CREATE TABLE IF NOT EXISTS cwb_licenses (
  license_id text PRIMARY KEY,
  order_id text UNIQUE REFERENCES cwb_orders(order_id),
  product_id text NOT NULL,
  plan text NOT NULL REFERENCES cwb_products(plan),
  workspace_id text,
  token text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  kid text NOT NULL,
  major_version integer NOT NULL CHECK (major_version BETWEEN 1 AND 99),
  device_limit integer NOT NULL CHECK (device_limit BETWEEN 1 AND 3),
  status text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  revoked_after bigint NOT NULL DEFAULT 0,
  issued_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cwb_licenses_workspace_idx ON cwb_licenses(workspace_id);
CREATE INDEX IF NOT EXISTS cwb_licenses_status_idx ON cwb_licenses(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS cwb_license_devices (
  license_id text NOT NULL REFERENCES cwb_licenses(license_id) ON DELETE CASCADE,
  device_id text NOT NULL,
  workspace_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'revoked')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (license_id, device_id)
);
CREATE INDEX IF NOT EXISTS cwb_license_devices_workspace_idx ON cwb_license_devices(workspace_id, status);

CREATE TABLE IF NOT EXISTS cwb_admin_api_keys (
  key_id text PRIMARY KEY,
  label text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  roles jsonb NOT NULL DEFAULT '["operator"]'::jsonb,
  status text NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS cwb_webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error_code text,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE IF NOT EXISTS cwb_email_outbox (
  message_id text PRIMARY KEY,
  order_id text REFERENCES cwb_orders(order_id),
  recipient text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS cwb_email_outbox_due_idx ON cwb_email_outbox(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS cwb_update_manifests (
  manifest_id text PRIMARY KEY,
  version text NOT NULL,
  channel text NOT NULL,
  manifest jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'withdrawn')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, channel)
);
CREATE INDEX IF NOT EXISTS cwb_update_manifests_latest_idx ON cwb_update_manifests(channel, status, published_at DESC);

CREATE TABLE IF NOT EXISTS cwb_audit_events (
  audit_id text PRIMARY KEY,
  actor_type text NOT NULL,
  actor_id text,
  action text NOT NULL,
  subject_type text,
  subject_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cwb_audit_events_created_idx ON cwb_audit_events(created_at DESC);

-- Optional commercial operations. These tables contain no student or model
-- data. A license batch is a delivery/seat grouping; each signed license
-- still keeps the normal one-workspace boundary unless explicitly assigned.
CREATE TABLE IF NOT EXISTS cwb_license_trials (
  trial_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  license_id text NOT NULL UNIQUE REFERENCES cwb_licenses(license_id) ON DELETE CASCADE,
  customer_email text NOT NULL,
  plan text NOT NULL REFERENCES cwb_products(plan),
  started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cwb_license_trials_expiry_idx ON cwb_license_trials(status, expires_at);

CREATE TABLE IF NOT EXISTS cwb_license_batches (
  batch_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  organization_id text,
  customer_email text NOT NULL,
  plan text NOT NULL REFERENCES cwb_products(plan),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 500),
  status text NOT NULL CHECK (status IN ('active', 'partially_revoked', 'revoked')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cwb_license_batch_items (
  batch_id text NOT NULL REFERENCES cwb_license_batches(batch_id) ON DELETE CASCADE,
  license_id text NOT NULL UNIQUE REFERENCES cwb_licenses(license_id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 1),
  workspace_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, ordinal)
);
CREATE INDEX IF NOT EXISTS cwb_license_batch_items_workspace_idx ON cwb_license_batch_items(workspace_id);

CREATE TABLE IF NOT EXISTS cwb_license_organizations (
  organization_id text PRIMARY KEY,
  name text NOT NULL,
  customer_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'closed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cwb_license_organization_workspaces (
  organization_id text NOT NULL REFERENCES cwb_license_organizations(organization_id) ON DELETE CASCADE,
  workspace_id text NOT NULL,
  license_id text REFERENCES cwb_licenses(license_id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS cwb_license_org_workspace_license_idx ON cwb_license_organization_workspaces(license_id);

-- Campaign codes are stored only as hashes. A redemption creates a normal,
-- independently bound license so one shared code never shares device slots.
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

-- Metrics are opt-in and intentionally lossy: the installation identifier is
-- HMAC-hashed before persistence and properties are allow-listed by the API.
CREATE TABLE IF NOT EXISTS cwb_telemetry_events (
  event_id text PRIMARY KEY,
  installation_id_hash text NOT NULL,
  event_name text NOT NULL,
  app_version text NOT NULL,
  platform text NOT NULL,
  arch text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_version text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cwb_telemetry_events_time_idx ON cwb_telemetry_events(occurred_at DESC);
