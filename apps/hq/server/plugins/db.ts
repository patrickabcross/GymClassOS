/**
 * apps/hq/server/plugins/db.ts
 *
 * HQ Nitro db plugin — applies the HQ schema migrations additively via
 * runMigrations against HQ's OWN dedicated Neon project.
 *
 * CONNECTION:
 *   The HQ Neon connection string comes from the DATABASE_URL environment
 *   variable (see apps/hq/.env.example). It MUST be the HQ-dedicated Neon
 *   project (e.g. gymos-hq), NEVER a studio Neon. DATABASE_URL_UNPOOLED is
 *   the direct (non-pooler) connection string used by services/hq-worker.
 *
 * MIGRATION RULES (CLAUDE.md + guard-no-drizzle-push.mjs):
 *   - All SQL is additive: CREATE TABLE IF NOT EXISTS, ALTER TABLE ... ADD
 *     COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
 *   - NEVER use drizzle-kit push, DROP, RENAME, TRUNCATE, or destructive ALTER.
 *   - The migration bookkeeping table is "hq_migrations" (distinct from
 *     staff-web's "mail_migrations") to avoid version-space collisions.
 *
 * EXTENDING:
 *   - BD1-03 adds the HQ org + super-admin seed to hqMigrations in
 *     @gymos/hq-schema/migrations (version 2).
 *   - BD2 adds domain table migrations (version 3+).
 */

import { runMigrations } from "@agent-native/core/db";
import { hqMigrations, HQ_MIGRATIONS_TABLE } from "@gymos/hq-schema";

export default runMigrations(hqMigrations, { table: HQ_MIGRATIONS_TABLE });
