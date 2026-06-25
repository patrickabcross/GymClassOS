// ---------------------------------------------------------------------------
// GSG-01: studio-global site/location names resolver.
//
// Resolves the studio's configured site/location names from the `sites` column
// of `studio_owner_config`.
//
// Input: the `sites` value from `studio_owner_config` (may be a JSON string
//   array from a TEXT column, a pre-parsed array from a JSONB column via the
//   Neon HTTP driver, null when never configured, or undefined).
//
// Rules:
//   - null / undefined / empty string → [] (gym-agnostic empty default —
//     NO hardcoded site names here; HUSTLE's sites are seeded as DATA)
//   - JSON string → parse in try/catch; fall back to [] on error
//   - Already-parsed array → filter and normalise directly
//   - Non-array JSON (object, number, etc.) → []
//   - Each element: must be a non-empty string after trimming; de-duped
//     (stable/insertion order); any non-string or whitespace-only entry dropped
//
// Lives in server/lib/ (NOT server/plugins/ — Nitro/Vercel gotcha: plugins
// must export a default Nitro plugin shape; plain helpers go in server/lib/).
// ---------------------------------------------------------------------------

/**
 * Resolve the studio's configured site/location names.
 *
 * @param configJson  Value of `studio_owner_config.sites`. Accepts a JSON
 *   string array, a pre-parsed array (JSONB driver), null, or undefined.
 *   All inputs are safe — never throws.
 * @returns  Array of trimmed, non-empty, de-duplicated site names (stable
 *   order). Gym-agnostic EMPTY-array default when unset/invalid.
 */
export function resolveSites(
  configJson: string | unknown[] | null | undefined,
): string[] {
  if (!configJson) return [];

  let arr: unknown;

  if (Array.isArray(configJson)) {
    arr = configJson;
  } else if (typeof configJson === "string") {
    try {
      arr = JSON.parse(configJson);
    } catch {
      return [];
    }
  } else {
    return [];
  }

  if (!Array.isArray(arr)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}
