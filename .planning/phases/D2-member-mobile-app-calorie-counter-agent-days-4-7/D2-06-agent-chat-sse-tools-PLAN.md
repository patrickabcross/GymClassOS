---
phase: D2-member-mobile-app-calorie-counter-agent-days-4-7
plan: 06
type: execute
wave: 3
depends_on: ["D2-01", "D2-03", "D2-05"]
files_modified:
  - templates/mail/app/routes/api.m.agent.stream.tsx
  - packages/mobile-app/lib/agent-stream.ts
  - packages/mobile-app/components/AgentSheet.tsx
  - packages/mobile-app/app/_layout.tsx
autonomous: false
requirements: [AGENT-01, AGENT-02, AGENT-03]
user_setup:
  - service: anthropic
    why: "Agent surface is hard-gated on ANTHROPIC_API_KEY. Without it the SSE route returns 500."
    env_vars:
      - name: ANTHROPIC_API_KEY
        source: "https://console.anthropic.com/settings/keys — already surfaced in D2-01's .env.local.example; confirm it's actually populated before running this plan"
must_haves:
  truths:
    - "A floating FAB (Feather 'message-circle' icon, lower-right) is visible on every tab — Home, Schedule, Food, Profile"
    - "Tapping the FAB opens a bottom-sheet (the implementation chosen by D2-01 Task 2 spike — @gorhom/bottom-sheet OR RN Modal) covering ~2/3 of the viewport with a dim scrim behind"
    - "The sheet shows a chat surface with header 'Agent — GymOS Coach', a scrolling message list, and a text input at the bottom"
    - "On open, the sheet is empty (or shows a welcome message); user types → sends → SSE deltas stream the assistant reply word-by-word"
    - "POST /api/m/agent/stream returns text/event-stream with `delta` events containing text chunks, `tool_use` events when Claude calls a tool, `tool_result` events after server-side tool execution, and `done` when the turn completes"
    - "Tool `greet` returns capability list — testable by 'hi' → agent describes itself"
    - "Tool `book_class` asks for confirmation FIRST ('Shall I book you into the 7am Yoga tomorrow?'), then on user 'yes' calls the tool which inserts a bookings row — schedule cache invalidates on the mobile side after the tool_result event"
    - "Tool `log_food_nl` parses 'I had a chicken caesar at Pret' → OFF search top result → inserts foodItems + foodEntries — food tab cache invalidates after tool_result"
    - "Anthropic model is `claude-sonnet-4-6`; system prompt + member context block are sent with `cache_control: ephemeral` (prompt caching enabled)"
    - "Closing the sheet via X / scrim tap / swipe-down (gorhom only) aborts in-flight SSE and clears the message buffer"
  artifacts:
    - path: "templates/mail/app/routes/api.m.agent.stream.tsx"
      provides: "POST SSE route — accepts {messages}, talks to Anthropic via @anthropic-ai/sdk, runs the manual tool loop, streams delta/tool_use/tool_result/done events"
      exports: ["action"]
      min_lines: 200
    - path: "packages/mobile-app/lib/agent-stream.ts"
      provides: "streamAgent(messages, callbacks) — opens an EventSource via react-native-sse with X-Demo-Member-Id header; calls onDelta/onToolUse/onToolResult/onDone/onError"
      exports: ["streamAgent"]
      min_lines: 50
    - path: "packages/mobile-app/components/AgentSheet.tsx"
      provides: "Chat UI inside the bottom-sheet — message list, text input, send button, calls streamAgent, optimistic user message + assembling assistant message, invalidates caches after tool_result"
      exports: ["default"]
      min_lines: 200
    - path: "packages/mobile-app/app/_layout.tsx"
      provides: "Augmented with persistent FAB + AgentSheetContainer integration (mounts AgentSheet inside the chosen bottom-sheet from D2-01)"
      contains: "AgentSheetContainer"
  key_links:
    - from: "templates/mail/app/routes/api.m.agent.stream.tsx"
      to: "@anthropic-ai/sdk client.messages.stream()"
      via: "manual tool loop on stop_reason === 'tool_use'"
      pattern: "claude-sonnet-4-6"
    - from: "packages/mobile-app/lib/agent-stream.ts"
      to: "react-native-sse EventSource"
      via: "POST with X-Demo-Member-Id header + Content-Type: application/json; addEventListener('delta'|'tool_use'|'tool_result'|'done'|'error')"
      pattern: "react-native-sse"
    - from: "packages/mobile-app/components/AgentSheet.tsx"
      to: "packages/mobile-app/lib/bottom-sheet-impl.ts"
      via: "imports AgentSheetContainer + BOTTOM_SHEET_IMPL from D2-01 spike output"
      pattern: "AgentSheetContainer"
    - from: "templates/mail/app/routes/api.m.agent.stream.tsx"
      to: "schema.bookings + schema.foodItems + schema.foodEntries"
      via: "runTool() calls db.insert() for book_class + log_food_nl tools"
      pattern: "runTool"
