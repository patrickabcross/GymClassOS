import { z } from "zod";

const EnvSchema = z.object({
  // DB (worker MUST use unpooled — pg-boss requires LISTEN/NOTIFY + advisory locks)
  DATABASE_URL_UNPOOLED: z
    .string()
    .url()
    .refine((u) => !u.includes("-pooler"), {
      message:
        "DATABASE_URL_UNPOOLED must not include -pooler (PITFALL #1 — unpooled URL is required for pg-boss / long-running connections)",
    }),

  // WhatsApp (Plan 06 sendMessage chokepoint)
  WHATSAPP_ACCESS_TOKEN: z.string().min(8),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(4),

  // WA-08 (Plan 09 housekeeping cron — daily template sync from Meta).
  // Optional: when absent, the templates-sync handler logs a warning and
  // returns; worker still boots. Plan 09 docs how to set this in the
  // post-cutover RUNBOOK.
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(4).optional(),

  // MYÜTIK template-sync path (WA-08 repoint — 260608-fb8).
  // Optional: absence means no DB row AND no env var; the templates-sync
  // handler logs a warning and returns cleanly (worker still boots).
  MYUTIK_API_KEY: z.string().min(8).optional(),
  MYUTIK_PHONE_NUMBER_ID: z.string().min(4).optional(),

  // Shared key material for decrypting app_secrets (written by staff-web
  // Settings UI). Mirrors framework getEncryptionKey precedence. Optional:
  // when absent, every resolver falls back to the pgcrypto secrets table + env.
  // To activate: set the SAME value that staff-web uses via
  // `fly secrets set BETTER_AUTH_SECRET=<value> -a <worker-app>`.
  // Prefer SECRETS_ENCRYPTION_KEY if staff-web is later switched to it;
  // the worker checks it first, matching framework precedence.
  SECRETS_ENCRYPTION_KEY: z.string().min(16).optional(),
  BETTER_AUTH_SECRET: z.string().min(16).optional(),

  // Stripe (Plan 07 reducers)
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_/, "Must be sk_/rk_ key"),

  // pgcrypto master key (Plan 07 secrets read)
  PGCRYPTO_MASTER_KEY: z.string().min(16),

  // BD2-04: HQ telemetry push — optional; unconfigured studios skip cleanly.
  // Set by the provisioning saga at Step 4/5/7 (BD2-05/06) via Vercel env +
  // Fly secret. When absent the telemetry-push handler logs a warning and
  // returns without error so the worker still boots clean.
  HQ_INGEST_URL: z.string().url().optional(),
  STUDIO_TELEMETRY_TOKEN: z.string().min(16).optional(),
  STUDIO_ID: z.string().min(1).optional(),
  STUDIO_TIMEZONE: z.string().optional(),

  // Runtime
  PORT: z.coerce.number().int().positive().default(3002),
  GIT_SHA: z.string().optional().default("dev"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;
export function getEnv(): Env {
  if (_env) return _env;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[worker env] validation failed:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid worker env — see [worker env] output above");
  }
  _env = parsed.data;
  return _env;
}

/** Test-only: reset cached env so each test can mock process.env afresh. */
export function _resetEnvForTests(): void {
  _env = undefined;
}
