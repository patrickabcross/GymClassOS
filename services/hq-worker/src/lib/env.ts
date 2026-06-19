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
  // BD2 PROV PLACEHOLDERS (NOT required in BD1 — arrive in BD2)
  // These secrets let hq-worker shell out to flyctl + call Neon/Vercel
  // APIs during the provisioning saga. Leave them optional here;
  // BD2 makes them required and adds validation.
  // ---------------------------------------------------------------
  // NEON_API_KEY: z.string().min(8).optional(),
  // VERCEL_API_TOKEN: z.string().min(8).optional(),
  // FLY_API_TOKEN: z.string().min(8).optional(),  // MUST be org-scoped, NOT a deploy token
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
