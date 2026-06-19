/**
 * apps/hq/server/routes/api/signup/index.post.ts
 *
 * Public signup intake — POST /api/signup
 *
 * PROV-01: Validates body, inserts hq_studios + hq_provisioning_runs, enqueues
 * the provisioning saga in the pg-boss "provision-studio" queue, and returns
 * 202 immediately. The handler NEVER does any provider work inline.
 *
 * Integration-webhook queue pattern (AGENTS.md):
 *   verify → INSERT studio+run → boss.send → return 202 → saga runs in hq-worker
 *
 * Public path: /api/signup is in auth publicPaths (signup is pre-login —
 * a prospective gym, not a logged-in operator).
 *
 * Duplicate slug: guarded by UNIQUE(slug) in hq_studios; DB error is caught
 * and returned as HTTP 409 (PROV-08 at intake).
 */

// guard:allow-unscoped — HQ tables are operator-scoped (no ownableColumns);
// signup is unauthenticated (pre-operator) and writes to global HQ tables.

import { createError, defineEventHandler, setResponseStatus } from "h3";
import { readBody } from "@agent-native/core/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { getDb, schema } from "../../../db/index.js";
import { getBoss } from "@gymos/queue";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const SignupSchema = z.object({
  displayName: z.string().min(1, "displayName is required"),
  ownerEmail: z.string().email("ownerEmail must be a valid email"),
  // Slug is derived from displayName if omitted (lowercased, hyphenated).
  slug: z.string().min(1).optional(),
});

type SignupBody = z.infer<typeof SignupSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a display name to a URL-safe slug. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** True when the error looks like a Postgres UNIQUE violation on the slug column. */
function isSlugConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  // Postgres error code 23505 = unique_violation
  const code = (e.code as string) ?? "";
  const constraint = (e.constraint as string) ?? "";
  const message = (e.message as string) ?? "";
  return (
    code === "23505" ||
    constraint.includes("slug") ||
    message.includes("unique") && message.includes("slug")
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default defineEventHandler(async (event) => {
  // ── 1. Validate body ──────────────────────────────────────────────────────
  const raw = await readBody(event);
  const parsed = SignupSchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid signup body",
      data: parsed.error.flatten(),
    });
  }

  const body: SignupBody = parsed.data;
  const slug = body.slug ?? slugify(body.displayName);

  // ── 2. Insert hq_studios (UNIQUE slug — dup → 409) ───────────────────────
  const studioId = randomUUID();
  const runId = randomUUID();
  const db = getDb();

  try {
    await db.insert(schema.hqStudios).values({
      id: studioId,
      slug,
      displayName: body.displayName,
      ownerEmail: body.ownerEmail,
      status: "pending",
    });
  } catch (err) {
    if (isSlugConflict(err)) {
      throw createError({
        statusCode: 409,
        statusMessage: `Studio slug "${slug}" is already taken`,
      });
    }
    throw err;
  }

  // ── 3. Insert hq_provisioning_runs (status 'started') ────────────────────
  await db.insert(schema.hqProvisioningRuns).values({
    id: runId,
    studioId,
    status: "started",
  });

  // ── 4. Enqueue the provisioning saga (producer contract P-07) ────────────
  // expireInSeconds:600 — prevents a hung saga from blocking the queue.
  // retryLimit:3 — saga is idempotent per step (runStep) so retries are safe.
  await getBoss().send("provision-studio", { runId }, {
    expireInSeconds: 600,
    retryLimit: 3,
  });

  // ── 5. Return 202 immediately — saga runs asynchronously in hq-worker ─────
  setResponseStatus(event, 202);
  return { runId };
});
