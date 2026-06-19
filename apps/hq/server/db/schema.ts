/**
 * apps/hq/server/db/schema.ts
 *
 * HQ app schema barrel — re-exports HQ foundation tables from @gymos/hq-schema
 * and the Brain tables defined locally in brain-schema.ts.
 *
 * apps/hq/server/db/index.ts merges these exports into a single Drizzle schema
 * object passed to createGetDb(), mirroring the staff-web pattern.
 */

// HQ foundation tables (hq_app_meta). BD2 will add studio_registry,
// provisioning_runs, telemetry_snapshots via the @gymos/hq-schema package.
export * from "@gymos/hq-schema/schema";
