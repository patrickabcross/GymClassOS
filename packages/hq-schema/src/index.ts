/**
 * packages/hq-schema/src/index.ts
 *
 * Public barrel for @gymos/hq-schema. Re-exports the HQ Drizzle table
 * definitions, the ordered migration list, the HQ identity constants, and
 * the migration bookkeeping table name so both apps/hq and services/hq-worker
 * can consume them without duplicating any string.
 */

export * from "./schema.js";
export * from "./migrations.js";
export * from "./constants.js";
export * from "./telemetry.js";

/**
 * The name of the runMigrations bookkeeping table for HQ.
 *
 * Intentionally distinct from the staff-web "mail_migrations" table so HQ
 * version bookkeeping never collides with the staff-web migration sequence on
 * a shared Neon instance (see core runMigrations.ts for why this matters).
 */
export const HQ_MIGRATIONS_TABLE = "hq_migrations";
