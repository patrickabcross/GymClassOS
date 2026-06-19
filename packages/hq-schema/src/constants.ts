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

// ---------------------------------------------------------------------------
// BD3 HQB — Health Classification Thresholds
// ---------------------------------------------------------------------------
// All thresholds are named constants so they can be tuned without hunting for
// magic literals across the classification engine and its tests.
// ---------------------------------------------------------------------------

/**
 * Studios with last_telemetry_received_at older than this are classified
 * 'stale'. Set to 26h = 25h watchdog threshold + 1h buffer so a single
 * missed push doesn't flip healthy studios to stale instantly.
 */
export const TELEMETRY_STALENESS_HOURS = 26;

/**
 * Active member count below which a studio is classified 'dormant'.
 * A studio with fewer than 5 booking-active members in the snapshot period
 * is considered disengaged.
 */
export const DORMANT_ACTIVE_MEMBERS_THRESHOLD = 5;

/**
 * Outbound messages sent count below which a studio is classified
 * 'under-messaging'. Studios sending fewer than 10 messages per period
 * are not using the WhatsApp channel effectively.
 */
export const UNDER_MESSAGING_THRESHOLD = 10;

/**
 * Retention rate below which a studio is classified 'low-retention'.
 * A retention rate below 50% means more than half of previously active
 * members did not return in the current period.
 */
export const LOW_RETENTION_THRESHOLD = 0.5;

/**
 * Retention rate at or above which a studio is a 'power-user' candidate
 * (also requires POWER_USER_ACTIVE_MEMBERS_THRESHOLD + POWER_USER_MESSAGES_THRESHOLD).
 * 75% retention = healthy, growing studio.
 */
export const POWER_USER_RETENTION_THRESHOLD = 0.75;

/**
 * Active member count at or above which a studio is a 'power-user' candidate.
 * At least 20 booking-active members per period indicates a thriving studio.
 */
export const POWER_USER_ACTIVE_MEMBERS_THRESHOLD = 20;

/**
 * Messages sent count at or above which a studio is a 'power-user' candidate.
 * At least 50 outbound messages per period indicates strong WhatsApp engagement.
 */
export const POWER_USER_MESSAGES_THRESHOLD = 50;

/**
 * Total token spend (input + output) above which a studio's AI usage is
 * notable for the HQ operator console. Used in the future for cost-alert
 * signals; not currently a health classification signal.
 */
export const HIGH_TOKEN_SPEND_THRESHOLD = 10000;
