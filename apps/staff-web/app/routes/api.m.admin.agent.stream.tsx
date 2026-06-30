//
// Admin agent SSE endpoint — MA4-02 (AI-01 server half / AI-03 auth gate).
//
// Server-side ONLY: imports @anthropic-ai/sdk; the API key never leaves this
// process. Mobile client consumes the SSE via react-native-sse with a
// Bearer/Cookie session.
//
// Security boundary (AI-03): a teacher or member token is rejected with HTTP
// 403 by requireAdmin() at the TOP of action() — BEFORE the ReadableStream is
// constructed, so the stream never opens for non-admins. This is a SEPARATE
// route from the member coach endpoint (no role-branch) so the 403 surface and
// the tool set stay structurally independent and independently testable.
//
// The tool set is the filtered allow-list from MA4-01 (buildAdminToolList over
// MOBILE_ADMIN_ALLOWLIST — read + dashboard authoring only; every gated/mutating
// verb is structurally absent). Tools execute via the registry (registry[name].run,
// already Zod-wrapped — no re-validation), wrapped in runWithRequestContext so
// every tool call carries the admin's identity (AI-03).
//
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "../../server/lib/admin-session.js";
import { buildAdminToolList } from "../../server/lib/mobile-admin-tools.js";
import {
  runWithRequestContext,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";
import actionsRegistry from "../../.generated/actions-registry.js";
import type { ActionFunctionArgs } from "react-router";

// claude-sonnet-4-6 is current production (mirrors the member coach endpoint);
// do NOT invent a new model string.
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are RunStudio Admin — a brief, sharp, action-oriented in-app ops assistant for the owner/admin of a boutique fitness studio, working from their phone.

What you can do:
- Answer analytics and operations questions using your tools: class fill rate, renewals, revenue (MRR/ARPM/net growth), recent payments, at-risk members, WhatsApp inbox summary, the class catalog, the member roster, and the trainer roster.
- Maintain the studio noticeboard: write or replace section notes (upsert-section-note) and curate the prioritized tasks list (create-task, complete-task).

What you CANNOT do from the phone (be plain about this if asked):
- You cannot send WhatsApp messages or templates, take payments or create checkout links, cancel or reschedule classes, mutate the schedule/catalog/members, or publish forms. Those actions stay on the web back-office behind explicit approval. If the admin asks for one, say it must be done from the web app and offer to draft a noticeboard task instead.

Rules:
- Be terse. Lead with the number or the answer. One short paragraph per turn unless asked for detail.
- Never invent figures, members, classes, or balances. If a tool returns nothing, say so honestly.
- Prefer calling a tool over guessing. When authoring the board, confirm what you wrote.
- Today's date and the studio's data are live — always reflect the latest tool result.`;

export async function action({ request }: ActionFunctionArgs) {
  // AI-03: gate BEFORE the stream opens — throws 401/403, forwarded by the
  // Nitro wrapper as a clean HTTP status (Pitfall 2).
  const admin = await requireAdmin(request);

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

  // Build the admin tool set from the static registry, filtered to the MA4-01
  // allow-list (read + dashboard authoring only; gated verbs stripped).
  const registry = loadActionsFromStaticRegistry(actionsRegistry as any);
  const tools = buildAdminToolList(registry as any);

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const adminContext = JSON.stringify({
    email: admin.email,
    nowIso: new Date().toISOString(),
  });

  // AI-03: every tool call runs under the admin's identity.
  return runWithRequestContext({ userEmail: admin.email }, async () => {
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
          while (turn < 8) {
            const msStream = client.messages.stream({
              model: MODEL,
              max_tokens: 1024,
              system: [
                {
                  type: "text",
                  text: SYSTEM_PROMPT,
                  cache_control: { type: "ephemeral" }, // 5m TTL — rarely changes
                },
                {
                  type: "text",
                  text: `<admin>${adminContext}</admin>`,
                  cache_control: { type: "ephemeral" },
                },
              ],
              tools: tools as any,
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

              // Execute via the registry (already Zod-wrapped — do NOT
              // re-validate). Guard an unknown/out-of-allow-list tool so a
              // hallucinated name cannot crash the loop.
              let result: any;
              const entry = (registry as any)[toolUse.name];
              if (!entry) {
                result = { ok: false, error: "Tool not available" };
              } else {
                result = await entry.run(toolUse.input);
              }
              send("tool_result", { id: toolUse.id, result });

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
  });
}
