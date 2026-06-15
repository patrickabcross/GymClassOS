-- P1c.1 (2026-06-12) — Stripe Connect: connected (Custom-equivalent) accounts.
-- Strictly additive — no rename/drop per CLAUDE.md no-breaking-DB-changes guard.
-- Applied direct to gymos-demo Neon via Neon MCP (not runMigrations / drizzle-kit push).
-- Single-tenant: no studio_id FK. studio_label is a descriptive text column only.

CREATE TABLE IF NOT EXISTS connected_accounts (
  id               text PRIMARY KEY,           -- "acct_xxx"
  studio_label     text,                       -- descriptive only; single-tenant, no studio_id FK
  charges_enabled  boolean NOT NULL DEFAULT false,
  payouts_enabled  boolean NOT NULL DEFAULT false,
  requirements_due text,                        -- JSON array string of requirements.currently_due
  disabled_reason  text,
  raw_json         text NOT NULL DEFAULT '{}',
  created_at       text NOT NULL DEFAULT (now()::text),
  updated_at       text NOT NULL DEFAULT (now()::text)
);