---

<objective>
Wire up the in-app agent: an SSE route on the server that runs Claude Sonnet 4.6 with a 3-tool loop (`greet`, `book_class`, `log_food_nl`), a `react-native-sse` consumer on the mobile side, a chat UI inside the bottom-sheet decided by D2-01's spike, and a persistent FAB on every screen.

Purpose: Demo Sprint deliverable for AGENT-01 (member opens chat from FAB and exchanges messages), AGENT-02 (3 working tools end-to-end including the explicit "confirm before book_class" behaviour), and AGENT-03 (responses stream via SSE).

Output:
- `templates/mail/app/routes/api.m.agent.stream.tsx` — full SSE + tool-loop implementation
- `packages/mobile-app/lib/agent-stream.ts` — RN client of the SSE protocol
- `packages/mobile-app/components/AgentSheet.tsx` — the chat surface
- `packages/mobile-app/app/_layout.tsx` — augmented with the FAB + sheet mount

Persistence: NONE this phase (D-15). Each sheet open starts fresh. `agent_sessions` table can be schema-defined but is not populated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-01-mobile-shell-auth-PLAN.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-03-member-schedule-booking-PLAN.md
@.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-05-food-calorie-counter-PLAN.md
@templates/mail/server/db/schema.ts

<interfaces>
From templates/mail/server/lib/demo-member.ts (D2-01):
```typescript
export async function requireDemoMember(request: Request): Promise<DemoMember>;
```

From packages/mobile-app/lib/bottom-sheet-impl.ts (D2-01 Task 2 spike output):
```typescript
export type AgentSheetContainerProps = { open: boolean; onClose: () => void; children: React.ReactNode };
export function AgentSheetContainer(props: AgentSheetContainerProps): JSX.Element;
export function GestureRoot({ children }): JSX.Element;
export const BOTTOM_SHEET_IMPL: "gorhom" | "rn-modal";
```

Anthropic SDK (server-side only, `@anthropic-ai/sdk@^0.97.0` installed by D2-01):
```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const stream = client.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [{ type: "text", text: "...", cache_control: { type: "ephemeral" } }],
  tools: [...],
  messages: [...],
});
stream.on("text", (delta: string) => { ... });
const final = await stream.finalMessage();
// final.stop_reason === "tool_use" | "end_turn" | ...
// final.content is an array of blocks; tool_use blocks have {type:"tool_use", id, name, input}
```

Existing GymOS schema tables this plan writes to:
- `bookings`: { id, occurrenceId, memberId, status, bookedAt }
- `foodItems`: { id, name, brand, barcode, kcalPer100g, ... }
- `foodEntries`: { id, memberId, foodItemId, loggedAt, mealType, quantityG, kcal, ... }

The SSE event format the mobile client expects (matches RESEARCH §Pattern 5):
- `event: delta\ndata: {"text":"..."}` — text chunk from Claude
- `event: tool_use\ndata: {"name":"book_class","id":"toolu_...","input":{...}}`
- `event: tool_result\ndata: {"id":"toolu_...","result":{...}}`
- `event: done\ndata: {"stop_reason":"end_turn"}`
- `event: error\ndata: {"message":"..."}`
</interfaces>

</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Create the SSE agent route with Anthropic + 3-tool manual loop</name>
  <files>
    - templates/mail/app/routes/api.m.agent.stream.tsx
  </files>
  <read_first>
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 5: Anthropic agent SSE route with manual tool loop" (the full ~150-line source — this Task is essentially typing it in with the GymOS schema bindings)
    - templates/mail/server/db/schema.ts (bookings, foodItems, foodEntries — the runTool inserts target these)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"In-app agent" → D-13/D-14/D-15 (3 tools, sonnet-4-6, no persistence)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Common Pitfalls" → Pitfall #9 (Anthropic SDK must stay server-side — file path is templates/mail/app/routes/ which IS server-side in RR v7 framework mode)
  </read_first>
  <action>
