import { z } from "zod";

const EnvSchema = z.object({
  // ---------------------------------------------------------------
  // HQ DATABASE (REQUIRED)
  // hq-worker connects ONLY to the HQ Neon (unpooled) — never to any
  // studio Neon. pg-boss requires LISTEN/NOTIFY + advisory locks, so
  // the unpooled connection string is mandatory (PITFALL #1).
  // ---------------------------------------------------------------
  DATABASE_URL_UNPOOLED: z
    .string()
    .url()
    .refine((u) => !u.includes("-pooler"), {
      message:
        "DATABASE_URL_UNPOOLED must not include -pooler (PITFALL #1 — unpooled URL is required for pg-boss / LISTEN/NOTIFY / advisory locks)",
    }),

  // Runtime
  PORT: z.coerce.number().int().positive().default(3003),
  GIT_SHA: z.string().optional().default("dev"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // ---------------------------------------------------------------
  // BD2 PROV — Provider API tokens (operator-provided, OPTIONAL here)
  //
  // These secrets let hq-worker call Neon/Vercel APIs and shell out to
  // flyctl during the provisioning saga (BD2-05).
  //
  // All six are optional so the worker starts without them.
  // BD2-05's saga throws a clear "deferred-on-external-dependency" error
  // if a live provisioning run starts while any of these are unset.
  // Unit tests use mocked provider adapters and never need real values.
  //
  // Set via: fly secrets set <NAME>=<value> -a gymos-hq-worker
  // ---------------------------------------------------------------

  // Neon Management API (Step 1: create studio Neon project)
  // Source: Neon Console → Account Settings → API Keys
  NEON_API_KEY: z.string().min(8).optional(),

  // Vercel REST API (Step 4: create Vercel project + deploy + attach domain)
  // Source: Vercel Dashboard → Settings → Tokens
  VERCEL_BEARER_TOKEN: z.string().min(8).optional(),
  // Source: Vercel Dashboard → Team Settings → General
  VERCEL_TEAM_ID: z.string().min(1).optional(),

  // Fly Machines API + flyctl (Step 5: create Fly app, set secrets, launch machine)
  // MUST be an org-scoped token (fly tokens create org), NOT a deploy token.
  // Deploy tokens cannot set secrets; org token is required.
  // Source: fly tokens create org -n gymos-provisioner -o <org> (org-scoped)
  FLY_API_TOKEN: z.string().min(8).optional(),
  // Source: fly orgs list
  FLY_ORG_SLUG: z.string().min(1).optional(),
  // Source: registry.fly.io/<image>:latest built by CI
  GYMOS_WORKER_IMAGE: z.string().min(1).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;
export function getEnv(): Env {
  if (_env) return _env;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "[hq-worker env] validation failed:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid hq-worker env — see [hq-worker env] output above");
  }
  _env = parsed.data;
  return _env;
}

/** Test-only: reset cached env so each test can mock process.env afresh. */
export function _resetEnvForTests(): void {
  _env = undefined;
}
