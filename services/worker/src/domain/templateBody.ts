/**
 * Worker-local template-body renderer (quick-260615-r6t).
 *
 * Mirrors the logic of `apps/staff-web/app/lib/templateBody.ts` but lives inside
 * the worker so the fork boundary holds: services/worker/** never imports from
 * apps/staff-web. KEEP THESE TWO FILES IN SEMANTIC SYNC.
 *
 * Outbound template sends store the var map (keyed by placeholder index, e.g.
 * `{ "1": "Patrick", "2": "Yoga" }`) and the approved template's BODY text lives
 * in `whatsapp_templates.components_json`. Inside the 24h window we render that
 * BODY (vars substituted) and send it as free `text` so the member sees a real
 * sentence instead of a template-name stub; outside the window we keep the real
 * approved-template send (Meta requires templates out of window).
 *
 * None of these functions throw — they fall back to `null` so a missing or
 * malformed template row can never crash the send loop. Callers treat a null/
 * empty render as "fall back to the real template send" (never send empty text;
 * MYÜTIK's text branch rejects an empty body).
 */

/**
 * Substitute every `{{N}}` token in `bodyText` using `vars[N]`. Unknown
 * placeholders (no matching key) are left intact so a partial vars map degrades
 * gracefully instead of blanking the message.
 */
export function renderTemplateBody(
  bodyText: string,
  vars: Record<string, string> | undefined,
): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const value = vars?.[n];
    return value ?? match;
  });
}

/**
 * Extract the BODY component `text` from a `whatsapp_templates.components_json`
 * value. Accepts a JSON string, an already-parsed wrapped object
 * (`{ components: [...] }`), or a bare components array. Returns `null` when the
 * input is missing, unparseable, or has no BODY component — never throws.
 *
 * The BODY component `type` is uppercase in the seeded MYÜTIK sync rows; we
 * match it case-insensitively to be safe.
 */
export function extractBodyText(componentsJson: unknown): string | null {
  let parsed: unknown = componentsJson;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const components: unknown = Array.isArray(parsed)
    ? parsed
    : (parsed as { components?: unknown }).components;

  if (!Array.isArray(components)) return null;

  for (const component of components) {
    if (
      component &&
      typeof component === "object" &&
      typeof (component as { type?: unknown }).type === "string" &&
      /^body$/i.test((component as { type: string }).type)
    ) {
      const text = (component as { text?: unknown }).text;
      return typeof text === "string" ? text : null;
    }
  }

  return null;
}

/**
 * Render the final, var-substituted BODY text for an approved template given
 * its raw `components_json` value and a placeholder-indexed vars map.
 *
 * Returns the rendered string, or `null` when no BODY text can be extracted.
 * Never returns an empty string for a present-but-empty body: an empty render
 * collapses to `null` so the caller falls back to the real template send (a
 * non-empty body that renders to empty is impossible because empty BODY text
 * yields `null` from extractBodyText).
 */
export function renderApprovedTemplateBody(
  componentsJson: unknown,
  vars: Record<string, string> | undefined,
): string | null {
  const bodyText = extractBodyText(componentsJson);
  if (typeof bodyText !== "string" || bodyText.length === 0) return null;
  const rendered = renderTemplateBody(bodyText, vars);
  if (rendered.length === 0) return null;
  return rendered;
}
