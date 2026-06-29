//
// Member agent SSE endpoint — Demo Sprint D2 (AGENT-01/02/03).
//
// Server-side ONLY: imports @anthropic-ai/sdk; the API key never leaves
// this process (Pitfall #9). Mobile client consumes the SSE via
// react-native-sse with X-Demo-Member-Id header.
//
// Tool loop is manual (not the SDK beta toolRunner) so the "confirm before
// book_class" behaviour can be encoded in the system prompt + tool description
// with full control. Per RESEARCH §Pattern 5 + Anthropic SDK examples/tools.ts.
//
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../server/db";
import { requireMemberOrDemo } from "../../server/lib/member-session";
import type { ActionFunctionArgs } from "react-router";

// Per RESEARCH §State of the Art (2026-05-19 npm verify):
// claude-sonnet-4-6 is current production; do NOT use claude-sonnet-4-7
// (does not exist) or claude-sonnet-3-5-* (superseded).
const MODEL = "claude-sonnet-4-6";

const TOOLS = [
  {
    name: "greet",
    description:
      "Greet the member and list available capabilities. Call this once at session start if appropriate, or when the member asks 'what can you do?'.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "book_class",
    description:
      "Book the member into a class occurrence. CRITICAL: you MUST confirm with the member BEFORE calling this tool — describe which class you intend to book (name + time), ask 'shall I book you in?', and only call book_class after they answer yes. If they decline, do NOT call the tool.",
    input_schema: {
      type: "object",
      properties: {
        occurrenceId: {
          type: "string",
          description:
            "The class occurrence id (e.g. 'occ_...') from the schedule",
        },
      },
      required: ["occurrenceId"],
    },
  },
  {
    name: "log_food_nl",
    description:
      "Parse a natural-language food description ('I had a chicken caesar at Pret') into a food entry. Uses Open Food Facts to find the best-matching item; if no good match, returns an honest failure and asks the member to try a different description. Logs at a sensible default quantity (200g).",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Natural language food description",
        },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
          description:
            "Meal type — infer from time of day if the member didn't say",
        },
      },
      required: ["description", "mealType"],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are RunStudio Coach — a brief, kind, action-oriented in-app assistant for a member of a boutique fitness studio.