Create new file `templates/mail/app/routes/api.m.agent.stream.tsx`. URL: `/api/m/agent/stream`.

The file structure mirrors RESEARCH Pattern 5 with concrete GymOS bindings. Full content:

```ts
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
import { requireDemoMember } from "../../server/lib/demo-member";
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
          description: "The class occurrence id (e.g. 'occ_...') from the schedule",
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
        description: { type: "string", description: "Natural language food description" },
        mealType: {
          type: "string",
          enum: ["breakfast", "lunch", "dinner", "snack"],
          description: "Meal type — infer from time of day if the member didn't say",
        },
      },
      required: ["description", "mealType"],
    },
  },
] as const;

const SYSTEM_PROMPT = `You are GymOS Coach — a brief, kind, action-oriented in-app assistant for a member of a boutique fitness studio.

Rules:
- Be terse. One short paragraph per turn unless the member asks for detail.
- Before booking a class, always describe what you intend to book (name + time) and ask the member to confirm with "yes" or "no".
- Never invent class times, members, or pass balances. If you don't have the info, say so and offer to check the schedule tab.
- The member's first name is in <member> below. Address them by that name.
- For food logging, default to a 200g portion unless the member specifies a quantity.
- For meal type inference: before 10:30am = breakfast, 10:30am-2:30pm = lunch, 2:30pm-5pm = snack, 5pm onwards = dinner.
`;

export async function action({ request }: ActionFunctionArgs) {
  const member = await requireDemoMember(request);

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY not configured", { status: 500 });
  }

  let messages: Array<{ role: "user" | "assistant"; content: any }>;
  try {
    const body = (await request.json()) as { messages?: any[] };
    messages = (body.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant"));
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
        controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
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

          msStream.on("text", (delta: string) => send("delta", { text: delta }));

          const final = await msStream.finalMessage();

          if (final.stop_reason === "tool_use") {
            const toolUse: any = final.content.find((c: any) => c.type === "tool_use");
            if (!toolUse) {
              send("done", { stop_reason: "tool_use_missing" });
              break;
            }

            send("tool_use", { name: toolUse.name, id: toolUse.id, input: toolUse.input });

            const result = await runTool(toolUse.name, toolUse.input, member.id);
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
      headers: { "User-Agent": "GymOS-Demo/0.1 (https://gymos.local; demo@gymos.local)" },
    });
    if (!res.ok) return { ok: false, reason: `OFF ${res.status}` };
    const json = (await res.json()) as any;
    const p = json.products?.[0];
    if (!p) return { ok: false, reason: "No match — try a different description" };

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
```

Run `npx prettier --write templates/mail/app/routes/api.m.agent.stream.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('templates/mail/app/routes/api.m.agent.stream.tsx','utf8');const checks=['claude-sonnet-4-6','@anthropic-ai/sdk','requireDemoMember','cache_control','ephemeral','name: \"greet\"','name: \"book_class\"','name: \"log_food_nl\"','stop_reason === \"tool_use\"','db.insert(schema.bookings)','db.insert(schema.foodEntries)','db.insert(schema.foodItems)','text/event-stream','event: ${eventName}'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - File `templates/mail/app/routes/api.m.agent.stream.tsx` exists
    - `grep -c 'claude-sonnet-4-6' templates/mail/app/routes/api.m.agent.stream.tsx` returns at least 1 (NOT `claude-sonnet-4-7` or `claude-3-5-*`)
    - `grep -c '@anthropic-ai/sdk' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1
    - `grep -c 'requireDemoMember' templates/mail/app/routes/api.m.agent.stream.tsx` returns at least 2
    - `grep -c 'cache_control' templates/mail/app/routes/api.m.agent.stream.tsx` returns at least 2 (system prompt + member context)
    - `grep -c 'name: "greet"' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1
    - `grep -c 'name: "book_class"' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1
    - `grep -c 'name: "log_food_nl"' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1
    - `grep -c 'stop_reason === "tool_use"' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1 (manual loop branch)
    - `grep -c 'db.insert(schema.bookings)' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1 (book_class tool)
    - `grep -c 'db.insert(schema.foodEntries)' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1 (log_food_nl tool)
    - `grep -c 'text/event-stream' templates/mail/app/routes/api.m.agent.stream.tsx` returns 1
    - `grep -c 'event:' templates/mail/app/routes/api.m.agent.stream.tsx` returns at least 1 (SSE event prefix)
    - File has at least 200 lines
    - `pnpm --filter mail exec tsc --noEmit` returns 0 errors
  </acceptance_criteria>
  <done>The SSE route accepts {messages}, runs the manual tool loop against Claude Sonnet 4.6 with prompt caching, executes the 3 tools server-side (greet/book_class/log_food_nl), emits SSE events (delta/tool_use/tool_result/done/error) — all GymOS-schema-bound</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create mobile SSE client + AgentSheet component</name>
  <files>
    - packages/mobile-app/lib/agent-stream.ts
    - packages/mobile-app/components/AgentSheet.tsx
  </files>
  <read_first>
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-RESEARCH.md §"Pattern 6: React Native SSE consumption with react-native-sse" — the streamAgent source
    - packages/mobile-app/lib/bottom-sheet-impl.ts (D2-01 Task 2 spike output — AgentSheetContainer is the wrapper)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"Specific Ideas" (Bottom-sheet header: "Agent — GymOS Coach"; welcome message format)
    - packages/mobile-app/lib/api.ts (API_BASE_URL — reuse so tunnel/LAN config stays in one place)
  </read_first>
  <action>
