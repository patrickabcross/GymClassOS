import { Client, MessageType } from "@great-detail/whatsapp";
import type { TemplateLanguage } from "@great-detail/whatsapp";
import type { SendTextArgs, SendTemplateArgs, SendResult } from "./types.js";
import {
  SendTextArgs as SendTextSchema,
  SendTemplateArgs as SendTemplateSchema,
} from "./types.js";

let _sdk: Client | undefined;

function getSdk(): Client {
  if (_sdk) return _sdk;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN is not set");
  _sdk = new Client({
    request: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  return _sdk;
}

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

export async function sendText(args: SendTextArgs): Promise<SendResult> {
  const validated = SendTextSchema.parse(args);
  const sdk = getSdk();
  const result = await sdk.message
    .createMessage({
      phoneNumberID: getPhoneNumberId(),
      to: validated.to,
      type: MessageType.Text,
      text: { body: validated.body },
    })
    .json();
  return { messageId: result.messages[0].id };
}

export async function sendTemplate(
  args: SendTemplateArgs,
): Promise<SendResult> {
  const validated = SendTemplateSchema.parse(args);
  const components = Object.values(validated.vars).map((v) => ({
    type: "body" as const,
    parameters: [{ type: "text" as const, text: v }],
  }));
  const sdk = getSdk();
  const result = await sdk.message
    .createMessage({
      phoneNumberID: getPhoneNumberId(),
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
