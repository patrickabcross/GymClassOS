import Anthropic from "@anthropic-ai/sdk";
import type { FormField } from "../types.js";

// ---------------------------------------------------------------------------
// parseTemplateBody — pure, defensive
// ---------------------------------------------------------------------------
//
// Parses the `components_json` column from `whatsapp_templates` and extracts
// the BODY component's text plus the maximum variable index referenced by
// `{{N}}` placeholders.
//
// NEVER throws — any error returns the zero-value result.
// ---------------------------------------------------------------------------

export function parseTemplateBody(componentsJson: string): {
  bodyText: string;
  varCount: number;
} {
  const empty = { bodyText: "", varCount: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(componentsJson);
  } catch {
    return empty;
  }

  if (typeof parsed !== "object" || parsed === null) return empty;

  const components = (parsed as Record<string, unknown>).components;
  if (!Array.isArray(components)) return empty;

  const bodyComponent = components.find(
    (c): c is { type: string; text: string } =>
      typeof c === "object" &&
      c !== null &&
      (c as Record<string, unknown>).type === "BODY",
  );

  if (!bodyComponent) return empty;
  if (typeof bodyComponent.text !== "string") return empty;

  const bodyText = bodyComponent.text;

  // Determine varCount = max N across all {{N}} matches (0 if none).
  let varCount = 0;
  const re = /\{\{(\d+)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(bodyText)) !== null) {
    const n = parseInt(match[1], 10);
    if (n > varCount) varCount = n;
  }

  return { bodyText, varCount };
}

// ---------------------------------------------------------------------------
// buildLeadAckVars — AI fill with deterministic fallback
// ---------------------------------------------------------------------------
//
// Fills the `{{N}}` variable slots for a WhatsApp template using Claude,
// informed by the form submission context and the studio's active class
// catalog.
//
// Contract:
//   - slot "1" is ALWAYS the lead's first name (forced after LLM response).
//   - all other slots 2..varCount default to "our classes" on any failure.
//   - varCount === 0 → returns {} immediately (no LLM needed).
//   - ANTHROPIC_API_KEY unset → returns deterministic fallback immediately.
//   - NEVER throws.
// ---------------------------------------------------------------------------

export interface ClassCatalogEntry {
  name: string;
  category: string | null;
  description: string | null;
}

export async function buildLeadAckVars(input: {
  formTitle: string;
  fields: FormField[];
  data: Record<string, unknown>;
  firstName: string;
  bodyText: string;
  varCount: number;
  classCatalog: ClassCatalogEntry[];
}): Promise<Record<string, string>> {
  const {
    formTitle,
    fields,
    data,
    firstName,
    bodyText,
    varCount,
    classCatalog,
  } = input;

  // Build the deterministic fallback result.
  function fallback(): Record<string, string> {
    if (varCount === 0) return {};
    const result: Record<string, string> = {};
    for (let i = 1; i <= varCount; i++) {
      result[String(i)] = i === 1 ? firstName : "our classes";
    }
    return result;
  }

  // Early exits.
  if (varCount === 0) return {};
  if (!process.env.ANTHROPIC_API_KEY) return fallback();

  try {
    // Build form context string.
    const contextLines: string[] = [`Form: ${formTitle}`];
    let totalLen = contextLines[0].length;
    for (const field of fields) {
      const val = data[field.id];
      if (val === undefined || val === null || val === "" || val === false) {
        continue;
      }
      if (Array.isArray(val) && val.length === 0) continue;
      const rawStr = String(val);
      const line = `${field.label}: ${rawStr.slice(0, 120)}`;
      totalLen += line.length;
      if (totalLen > 1500) break;
      contextLines.push(line);
    }
    const formContext = contextLines.join("\n");

    // Build catalog string (cap at 30 entries).
    const catalogLines = classCatalog.slice(0, 30).map((cls) => {
      let line = cls.name;
      if (cls.category) line += ` — ${cls.category}`;
      if (cls.description) line += ` — ${cls.description.slice(0, 80)}`;
      return line;
    });
    const catalogStr = catalogLines.join("\n");

    const prompt =
      `You are filling the variables of a WhatsApp message a boutique fitness studio is ` +
      `auto-sending to a NEW lead who just submitted a web form. Template body (with {{N}} placeholders):\n` +
      `${bodyText}\n\nThe lead's form submission:\n${formContext}\n\nOur class catalog:\n${catalogStr}\n\n` +
      `Return ONLY a strict JSON object mapping each placeholder number (as a string key) to its value, ` +
      `e.g. {"1":"${firstName}","2":"our Boxing classes"}. Rules: slot "1" MUST be the lead's first name (${firstName}); ` +
      `other slots are inferred from the form context + the single best-matching class from our catalog, ` +
      `phrased naturally (e.g. "our HYROX sessions", never an id). Keep each value short (≤ ~50 chars), ` +
      `warm, matching the template's tone. NO emojis, NO newlines, NO markdown.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    });

    const raw = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");

    // Defensive parse: strip ```json fences, slice from first { to last }.
    const stripped = raw
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");

    const parsedVars = JSON.parse(stripped.slice(start, end + 1)) as unknown;
    if (typeof parsedVars !== "object" || parsedVars === null) {
      throw new Error("Parsed vars is not an object");
    }

    // Validate: every key "1".."varCount" must be a non-empty trimmed string.
    const result: Record<string, string> = {};
    for (let i = 1; i <= varCount; i++) {
      const key = String(i);
      const raw = (parsedVars as Record<string, unknown>)[key];
      if (typeof raw !== "string" || raw.trim() === "") {
        throw new Error(`Missing or empty slot ${key}`);
      }
      result[key] = raw.trim().slice(0, 60);
    }

    // Safety: always force slot "1" = firstName regardless of model output.
    result["1"] = firstName;

    return result;
  } catch {
    return fallback();
  }
}
