import { Client, MessageType } from "@great-detail/whatsapp";
import type { TemplateLanguage } from "@great-detail/whatsapp";
import type {
  SendTextArgs,
  SendTemplateArgs,
  SendResult,
  WhatsAppCreds,
} from "./types.js";
import {
  SendTextArgs as SendTextSchema,
  SendTemplateArgs as SendTemplateSchema,
} from "./types.js";

let _sdk: Client | undefined;

/**
 * Get (or create) the WhatsApp SDK client.
 *
 * When `token` is explicitly provided (injected by the worker's DB-first resolver),
 * a fresh Client is built and returned — no singleton caching so the explicit-creds
 * path never pollutes the env-default singleton.
 *
 * When `token` is omitted, falls back to process.env.WHATSAPP_ACCESS_TOKEN and
 * memoises the result in `_sdk` (backward-compatible env-default path).
 */
function getSdk(token?: string): Client {
  if (!token) {
    // Env-default path — memoize
    if (_sdk) return _sdk;
    const t = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!t) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
    _sdk = new Client({
      request: {
        headers: { Authorization: `Bearer ${t}` },
      },
    });
    return _sdk;
  }
  // Explicit-creds path — always fresh (rotation-safe, no singleton pollution)
  return new Client({
    request: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

function getPhoneNumberId(id?: string): string {
  const v = id ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!v) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return v;
}

export async function sendText(
  args: SendTextArgs,
  creds?: WhatsAppCreds,
): Promise<SendResult> {
  const validated = SendTextSchema.parse(args);
  const sdk = getSdk(creds?.accessToken);
  const result = await sdk.message
    .createMessage({
      phoneNumberID: getPhoneNumberId(creds?.phoneNumberId),
      to: validated.to,
      type: MessageType.Text,
      text: { body: validated.body },
    })
    .json();
  return { messageId: result.messages[0].id };
}

export async function sendTemplate(
  args: SendTemplateArgs,
  creds?: WhatsAppCreds,
): Promise<SendResult> {
  const validated = SendTemplateSchema.parse(args);
  const components = Object.values(validated.vars).map((v) => ({
    type: "body" as const,
    parameters: [{ type: "text" as const, text: v }],
  }));
  const sdk = getSdk(creds?.accessToken);
  const result = await sdk.message
    .createMessage({
      phoneNumberID: getPhoneNumberId(creds?.phoneNumberId),
      to: validated.to,
      type: MessageType.Template,
      template: {
        name: validated.name,
        language: {
          code: (validated.language ?? "en_US") as TemplateLanguage,
        },
        components,
      },
    })
    .json();
  return { messageId: result.messages[0].id };
}

/** For tests only — reset the cached SDK singleton. */
export function _resetSdkForTests() {
  _sdk = undefined;
}
