import { z } from "zod";

const EnvSchema = z.object({
  // DB
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid postgres URL"),
  DATABASE_URL_UNPOOLED: z
    .string()
    .url()
    .refine((u) => !u.includes("-pooler"), {
      message:
        "DATABASE_URL_UNPOOLED must not include -pooler (PITFALL #1 — unpooled URL is required for pg-boss / long-running connections)",
    }),
  // Stripe
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_/, "Must be sk_/rk_ key"),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/),
  // WhatsApp
  WHATSAPP_VERIFY_TOKEN: z.string().min(8),
  WHATSAPP_APP_SECRET: z.string().min(8),
  // Optional
  PORT: z.coerce.number().int().positive().default(3001),
  GIT_SHA: z.string().optional().default("dev"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;
export function getEnv(): Env {
  if (_env) return _env;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[env] validation failed:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid env — see [env] output above");
  }
  _env = parsed.data;
  return _env;
}

/** Test-only: reset cached env so each test can mock process.env afresh. */
export function _resetEnvForTests(): void {
  _env = undefined;
}
