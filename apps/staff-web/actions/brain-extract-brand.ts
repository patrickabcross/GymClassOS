// brain-extract-brand.ts
//
// Staff-only operator action (NOT an agent LLM tool).
// Fetches a public URL, reduces the HTML to brand-relevant signals
// (<head>, <meta>, <style>, <link rel="stylesheet">, first ~3KB of <body>),
// then asks Claude to extract an 11-field TenantBrand token object.
//
// Does NOT write to the DB — returns { ok: true, tokens: TenantBrand } for
// the UI to review before the user calls update-brain-doc to save.
//
// SSRF guard: delegates all URL fetching to safe-fetch.ts.
//
// guard:allow-unscoped — no DB reads; staff-only surface
import { z } from "zod";
import { defineAction } from "@agent-native/core";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../server/lib/safe-fetch.js";
import { DEFAULT_TENANT_BRAND } from "../server/lib/tenant-brand.js";

const MODEL = "claude-sonnet-4-6";

// Prompt: extract TenantBrand tokens from HTML signals
const EXTRACT_PROMPT = `You are a brand token extractor. You are given HTML from a public website. Extract the visual brand identity and respond with STRICT JSON only — no prose, no markdown fences.

Required schema (all fields must be present):
{
  "displayName": string,       // Brand/studio display name — from <title> or OG tags
  "fontFamily": string,        // Primary CSS font family stack (with fallbacks, e.g. "Inter, sans-serif")
  "googleFontsHref": string,   // Google Fonts stylesheet URL if found; else "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
  "primary": string,           // Primary brand colour as hex (#RRGGBB)
  "primaryText": string,       // Text colour shown on primary background (hex)
  "secondaryAccent": string,   // Secondary/accent colour (hex)
  "ink": string,               // Body text colour (hex)
  "bg": string,                // Main background colour (hex)
  "bgAlt": string,             // Alternate/card background colour (hex)
  "radius": number,            // Border-radius in px (integer, e.g. 4, 8, 12)
  "logoUrl": string            // Absolute URL of logo image; "" if none found
}

Rules:
- Hex colours MUST be 6-digit (#RRGGBB). If unsure, derive from the dominant palette.
- If you cannot confidently extract a value, use a sensible default consistent with the palette you found.
- logoUrl: prefer <link rel="apple-touch-icon">, <meta property="og:image">, or a <img> src with "logo" in the name.
- Do NOT include explanations. Return only the JSON object.`;

// Reduce raw HTML to the head + first 3KB body — keeps prompt small.
function reduceHtml(raw: string): string {
  // Extract <head>…</head>
  const headMatch = raw.match(/<head[\s\S]*?>([\s\S]*?)<\/head>/i);
  const head = headMatch ? headMatch[0] : "";

  // Extract <body>…</body> up to 3KB
  const bodyMatch = raw.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  const bodyFull = bodyMatch ? bodyMatch[1] : "";
  const bodySample = bodyFull.slice(0, 3000);

  // Strip <script> blocks (not brand-relevant + waste tokens)
  const stripped = (head + "\n" + bodySample).replace(
    /<script[\s\S]*?<\/script>/gi,
    "",
  );

  return stripped.slice(0, 12000); // absolute cap
}

export default defineAction({
  description:
    "Staff-only: fetch a public URL and extract brand tokens (colours, fonts, logo, name) " +
    "using Claude. Returns { ok: true, tokens } for the operator to review; does NOT save to DB. " +
    "Call update-brain-doc with id='brand-styling' to persist after reviewing.",
  schema: z
    .object({
      url: z
        .string()
        .url()
        .describe(
          "Public URL to fetch — the studio's website or brand page.",
        ),
    })
    .strict(),
  // No http key → mutation (POST-only auto-mount); staff-only surface
  run: async ({ url }) => {
    // 1. SSRF-guarded fetch
    const fetched = await safeFetch(url);
    if (!fetched.ok) {
      const reason = "error" in fetched ? fetched.error : "unknown error";
      return { ok: false as const, error: `FETCH_FAILED: ${reason}` };
    }

    // 2. Reduce HTML to brand signals
    const reduced = reduceHtml(fetched.body);

    // 3. Check Anthropic key
    if (!process.env.ANTHROPIC_API_KEY) {
      return { ok: false as const, error: "ANTHROPIC_API_KEY not configured" };
    }

    // 4. Call Claude
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let raw: string;
    try {
      const msg = await client.messages.create({
        model: MODEL,
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${EXTRACT_PROMPT}\n\n--- HTML ---\n${reduced}`,
              },
            ],
          },
        ],
      });
      raw = msg.content
        .filter((c): c is Anthropic.TextBlock => c.type === "text")
        .map((c) => c.text)
        .join("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      return { ok: false as const, error: `CLAUDE_ERROR: ${msg}` };
    }

    // 5. Defensive JSON parse: strip fences, slice first { to last }
    let parsed: Record<string, unknown>;
    try {
      const stripped = raw
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const start = stripped.indexOf("{");
      const end = stripped.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("No JSON object found");
      parsed = JSON.parse(stripped.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      return { ok: false as const, error: "PARSE_ERROR: could not parse Claude response" };
    }

    // 6. Per-field safe extraction with fallbacks from DEFAULT_TENANT_BRAND
    function str(key: string, fallback: string): string {
      const v = parsed[key];
      return typeof v === "string" && v.trim().length > 0 ? v.trim() : fallback;
    }
    function num(key: string, fallback: number): number {
      const v = Number(parsed[key]);
      return Number.isFinite(v) && v >= 0 ? v : fallback;
    }

    const tokens = {
      displayName: str("displayName", DEFAULT_TENANT_BRAND.displayName),
      fontFamily: str("fontFamily", DEFAULT_TENANT_BRAND.fontFamily),
      googleFontsHref: str("googleFontsHref", DEFAULT_TENANT_BRAND.googleFontsHref),
      primary: str("primary", DEFAULT_TENANT_BRAND.primary),
      primaryText: str("primaryText", DEFAULT_TENANT_BRAND.primaryText),
      secondaryAccent: str("secondaryAccent", DEFAULT_TENANT_BRAND.secondaryAccent),
      ink: str("ink", DEFAULT_TENANT_BRAND.ink),
      bg: str("bg", DEFAULT_TENANT_BRAND.bg),
      bgAlt: str("bgAlt", DEFAULT_TENANT_BRAND.bgAlt),
      radius: num("radius", DEFAULT_TENANT_BRAND.radius),
      logoUrl: str("logoUrl", DEFAULT_TENANT_BRAND.logoUrl),
    };

    return { ok: true as const, tokens };
  },
});
