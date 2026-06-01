import { z } from "zod";

export const SendTextArgs = z.object({
  to: z.string().min(7), // E.164 without leading +, e.g. "447700900000"
  body: z.string().min(1).max(4096),
});
export type SendTextArgs = z.infer<typeof SendTextArgs>;

export const SendTemplateArgs = z.object({
  to: z.string().min(7),
  name: z.string().min(1),
  vars: z.record(z.string(), z.string()),
  language: z.string().optional().default("en_US"),
});
export type SendTemplateArgs = z.infer<typeof SendTemplateArgs>;

export type SendResult = { messageId: string };

/**
 * Optional creds injection for sendText/sendTemplate.
 * When provided, the adapter uses these values instead of process.env.
 * This lets the worker resolve creds DB-first (rotation-capable) and pass
 * them in, while the env-default path is preserved for backward compatibility.
 */
export type WhatsAppCreds = {
  accessToken: string;
  phoneNumberId: string;
};
