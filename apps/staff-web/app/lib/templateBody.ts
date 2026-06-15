/**
 * Pure, unit-testable helpers for rendering WhatsApp template message bubbles
 * in the staff inbox conversation thread (FIX 2 / quick-260615-lyu).
 *
 * Outbound template messages are stored in `messages` with:
 *   - body:    "[template: <name>]"  (a placeholder fallback)
 *   - payload: JSON.stringify({ name, vars })  where vars is keyed by
 *              placeholder index, e.g. { "1": "Patrick", "2": "everyone" }
 *
 * The real template BODY text lives in `whatsapp_templates.components_json`.
 * Verified shape (Neon, billowing-sun-51091059): the column stores a JSON
 * STRING wrapping an object `{ components: [{ type: "BODY", text, example }, ...] }`.
 * The BODY component `type` is uppercase in the seeded MYÜTIK sync rows; we
 * match it case-insensitively to be safe.
 *
 * None of these functions throw — they fall back to `null` (callers then keep
 * the existing `[template: <name>]` / raw body), so a missing template row or a
 * malformed payload can never crash the inbox render.
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
 * Resolve the rendered body text for an outbound template message.
 *
 * Safely parses the stored `payload` JSON ({ name, vars }), looks up the
 * template's BODY text in `byName` (a name → bodyText map built once from the
 * loader's templates), and returns the var-substituted text. Returns `null`
 * (so the caller falls back to `[template: name]` / raw body) when the payload
 * is malformed, has no name, or the template/body is missing. Never throws.
 */
export function resolveTemplateMessageBody(
  rawPayload: string | null,
  byName: Record<string, string | null>,
): { text: string } | null {
  if (!rawPayload) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;

  const name = (payload as { name?: unknown }).name;
  if (typeof name !== "string") return null;

  const bodyText = byName[name];
  if (typeof bodyText !== "string") return null;

  const rawVars = (payload as { vars?: unknown }).vars;
  const vars =
    rawVars && typeof rawVars === "object" && !Array.isArray(rawVars)
      ? (rawVars as Record<string, string>)
      : undefined;

  return { text: renderTemplateBody(bodyText, vars) };
}