**Step A — Create `packages/mobile-app/lib/agent-stream.ts`:**

```ts
import EventSource from "react-native-sse";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "./api";

export type StreamCallbacks = {
  onDelta: (text: string) => void;
  onToolUse?: (e: { name: string; id: string; input: any }) => void;
  onToolResult?: (e: { id: string; result: any }) => void;
  onDone: (e: { stop_reason: string }) => void;
  onError: (err: any) => void;
};

/**
 * Open an SSE connection to /api/m/agent/stream.
 * Returns a cancel function that closes the connection.
 */
export async function streamAgent(
  messages: Array<{ role: "user" | "assistant"; content: any }>,
  cb: StreamCallbacks,
): Promise<() => void> {
  const memberId = await AsyncStorage.getItem("demoMemberId");
  if (!memberId) throw new Error("No member selected");

  const es = new EventSource(`${API_BASE_URL}/api/m/agent/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Member-Id": memberId,
    },
    body: JSON.stringify({ messages }),
  } as any);

  es.addEventListener("delta", (e: any) => {
    try {
      cb.onDelta(JSON.parse(e.data).text ?? "");
    } catch {}
  });
  es.addEventListener("tool_use", (e: any) => {
    try {
      cb.onToolUse?.(JSON.parse(e.data));
    } catch {}
  });
  es.addEventListener("tool_result", (e: any) => {
    try {
      cb.onToolResult?.(JSON.parse(e.data));
    } catch {}
  });
  es.addEventListener("done", (e: any) => {
    let parsed = { stop_reason: "end_turn" };
    try {
      parsed = JSON.parse(e.data);
    } catch {}
    cb.onDone(parsed);
    es.close();
  });
  es.addEventListener("error", (e: any) => {
    cb.onError(e);
    es.close();
  });

  return () => es.close();
}
```

**Step B — Create `packages/mobile-app/components/AgentSheet.tsx`:**

```tsx
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { streamAgent } from "../lib/agent-stream";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

type Props = { onClose: () => void };

