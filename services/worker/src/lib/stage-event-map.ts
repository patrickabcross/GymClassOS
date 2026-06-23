/**
 * Worker-side copy of the stageEventMap resolver.
 *
 * WHY this is duplicated from apps/staff-web/server/lib/stage-event-map.ts:
 * The worker is a SEPARATE build and does NOT import from apps/staff-web.
 * Importing staff-web code would pull in Nitro + H3 + framework deps that
 * are incompatible with the worker's plain Node/pg-boss runtime.
 *
 * KEEP IN SYNC with apps/staff-web/server/lib/stage-event-map.ts whenever
 * DEFAULT_STAGE_EVENT_MAP defaults or resolver logic changes.
 */

export const DEFAULT_STAGE_EVENT_MAP = {
  lead: "Lead",
  contact: "Contact",
  purchase: "Purchase",
  schedule: "Schedule",
} as const;

export type StageKey = keyof typeof DEFAULT_STAGE_EVENT_MAP;

/**
 * Resolve the Meta event name for a funnel stage, applying any studio
 * override from `studio_owner_config.meta_stage_event_map`.
 *
 * Accepts BOTH a raw JSON string (TEXT column from Postgres) and an
 * already-parsed object (JSONB driver pre-parsed case) so the caller never
 * has to know which form arrived.
 *
 * Never throws — malformed JSON or invalid values silently fall back to
 * DEFAULT_STAGE_EVENT_MAP.
 */
export function resolveStageEvent(
  config: string | Record<string, string> | null | undefined,
  stage: StageKey,
): string {
  if (!config) return DEFAULT_STAGE_EVENT_MAP[stage];

  let map: Record<string, string>;
  if (typeof config === "string") {
    try {
      map = JSON.parse(config) as Record<string, string>;
    } catch {
      return DEFAULT_STAGE_EVENT_MAP[stage];
    }
  } else {
    map = config;
  }

  const v = map[stage];
  return typeof v === "string" && v.length > 0
    ? v
    : DEFAULT_STAGE_EVENT_MAP[stage];
}
