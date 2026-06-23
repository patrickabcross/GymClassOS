// ---------------------------------------------------------------------------
// MC1-01: stageEventMap pure resolver (D-05 spec — full 4-event map).
//
// Resolves the Meta Conversions API event name for a given CRM stage key.
// MC1 uses only "lead"; MC2 will use "contact", "purchase", "schedule".
//
// Input: the `meta_stage_event_map` value from `studio_owner_config` (may be
//   a JSON string from a TEXT column, a parsed object from a JSONB column via
//   the Neon HTTP driver, null when never configured, or undefined).
//
// Rules:
//   - null / undefined / empty string → DEFAULT_STAGE_EVENT_MAP[stage]
//   - JSON string → parse; missing/empty/null key → default
//   - Already-parsed object → read stage key directly; missing → default
//   - Any parse error → default (never throws)
//
// Lives in server/lib/ (NOT server/plugins/ — Nitro/Vercel gotcha: plugins
// must export a default Nitro plugin shape; plain helpers go in server/lib/).
// ---------------------------------------------------------------------------

export const DEFAULT_STAGE_EVENT_MAP = {
  lead: "Lead",
  contact: "Contact",
  purchase: "Purchase",
  schedule: "Schedule",
} as const;

export type StageKey = keyof typeof DEFAULT_STAGE_EVENT_MAP;

/**
 * Resolve the Meta Conversions API event name for a stage key.
 *
 * @param configJson  Value of `studio_owner_config.meta_stage_event_map`.
 *                    Accepts a JSON string, a pre-parsed object (JSONB driver),
 *                    null, or undefined. All inputs are safe — never throws.
 * @param stage       One of "lead" | "contact" | "purchase" | "schedule".
 * @returns           The configured event name, or the default for that stage.
 */
export function resolveStageEvent(
  configJson: string | Record<string, string> | null | undefined,
  stage: StageKey,
): string {
  if (!configJson) return DEFAULT_STAGE_EVENT_MAP[stage];

  // Object branch: JSONB driver may return a pre-parsed object.
  if (typeof configJson === "object") {
    const v = configJson[stage];
    return typeof v === "string" && v.length > 0
      ? v
      : DEFAULT_STAGE_EVENT_MAP[stage];
  }

  // String branch: JSON-encoded map (empty string covered by !configJson above).
  try {
    const map = JSON.parse(configJson) as Record<string, string>;
    const v = map[stage];
    return typeof v === "string" && v.length > 0
      ? v
      : DEFAULT_STAGE_EVENT_MAP[stage];
  } catch {
    return DEFAULT_STAGE_EVENT_MAP[stage];
  }
}
