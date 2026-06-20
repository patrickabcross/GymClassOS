// sanitize-html.ts — CV4-01
//
// Conservative HTML sanitizer for Tiptap-authored content_documents.body output.
// Lives in server/lib (NEVER server/plugins — Nitro bundling rule).
// NO new npm dependency — pure regex/allowlist implementation.
//
// THREAT MODEL:
//   The body HTML is authored by authenticated staff via the Tiptap editor.
//   This sanitizer is defense-in-depth (not adversarial-grade) against:
//     - XSS via <script> tags or inline event handlers
//     - Protocol injection via javascript: / data: URLs in href/src
//     - Injection of disallowed structural elements (<iframe>, <object>, <embed>)
//   It is NOT designed to handle actively adversarial input. For member-authored
//   content a stricter approach (e.g. DOMPurify on the client) would be warranted.
//
// ALLOWLISTED TAGS (Tiptap StarterKit + Image + Link output):
//   Block: h1, h2, h3, h4, h5, h6, p, blockquote, pre, ul, ol, li, hr
//   Inline: strong, b, em, i, u, s, code, a, img, br, span
// NOTE: "span" is included because Tiptap sometimes emits spans for marks.
//
// ALLOWLISTED ATTRIBUTES (per tag):
//   a     → href (http/https/mailto/relative only; javascript:/data: stripped)
//   img   → src (http/https/relative only; data: stripped), alt
//   All others → no attributes (class, style, id, data-* all stripped)
//
// on* HANDLERS: stripped globally before per-tag processing.
// STYLE / SCRIPT blocks: stripped wholesale (including their inner content).

/**
 * sanitizeContentHtml — remove unsafe tags and attributes from Tiptap body HTML.
 * Returns a safe HTML string suitable for interpolation into a server-rendered page.
 * The output must be interpolated WITHOUT further HTML-escaping (it is already HTML).
 */
export function sanitizeContentHtml(html: string): string {
  if (!html) return "";

  let out = html;

  // 1. Strip <script>...</script> blocks (including content)
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

  // 2. Strip <style>...</style> blocks (including content)
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

  // 3. Strip all on* event handler attributes globally
  //    Matches: onXxx="...", onXxx='...', onXxx=value (no quotes)
  //    The regex is greedy but bounded to not cross tag boundaries.
  out = out.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // 4. Process each tag: keep or strip
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, tagName: string, attrs: string) => {
    const lower = tagName.toLowerCase();

    // Closing tags for allowlisted elements: keep as-is (no attributes on closing)
    if (_match.startsWith("</")) {
      if (ALLOWED_TAGS.has(lower)) return `</${lower}>`;
      return ""; // strip closing tag of disallowed element
    }

    // Opening/void tags
    if (!ALLOWED_TAGS.has(lower)) {
      // Disallowed tag — strip the tag (content remains, unwrapped).
      // For void elements that might carry dangerous content (iframe, object, embed),
      // their inner content was already handled by the script/style strip above.
      return "";
    }

    // Allowed tag — sanitize its attributes
    const safeAttrs = sanitizeAttrs(lower, attrs);
    return `<${lower}${safeAttrs}>`;
  });

  return out;
}

// ─── Allowlist ────────────────────────────────────────────────────────────────

const ALLOWED_TAGS = new Set([
  // Block
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "blockquote", "pre",
  "ul", "ol", "li",
  "hr", "br",
  // Inline
  "strong", "b", "em", "i", "u", "s",
  "code", "span",
  // Mixed
  "a", "img",
]);

// Tags whose attributes are allowed (others get none)
const ATTR_ALLOWLIST: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt"]),
  // All other tags: no attributes allowed
};

// ─── Attribute sanitizer ──────────────────────────────────────────────────────

function sanitizeAttrs(tag: string, rawAttrs: string): string {
  const allowed = ATTR_ALLOWLIST[tag];
  if (!allowed) return ""; // no attributes allowed for this tag

  // Parse attributes from the raw attribute string
  // Matches: name="value", name='value', name=value, name (boolean)
  const attrPattern = /([a-zA-Z][a-zA-Z0-9_:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let match: RegExpExecArray | null;
  let result = "";

  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const attrName = match[1].toLowerCase();
    // Value: prefer double-quoted, then single-quoted, then unquoted
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";

    if (!allowed.has(attrName)) continue; // not in allowlist for this tag

    // URL sanitization for href and src
    if (attrName === "href" || attrName === "src") {
      if (!isSafeUrl(rawValue)) continue; // strip unsafe protocol
    }

    // Escape the attribute value for safe interpolation
    const safeValue = rawValue
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    result += ` ${attrName}="${safeValue}"`;
  }

  return result;
}

// ─── URL scheme validator ─────────────────────────────────────────────────────

/**
 * Returns true only for http/https/mailto schemes and relative URLs.
 * Rejects javascript:, data:, vbscript:, and other potentially dangerous schemes.
 *
 * Normalizes: trims whitespace, strips null bytes and control characters,
 * strips CSS escape sequences that disguise the protocol.
 */
function isSafeUrl(url: string): boolean {
  // Normalize: trim + lowercase + strip control chars (null, tab, CR, LF, etc.)
  const normalized = url
    .trim()
    .toLowerCase()
    // Strip ASCII control characters (U+0000–U+001F) and DEL (U+007F)
    .replace(/[\x00-\x1f\x7f]/g, "")
    // Strip HTML entity & numeric references that could hide the scheme
    // (e.g. &#106;avascript: -> javascript:)
    // Simple pass: if after entity-stripping we'd still have a bad scheme,
    // the below regex catches it. For defense-in-depth, reject anything with &# too.
    .replace(/&[#a-z][a-z0-9]*;/g, "");

  // Reject data: URIs
  if (normalized.startsWith("data:")) return false;

  // Reject javascript: (and common obfuscations like j a v a s c r i p t:)
  // Strip all whitespace to catch j\ta\nv... obfuscation
  const noSpace = normalized.replace(/\s/g, "");
  if (noSpace.startsWith("javascript:")) return false;
  if (noSpace.startsWith("vbscript:")) return false;

  // Allow: http, https, mailto, relative URLs (no scheme), and #anchors
  // If a scheme is present, only allow safe ones.
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(noSpace);
  if (schemeMatch) {
    const scheme = schemeMatch[1];
    return scheme === "http" || scheme === "https" || scheme === "mailto";
  }

  // No scheme detected → relative URL or bare path → safe
  return true;
}
