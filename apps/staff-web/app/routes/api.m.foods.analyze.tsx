// POST /api/m/foods/analyze — Claude vision+text calorie & macro estimate.
// Member calorie counter AI endpoint — gated by requireDemoMember.
// Returns strict JSON { ok: true, estimate: {...} } or { ok: false, error }.
import Anthropic from "@anthropic-ai/sdk";
import { requireDemoMember } from "../../server/lib/demo-member";
import type { ActionFunctionArgs } from "react-router";

// Haiku-4.5 ("claude-haiku-4-5") is ~cheaper but weaker at portion vision; keep sonnet for v1.
const MODEL = "claude-sonnet-4-6";

const ESTIMATE_SCHEMA_PROMPT = `You are a nutrition estimator. Estimate the food shown/described and respond with STRICT JSON only — no prose, no markdown fences. Schema: {"foodName":string,"kcalPer100g":number,"proteinPer100gG":number,"carbsPer100gG":number,"fatPer100gG":number,"suggestedQuantityG":number,"confidence":"low"|"medium"|"high","note":string}. All per-100g values are grams except kcalPer100g which is kilocalories per 100g. suggestedQuantityG is your best estimate of the portion size in grams. Keep note under 120 chars. If you genuinely cannot identify the food, still return your best guess and set confidence to "low".`;

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  await requireDemoMember(request);

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: { image?: string; description?: string; mealHint?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Bad JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.image && !body.description) {
    return new Response(
      JSON.stringify({ ok: false, error: "Provide a photo or a description" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Normalise image: accept bare base64 or data URL (data:image/jpeg;base64,XXXX).
  let rawBase64: string | undefined;
  let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
    "image/jpeg";
  if (body.image) {
    if (body.image.startsWith("data:")) {
      const [prefix, data] = body.image.split(",");
      rawBase64 = data;
      const mime = prefix.replace("data:", "").replace(";base64", "");
      if (
        mime === "image/jpeg" ||
        mime === "image/png" ||
        mime === "image/gif" ||
        mime === "image/webp"
      ) {
        mediaType = mime;
      }
    } else {
      rawBase64 = body.image;
    }
  }

  // Build user message content array.
  const content: Anthropic.MessageParam["content"] = [];

  if (rawBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: rawBase64,
      },
    });
  }

  let promptText = ESTIMATE_SCHEMA_PROMPT;
  if (body.description) {
    promptText += `\n\nFood description: ${body.description}`;
  }
  if (body.mealHint) {
    promptText += `\nMeal type: ${body.mealHint}`;
  }
  content.push({ type: "text", text: promptText });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let raw: string;
  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      messages: [{ role: "user", content }],
    });
    raw = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("");
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err?.message ?? err) }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Defensive JSON parse: strip ```json fences, slice from first { to last }.
  let parsed: Record<string, unknown>;
  try {
    const stripped = raw
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Could not parse estimate" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Coerce and validate each field with safe fallbacks.
  const foodName =
    typeof parsed.foodName === "string" && parsed.foodName
      ? parsed.foodName
      : (body.description ?? "Estimated food");

  const kcalPer100g = Number.isFinite(Number(parsed.kcalPer100g))
    ? Number(parsed.kcalPer100g)
    : 0;
  const proteinPer100gG = Number.isFinite(Number(parsed.proteinPer100gG))
    ? Number(parsed.proteinPer100gG)
    : 0;
  const carbsPer100gG = Number.isFinite(Number(parsed.carbsPer100gG))
    ? Number(parsed.carbsPer100gG)
    : 0;
  const fatPer100gG = Number.isFinite(Number(parsed.fatPer100gG))
    ? Number(parsed.fatPer100gG)
    : 0;
  const suggestedQuantityG = Number.isFinite(Number(parsed.suggestedQuantityG))
    ? Number(parsed.suggestedQuantityG)
    : 100;

  const confidenceRaw =
    typeof parsed.confidence === "string" ? parsed.confidence : "";
  const confidence =
    confidenceRaw === "low" ||
    confidenceRaw === "medium" ||
    confidenceRaw === "high"
      ? confidenceRaw
      : "low";

  const note =
    typeof parsed.note === "string" ? String(parsed.note).slice(0, 200) : "";

  const estimate = {
    foodName,
    kcalPer100g,
    proteinPer100gG,
    carbsPer100gG,
    fatPer100gG,
    suggestedQuantityG,
    confidence,
    note,
  };

  return new Response(JSON.stringify({ ok: true, estimate }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