export default function AgentSheet({ onClose }: Props) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "sys-welcome", role: "system", text: "Agent — GymOS Coach" },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    // Cancel any in-flight stream on unmount/close
    return () => cancelRef.current?.();
  }, []);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");

    const userMsg: ChatMessage = { id: `u_${Date.now()}`, role: "user", text };
    const assistantMsg: ChatMessage = {
      id: `a_${Date.now()}`,
      role: "assistant",
      text: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);

    // Build wire-format messages from local state (skip system label, skip empty assistant)
    const wireMessages = [...messages, userMsg]
      .filter((m) => m.role !== "system" && m.text.trim().length > 0)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.text }));

    try {
      cancelRef.current = await streamAgent(wireMessages, {
        onDelta: (t) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, text: m.text + t } : m)),
          );
        },
        onToolUse: (e) => {
          // Surface tool calls inline as small system note
          setMessages((prev) => [
            ...prev,
            { id: `sys_${Date.now()}_use`, role: "system", text: `· Using ${e.name}…` },
          ]);
        },
        onToolResult: (e) => {
          // Best-effort cache invalidation based on which tool ran
          // (server-side tool already wrote to DB; the mobile cache needs to refresh)
          qc.invalidateQueries({ queryKey: ["schedule"] });
          qc.invalidateQueries({ queryKey: ["food-entries"] });
          qc.invalidateQueries({ queryKey: ["profile"] });
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m)),
          );
          setSending(false);
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, text: m.text || "(error — try again)", streaming: false }
                : m,
            ),
          );
          setSending(false);
        },
      });
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, text: `Couldn't reach agent: ${err?.message ?? err}`, streaming: false }
            : m,
        ),
      );
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Agent — GymOS Coach</Text>
        <Pressable onPress={onClose} hitSlop={12}>
          <Feather name="x" size={22} color="#999" />
        </Pressable>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          if (item.role === "system") {
            return <Text style={styles.systemLine}>{item.text}</Text>;
          }
          const isUser = item.role === "user";
          return (
            <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAgent]}>
              <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAgent]}>
                <Text style={styles.bubbleText}>{item.text}</Text>
                {item.streaming && (
                  <ActivityIndicator size="small" color="#999" style={{ marginTop: 4 }} />
                )}
              </View>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask anything…"
          placeholderTextColor="#666"
          style={styles.input}
          multiline
          editable={!sending}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          style={[styles.sendBtn, (!draft.trim() || sending) && { opacity: 0.5 }]}
        >
          <Feather name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1a1a1a" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#333",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  systemLine: { color: "#666", fontSize: 11, textAlign: "center", marginVertical: 4 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAgent: { justifyContent: "flex-start" },
  bubble: { maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleUser: { backgroundColor: "#3b82f6" },
  bubbleAgent: { backgroundColor: "#252525" },
  bubbleText: { color: "#fff", fontSize: 15, lineHeight: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#333",
  },
  input: {
    flex: 1,
    color: "#fff",
    backgroundColor: "#252525",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
});
```

Run `npx prettier --write packages/mobile-app/lib/agent-stream.ts packages/mobile-app/components/AgentSheet.tsx`.
  </action>
  <verify>
    <automated>node -e "const fs=require('fs');const c=[['packages/mobile-app/lib/agent-stream.ts','react-native-sse'],['packages/mobile-app/lib/agent-stream.ts','X-Demo-Member-Id'],['packages/mobile-app/lib/agent-stream.ts','/api/m/agent/stream'],['packages/mobile-app/lib/agent-stream.ts','onDelta'],['packages/mobile-app/lib/agent-stream.ts','onToolUse'],['packages/mobile-app/lib/agent-stream.ts','onDone'],['packages/mobile-app/components/AgentSheet.tsx','streamAgent'],['packages/mobile-app/components/AgentSheet.tsx','Agent — GymOS Coach'],['packages/mobile-app/components/AgentSheet.tsx','invalidateQueries']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'react-native-sse' packages/mobile-app/lib/agent-stream.ts` returns at least 1 (import)
    - `grep -c '/api/m/agent/stream' packages/mobile-app/lib/agent-stream.ts` returns 1
    - `grep -c 'X-Demo-Member-Id' packages/mobile-app/lib/agent-stream.ts` returns 1
    - `grep -c 'addEventListener' packages/mobile-app/lib/agent-stream.ts` returns at least 5 (delta + tool_use + tool_result + done + error)
    - `grep -c 'export.*streamAgent' packages/mobile-app/lib/agent-stream.ts` returns 1
    - `grep -c 'streamAgent' packages/mobile-app/components/AgentSheet.tsx` returns at least 2 (import + call)
    - `grep -c 'Agent — GymOS Coach' packages/mobile-app/components/AgentSheet.tsx` returns 1 (sheet header)
    - `grep -c 'invalidateQueries' packages/mobile-app/components/AgentSheet.tsx` returns at least 3 (schedule + food-entries + profile invalidation on tool_result)
    - `grep -c 'KeyboardAvoidingView' packages/mobile-app/components/AgentSheet.tsx` returns at least 2
    - `grep -c 'export default function AgentSheet' packages/mobile-app/components/AgentSheet.tsx` returns 1
    - File `AgentSheet.tsx` has at least 200 lines
  </acceptance_criteria>
  <done>SSE client reads delta/tool_use/tool_result/done/error events with proper X-Demo-Member-Id header; AgentSheet renders the chat UI, calls streamAgent, accumulates assistant deltas into a single bubble, invalidates relevant TanStack caches when a tool completes</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Mount AgentSheet + FAB in root _layout.tsx — visible on every screen</name>
  <files>
    - packages/mobile-app/app/_layout.tsx
  </files>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (D2-01 Task 3 output — has QueryProvider + GestureRoot + AuthGate + Stack; we add the FAB + AgentSheetContainer mount AT THE ROOT so it overlays every tab and every screen)
    - packages/mobile-app/lib/bottom-sheet-impl.ts (the AgentSheetContainer chosen by D2-01 Task 2 spike)
    - packages/mobile-app/components/AgentSheet.tsx (Task 2 — the content to mount inside the container)
    - .planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-CONTEXT.md §"In-app agent" → D-12 (FAB is lower-right, Feather message-circle icon, visible on every screen)
  </read_first>
  <action>
EDIT `packages/mobile-app/app/_layout.tsx` (the D2-01 Task 3 version). Add:

1. New imports at the top:
```tsx
import { useState } from "react";
import { Pressable, View, StyleSheet, useColorScheme as _useColorScheme } from "react-native"; // remove _useColorScheme if not used
import { Feather } from "@expo/vector-icons";
import { useSegments as _useSegments } from "expo-router"; // _useSegments already imported; do not double-import
import { AgentSheetContainer } from "../lib/bottom-sheet-impl";
import AgentSheet from "../components/AgentSheet";
```
(Reconcile with the existing imports — D2-01 already imports `useState`, `useSegments`, `View`, etc. Don't double-import. Add only what's missing.)

2. A new `<AgentFab>` component inside the same file (just above the `RootLayout` export):

```tsx
function AgentFabAndSheet() {
  const segments = useSegments();
  const [open, setOpen] = useState(false);

  // Hide FAB on the picker screen (no member yet → no agent context)
  const onPicker = segments[0] === "pick-member";
  if (onPicker) return null;

  return (
    <>
      <View pointerEvents="box-none" style={fabStyles.fabHost}>
        <Pressable style={fabStyles.fab} onPress={() => setOpen(true)} hitSlop={8}>
          <Feather name="message-circle" size={24} color="#fff" />
        </Pressable>
      </View>
      <AgentSheetContainer open={open} onClose={() => setOpen(false)}>
        {open && <AgentSheet onClose={() => setOpen(false)} />}
      </AgentSheetContainer>
    </>
  );
}

const fabStyles = StyleSheet.create({
  fabHost: {
    position: "absolute",
    right: 18,
    bottom: 92, // above tab bar
    zIndex: 100,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
```

3. Mount `<AgentFabAndSheet />` inside `RootLayout` AFTER `<Stack>...</Stack>` but still inside `<AuthGate>`, so it's only shown when auth-gated. The final structure should look like:

```tsx
export default function RootLayout() {
  return (
    <QueryProvider>
      <GestureRoot>
        <StatusBar style="light" />
        <AuthGate>
          <Stack
            screenOptions={{ ... existing ... }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="pick-member" options={{ headerShown: false }} />
            {/* food-add + food-barcode registrations added by D2-05 */}
            <Stack.Screen name="food-add" options={{ ... }} />
            <Stack.Screen name="food-barcode" options={{ ... }} />
          </Stack>
          <AgentFabAndSheet />
        </AuthGate>
      </GestureRoot>
    </QueryProvider>
  );
}
```

The exact JSX shape may differ — DO NOT delete or modify any existing `Stack.Screen` registrations (D2-01 + D2-05 added them). Only ADD the imports + `AgentFabAndSheet` component + the single `<AgentFabAndSheet />` mount.

Run `npx prettier --write packages/mobile-app/app/_layout.tsx`.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/app/_layout.tsx','utf8');const checks=['AgentSheetContainer','AgentSheet','message-circle','AgentFabAndSheet','pick-member','name=\"(tabs)\"'];const missing=checks.filter(c=>!s.includes(c));if(missing.length){console.error('MISSING',missing);process.exit(1)}const fab=(s.match(/AgentFabAndSheet/g)||[]).length;if(fab<2){console.error('AgentFabAndSheet not mounted — found',fab,'occurrences (need >=2: definition + mount)');process.exit(1)}"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c 'AgentSheetContainer' packages/mobile-app/app/_layout.tsx` returns at least 2 (import + usage)
    - `grep -c "AgentSheet" packages/mobile-app/app/_layout.tsx` returns at least 3 (import default + container usage + AgentSheet child)
    - `grep -c 'message-circle' packages/mobile-app/app/_layout.tsx` returns 1 (Feather icon name)
    - `grep -c 'AgentFabAndSheet' packages/mobile-app/app/_layout.tsx` returns at least 2 (function definition + mount)
    - `grep -c 'name="(tabs)"' packages/mobile-app/app/_layout.tsx` returns 1 (existing Stack.Screen preserved)
    - `grep -c 'name="pick-member"' packages/mobile-app/app/_layout.tsx` returns 1 (existing preserved)
    - `grep -c 'name="food-add"' packages/mobile-app/app/_layout.tsx` returns 1 (D2-05 preserved)
    - `grep -c 'name="food-barcode"' packages/mobile-app/app/_layout.tsx` returns 1 (D2-05 preserved)
    - `pnpm --filter @agent-native/mobile-app exec tsc --noEmit` returns 0 errors
  </acceptance_criteria>
  <done>FAB is rendered at root layout (visible above every tab + every modal screen), opens the AgentSheetContainer with AgentSheet inside, hidden on pick-member; all prior Stack.Screen registrations preserved</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: End-to-end agent demo — greet, book_class with confirmation, log_food_nl</name>
  <what-built>
The full agent path: FAB tap → bottom-sheet → user prompt → SSE deltas stream → Claude calls a tool → server executes → caches invalidate → result reflected in the relevant tab. All three tools verified live.
  </what-built>
  <files>
    - (no file changes — this is a live agent smoke test that exercises Tasks 1-3 against Anthropic + the local Mail server + Expo Go)
  </files>
  <action>SEE <what-built> + <how-to-verify> ABOVE. The executor walks through the 5 live tests: FAB open + greet, book_class with confirmation gate, log_food_nl, sheet cancel, FAB hidden on picker. No files modified — this checkpoint VERIFIES Tasks 1-3 end-to-end with real Claude Sonnet 4.6 calls. The executor pauses for human approval.</action>
  <verify>
    <automated>node -e "const fs=require('fs');const s=fs.readFileSync('templates/mail/app/routes/api.m.agent.stream.tsx','utf8');if(!s.includes('claude-sonnet-4-6'))process.exit(1);if(!s.includes('stop_reason === \"tool_use\"'))process.exit(1);const lay=fs.readFileSync('packages/mobile-app/app/_layout.tsx','utf8');if(!lay.includes('AgentSheetContainer'))process.exit(1);"</automated>
  </verify>
  <how-to-verify>
**Prereqs:**
- `templates/mail/.env.local` has `ANTHROPIC_API_KEY=sk-ant-...` populated
- `pnpm --filter mail dev` running on :8081
- `cd packages/mobile-app && npx expo start --tunnel` running
- Phone running Expo Go, app booted, member-picker passed (you're on Home tab)

**Test 1 — `greet` tool:**
1. Tap the FAB (lower-right blue circle with message bubble)
2. Bottom-sheet slides up to ~2/3 viewport. Header "Agent — GymOS Coach". Input visible.
3. Type "hi" + Send
4. Expected: assistant bubble appears, text streams in word-by-word (proves SSE delta path), agent identifies itself and lists capabilities. May or may not explicitly call the `greet` tool (Claude's discretion).
5. Server log shows the Anthropic request + response.

**Test 2 — `book_class` with confirmation gate (D-13 critical behaviour):**
1. In the chat, type "book me into something tomorrow morning"
2. Expected: assistant asks "Which class would you like? Here are the options tomorrow morning…" OR asks to confirm a specific occurrence (Claude may invent times — that's a tell to fix the system prompt, but for demo acceptable)
3. If Claude picks a specific occurrenceId on its own (it shouldn't — IDs aren't in context), redirect by saying "the 7am Yoga". If it asks for ID, paste any real `occ_*` ID visible in the Schedule tab.
4. Type "yes, please" or "confirm"
5. Expected: a system line "· Using book_class…" appears; the agent confirms the booking with the returned bookingId
6. Close the sheet, navigate to Schedule tab → the booked occurrence shows "Booked" badge
7. Database check: `SELECT id, occurrence_id, member_id FROM bookings ORDER BY booked_at DESC LIMIT 1;` — verify the booking row exists

**Test 3 — `log_food_nl`:**
1. Re-open the FAB sheet
2. Type "I had a banana for breakfast"
3. Expected: agent calls `log_food_nl`, system line "· Using log_food_nl…" appears, agent confirms "Logged a banana (~178 kcal) for breakfast"
4. Close sheet, navigate to Food tab → "Banana" row appears under Breakfast section, totals updated
5. Database check: `SELECT name, kcal, meal_type FROM food_entries fe LEFT JOIN food_items fi ON fe.food_item_id = fi.id WHERE source = 'agent' ORDER BY logged_at DESC LIMIT 1;` — verify row

**Test 4 — Close + cancel behaviour:**
1. Open the sheet, start a message, before assistant responds tap the X
2. Expected: sheet closes; opening it again starts a fresh session (no message history)

**Test 5 — Hidden on picker:**
1. Profile tab → long-press → confirm Switch
2. Picker screen shows. FAB should NOT be visible (segments[0] === "pick-member")

If any test fails, do NOT approve. Common debugging:
- Sheet doesn't open → check D2-01 Task 2 spike result; the chosen impl in `bottom-sheet-impl.ts` may need to switch
- Streaming dumps in one chunk → `react-native-sse` not in deps (D2-01 should have installed); verify with `npm ls react-native-sse` in `packages/mobile-app/`
- Tool calls always fail → check server logs; common cause is `claude-sonnet-4-6` not being on the Anthropic account yet (the model ID may need to be `claude-3-5-sonnet-latest` as a fallback)
- Booking doesn't reflect → check the qc.invalidateQueries(["schedule"]) call fires; FlatList may need explicit refresh
  </how-to-verify>
  <resume-signal>Type `approved` or describe failures (e.g. `book_class skipped confirmation`)</resume-signal>
  <acceptance_criteria>
    - User confirms FAB visible on Home + Schedule + Food + Profile tabs
    - User confirms FAB hidden on pick-member screen
    - User confirms SSE deltas stream word-by-word (not a one-shot dump)
    - User confirms `greet` returns capabilities
    - User confirms `book_class` asks confirmation BEFORE inserting, only inserts on "yes"
    - User confirms the booking row exists in DB after book_class
    - User confirms `log_food_nl` inserts foodItems + foodEntries; the Food tab shows the new entry under the right meal type
    - User confirms closing the sheet cancels in-flight stream
  </acceptance_criteria>
  <done>All 3 AGENT-* requirements verified live: streaming reply (AGENT-03), 3 tools end-to-end with explicit confirmation gate (AGENT-02), chat sheet from persistent FAB (AGENT-01)</done>
</task>

</tasks>

<verification>
**Automated:**

```bash
node -e "const fs=require('fs');const c=[['templates/mail/app/routes/api.m.agent.stream.tsx','claude-sonnet-4-6'],['templates/mail/app/routes/api.m.agent.stream.tsx','stop_reason === \"tool_use\"'],['packages/mobile-app/lib/agent-stream.ts','react-native-sse'],['packages/mobile-app/components/AgentSheet.tsx','streamAgent'],['packages/mobile-app/app/_layout.tsx','AgentSheetContainer']];for(const[f,s] of c){if(!fs.readFileSync(f,'utf8').includes(s)){console.error('FAIL',f,s);process.exit(1)}}console.log('OK')"

pnpm --filter mail exec tsc --noEmit
pnpm --filter @agent-native/mobile-app exec tsc --noEmit
```

**Manual (Task 4 checkpoint):** Live 5-test path (greet / book_class confirmation / log_food_nl / cancel / picker-hidden).
</verification>

<success_criteria>
- [ ] /api/m/agent/stream returns text/event-stream with delta/tool_use/tool_result/done events
- [ ] Anthropic SDK initialized server-side only (key not in mobile bundle)
- [ ] Model is claude-sonnet-4-6 with cache_control:ephemeral on system + member-context blocks
- [ ] 3 tools defined with input_schema; book_class description includes the confirmation instruction
- [ ] Manual tool loop on stop_reason === "tool_use"; loops up to 5 turns
- [ ] react-native-sse opens an EventSource with X-Demo-Member-Id header
- [ ] AgentSheet renders chat UI inside the spike-chosen container (gorhom or rn-modal)
- [ ] FAB visible on every screen except pick-member
- [ ] Tool execution writes to bookings / foodItems / foodEntries; mobile caches invalidate after tool_result
- [ ] Live demo: greet works, book_class asks confirmation BEFORE inserting, log_food_nl inserts a foodEntry
</success_criteria>

<output>
After completion, create `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/D2-06-agent-chat-sse-tools-SUMMARY.md` documenting:
- Files created/modified
- The exact `claude-sonnet-4-6` model used (or fallback if 4.6 not available on the account)
- Live demo results: which tools fired, whether `book_class` honoured the confirmation gate, latency feel of streaming
- Demo limitations: no persistence (D-15 / AGENT-04/05 deferred), no audit log (AGENT-08 deferred), no extended tools (AGENT-06 deferred), no per-studio prompt loading (AGENT-09 deferred)
- Anthropic spend during testing (rough $ from console.anthropic.com)
</output>
</content>
</invoke>