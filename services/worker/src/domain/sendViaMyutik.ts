/**
 * MYÜTIK outbound WhatsApp send client (WA-05).
 *
 * The GymClassOS Meta app is NOT approved to send on Hustle's WABA number
 * (Meta returns code 100/subcode 33 "missing permissions" on a real send).
 * MYÜTIK holds the token with the right WhatsApp permissions on that WABA;
 * its relay endpoint (POST /api/channels/whatsapp/send) shipped 2026-06-05.
 *
 * This is the same pattern already applied to template sync (syncTemplates.ts
 * was repointed at MYÜTIK) — now the SEND path follows.
 *
 * Mirrors syncTemplates.ts fetch + error style: thin client, x-api-key header,
 * status-carrying errors so the sendMessage chokepoint classifier branches
 * correctly (4xx → terminal failed/no-retry; 5xx/network → re-throw/retry).
 *
 * The account is resolved from the API key — no Meta token is passed.
 */

const MYUTIK_SEND_URL = "https://myutik.com/api/channels/whatsapp/send";

export interface SendViaMyutikArgs {
  apiKey: string;
  phoneNumberId: string;
  /** E.164, KEEP the leading + (MYÜTIK accepts with or without). */
  to: string;
  /** Free-form text (open 24h window) — mutually exclusive with templateName. */
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: unknown[];
}

export async function sendViaMyutik(
  args: SendViaMyutikArgs,
): Promise<{ wamid: string }> {
  // Build the body from provided fields, OMITTING any undefined field.
  // `to` and `phoneNumberId` are always included.
  const body: Record<string, unknown> = {
    to: args.to,
    phoneNumberId: args.phoneNumberId,
  };
  if (args.text !== undefined) body.text = args.text;
  if (args.templateName !== undefined) body.templateName = args.templateName;
  if (args.templateLanguage !== undefined)
    body.templateLanguage = args.templateLanguage;
  if (args.templateComponents !== undefined)
    body.templateComponents = args.templateComponents;

  const res = await fetch(MYUTIK_SEND_URL, {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const status = res.status;
    // Try JSON first (MYÜTIK error bodies are JSON), fall back to text.
    let detail = "";
    const parsed = await res.json().catch(() => undefined);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as {
        error?: unknown;
        requiresTemplate?: unknown;
      };
      const errStr =
        typeof obj.error === "string" ? obj.error : JSON.stringify(parsed);
      detail =
        status === 409 && obj.requiresTemplate
          ? `${errStr} (requiresTemplate: true)`
          : errStr;
    } else {
      detail = (await res.text().catch(() => "")).slice(0, 200);
    }
    throw Object.assign(new Error(`MYÜTIK send ${status}: ${detail}`), {
      status,
    });
  }

  const json = (await res.json().catch(() => ({}))) as {
    result?: { messages?: Array<{ id?: string }> };
  };
  const wamid = json.result?.messages?.[0]?.id ?? "";
  if (!wamid) {
    // 200 but no wamid — treat as a transient downstream failure so pg-boss
    // retries (>= 500 status routes through the re-throw branch).
    throw Object.assign(
      new Error("MYÜTIK send 200 but no wamid in result.messages"),
      { status: 502 },
    );
  }

  return { wamid };
}
