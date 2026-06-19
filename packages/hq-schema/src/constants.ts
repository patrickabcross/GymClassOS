/**
 * packages/hq-schema/src/constants.ts
 *
 * Fixed identity constants for the HQ org seeding (migration v2/v3).
 *
 * These values are baked into runMigrations SQL and must NEVER change after
 * the HQ Neon has been seeded in production. Brain/Dispatch accessFilter/orgId
 * queries reference the org by id; changing HQ_ORG_ID post-seed would break
 * all HQ data queries.
 *
 * BD3 Brain/Dispatch code imports these from @gymos/hq-schema (via the barrel
 * index) so there is a single source of truth — no magic string duplication.
 */

/**
 * Fixed, stable Better-auth organization ID for the HQ operator control plane.
 *
 * Seeded in migration v2 (INSERT INTO organization ... ON CONFLICT DO NOTHING).
 * Brain/Dispatch accessFilter/orgId queries use this ID to scope HQ data.
 * NEVER change this value after the HQ Neon has been seeded in production.
 */
export const HQ_ORG_ID = "hq-org-gymclassos-v1";

/**
 * URL-friendly slug for the HQ organization (Better-auth requires unique slugs).
 * Seeded alongside HQ_ORG_ID in migration v2.
 */
export const HQ_ORG_SLUG = "gymclassos-hq";

/**
 * Fixed ID for the seeded placeholder member row in the Better-auth "member" table.
 * Seeded in migration v3 with user_id "hq-super-admin-placeholder".
 * When the operator signs in for the first time, Better-auth adds the real member
 * row; the placeholder is left in place (harmless, idempotent).
 */
export const HQ_ORG_MEMBER_ID = "hq-member-seed-v1";