Rules:
- Be terse. One short paragraph per turn unless the member asks for detail.
- Before booking a class, always describe what you intend to book (name + time) and ask the member to confirm with "yes" or "no".
- Never invent class times, members, or pass balances. If you don't have the info, say so and offer to check the schedule tab.
- The member's first name is in <member> below. Address them by that name.
- For food logging, default to a 200g portion unless the member specifies a quantity.
- For meal type inference: before 10:30am = breakfast, 10:30am-2:30pm = lunch, 2:30pm-5pm = snack, 5pm onwards = dinner.
`;

export async function action({ request }: ActionFunctionArgs) {
  const member = await requireMemberOrDemo(request);

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  let messages: Array<{ role: "user" | "assistant"; content: any }>;
  try {
    const body = (await request.json()) as { messages?: any[] };
    messages = (body.messages ?? []).filter(
      (m) => m && (m.role === "user" || m.role === "assistant"),
    );
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (messages.length === 0) {
    return new Response("Empty messages", { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Member context — cached separately so it survives 5 min of follow-up turns
  // (Anthropic prompt caching — 5m TTL).
  const memberContext = JSON.stringify({
    firstName: member.firstName,
    memberId: member.id,
    nowIso: new Date().toISOString(),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: any) => {
        controller.enqueue(
          encoder.encode(
            `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };

      let turn = 0;
      let convo = [...messages];

      try {
        while (turn < 5) {
          const msStream = client.messages.stream({
            model: MODEL,
            max_tokens: 1024,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" }, // 5m TTL — system prompt rarely changes
              },
              {
                type: "text",
                text: `<member>${memberContext}</member>`,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: TOOLS as any,
            messages: convo as any,
          });

          msStream.on("text", (delta: string) =>
            send("delta", { text: delta }),
          );

          const final = await msStream.finalMessage();

          if (final.stop_reason === "tool_use") {
            const toolUse: any = final.content.find(
              (c: any) => c.type === "tool_use",
            );
            if (!toolUse) {
              send("done", { stop_reason: "tool_use_missing" });
              break;
            }

            send("tool_use", {
              name: toolUse.name,
              id: toolUse.id,
              input: toolUse.input,
            });

            const result = await runTool(
              toolUse.name,
              toolUse.input,
              member.id,
            );
            send("tool_result", { id: toolUse.id, result });

            // Continue conversation with tool_result
            convo = [
              ...convo,
              { role: "assistant", content: final.content as any },
              {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: toolUse.id,
                    content: JSON.stringify(result),
                  },
                ],
              } as any,
            ];
            turn++;
            continue;
          }

          send("done", { stop_reason: final.stop_reason });
          break;
        }
      } catch (err: any) {
        send("error", { message: String(err?.message ?? err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runTool(name: string, input: any, memberId: string) {
  const db = getDb();
  if (name === "greet") {
    return {
      ok: true,
      capabilities: [
        "Book a class from the schedule",
        "Log food from a natural-language description (e.g. 'chicken caesar at Pret')",
      ],
    };
  }
  if (name === "book_class") {
    const occurrenceId = String(input?.occurrenceId ?? "");
    if (!occurrenceId) return { ok: false, reason: "Missing occurrenceId" };

    // Validate the occurrence exists
    // guard:allow-unscoped — demo D-07 (agent acts as the member)
    const occ = await db
      .select({ id: schema.classOccurrences.id })
      .from(schema.classOccurrences)
      .where(eq(schema.classOccurrences.id, occurrenceId))
      .limit(1)
      .then((r) => r[0] ?? null);
    if (!occ) return { ok: false, reason: "Occurrence not found" };

    const id = `bkg_${crypto.randomUUID()}`;
    await db.insert(schema.bookings).values({
      id,
      occurrenceId,
      memberId,
      status: "booked",
      bookedByUserId: null,
      bookedAt: new Date().toISOString(),
    });
    return { ok: true, bookingId: id };
  }
  if (name === "log_food_nl") {
    const description = String(input?.description ?? "");
    const mealType = String(input?.mealType ?? "snack") as
      | "breakfast"
      | "lunch"
      | "dinner"
      | "snack";
    if (!description) return { ok: false, reason: "Missing description" };

    // Single-shot OFF search; pick top result.
    const offUrl =
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(description)}` +
      `&search_simple=1&action=process&json=1&page_size=1`;
    const res = await fetch(offUrl, {
      headers: {
        "User-Agent":
          "RunStudio-Demo/0.1 (https://gymos.local; demo@gymos.local)",
      },
    });
    if (!res.ok) return { ok: false, reason: `OFF ${res.status}` };
    const json = (await res.json()) as any;
    const p = json.products?.[0];
    if (!p)
      return { ok: false, reason: "No match — try a different description" };

    const kcalPer100 = Number(p.nutriments?.["energy-kcal_100g"] ?? 0);
    const proteinPer100 = Number(p.nutriments?.proteins_100g ?? 0);
    const carbsPer100 = Number(p.nutriments?.carbohydrates_100g ?? 0);
    const fatPer100 = Number(p.nutriments?.fat_100g ?? 0);
    const qtyG = 200; // demo default per system prompt
    const fiId = `fi_${crypto.randomUUID()}`;
    const feId = `fe_${crypto.randomUUID()}`;

    await db.insert(schema.foodItems).values({
      id: fiId,
      name: p.product_name ?? description,
      brand: p.brands ?? null,
      barcode: p.code ?? null,
      kcalPer100g: kcalPer100,
      proteinPer100g: proteinPer100,
      carbsPer100g: carbsPer100,
      fatPer100g: fatPer100,
      source: "openfoodfacts",
      externalId: p.code ?? null,
      verified: false,
    });
    await db.insert(schema.foodEntries).values({
      id: feId,
      memberId,
      foodItemId: fiId,
      loggedAt: new Date().toISOString(),
      mealType,
      quantityG: qtyG,
      kcal: (kcalPer100 * qtyG) / 100,
      proteinG: (proteinPer100 * qtyG) / 100,
      carbsG: (carbsPer100 * qtyG) / 100,
      fatG: (fatPer100 * qtyG) / 100,
      source: "agent",
    });
    return {
      ok: true,
      foodEntryId: feId,
      item: p.product_name ?? description,
      kcal: Math.round((kcalPer100 * qtyG) / 100),
    };
  }
  return { ok: false, reason: `Unknown tool: ${name}` };
}
