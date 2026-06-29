/**
 * Idempotent seed for the MA1 auth spike test account.
 *
 * Creates a Better-auth email+password test user via the sign-up endpoint
 * (never raw SQL — D-08) and an unclaimed gym_members row (userId IS NULL)
 * so the claim round-trip can be exercised end-to-end on a real device.
 *
 * Idempotency guarantees:
 *   - Better-auth sign-up endpoint returns 409/422 when the user already
 *     exists — this seed treats that as success and continues.
 *   - gym_members row: if a row with the test email already exists, it is left
 *     completely untouched (userId is NEVER overwritten here — that is the
 *     claim's job).  A row is only inserted when absent.
 *
 * Run against live API + Neon with:
 *   MA1_SPIKE_API_BASE=https://gym-class-os.vercel.app \
 *   pnpm --filter @gymos/staff-web db:seed-ma1-test-account
 *
 * Required env:
 *   DATABASE_URL     — Neon connection string (auto-loaded from .env.local / .env)
 *
 * Optional env:
 *   MA1_SPIKE_API_BASE  — API origin for the sign-up HTTP call
 *                          (default: http://localhost:3000)
 *   MA1_SPIKE_EMAIL     — test account email (default: ma1-spike@example.com)
 *   MA1_SPIKE_PASSWORD  — test account password
 *                          (default: spike-test-pw-CHANGEME — change before use)
 *   MA1_SPIKE_PHONE     — test member phone in E.164 (default: +447700900123)
 *
 * MA1-03 plan — seed created 2026-06-29.
 * NO schema change. gym_members.user_id already nullable (MA1-RESEARCH Finding 10).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/staff-web/server/db/seeds/ → apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });

// Dynamic imports keep Drizzle + @agent-native/core out of the module scope so
// that tsx can load this seed without a full build-time type-check pass.
const { getDb, schema } = await import("../index.js");
const { eq } = await import("drizzle-orm");

// ─────────────────────────────────────────────────────────────────────────────
// Seed options
// ─────────────────────────────────────────────────────────────────────────────

export interface SeedMa1Options {
  email?: string;
  password?: string;
  phoneE164?: string;
  apiBase?: string;
}

/**
 * seedMa1TestAccount — idempotent seed for the MA1 spike test account.
 *
 * Steps:
 *   1. POST to /_agent-native/auth/ba/sign-up/email — creates a Better-auth
 *      user (idempotent: 409 treated as success).
 *   2. SELECT gym_members WHERE email = lower(trim(email)):
 *        - If absent  → INSERT { id, userId: null, firstName, lastName, email, phoneE164 }
 *        - If present → leave untouched (userId may already be linked — do not overwrite)
 *   3. Print the resulting test email + member id.
 */
export async function seedMa1TestAccount(opts: SeedMa1Options = {}): Promise<{
  email: string;
  memberId: string;
  memberUserId: string | null;
  userAlreadyExisted: boolean;
  memberAlreadyExisted: boolean;
}> {
  const email =
    opts.email ?? process.env.MA1_SPIKE_EMAIL ?? "ma1-spike@example.com";
  const password =
    opts.password ?? process.env.MA1_SPIKE_PASSWORD ?? "spike-test-pw-CHANGEME";
  const phoneE164 =
    opts.phoneE164 ?? process.env.MA1_SPIKE_PHONE ?? "+447700900123";
  const apiBase =
    opts.apiBase ?? process.env.MA1_SPIKE_API_BASE ?? "http://localhost:3000";

  const normalised = email.toLowerCase().trim();

  // ── Step 1: Create the Better-auth user via the sign-up endpoint (D-08) ──
  //
  // Do NOT insert into the `user` table directly — go through the endpoint so
  // password hashing, session wiring, and the bearer() plugin are all correct.
  let userAlreadyExisted = false;
  const signUpUrl = `${apiBase}/_agent-native/auth/ba/sign-up/email`;

  console.log(`\n[1/2] Creating Better-auth user via sign-up endpoint...`);
  console.log(`      POST ${signUpUrl}`);
  console.log(`      email: ${normalised}`);

  // Better-auth enforces an Origin check on cookie-setting endpoints (sign-up /
  // sign-in). A request with no Origin header is rejected 403
  // MISSING_OR_NULL_ORIGIN. Send the app's own origin (a trusted origin by
  // default = baseURL) so the call is accepted. The native client must do the
  // same (see packages/mobile-app/lib/sign-in-api.ts).
  const signUpRes = await fetch(signUpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: apiBase,
    },
    body: JSON.stringify({ email: normalised, password, name: "Spike Tester" }),
  });

  if (signUpRes.ok || signUpRes.status === 200) {
    console.log(`      → User created (HTTP ${signUpRes.status})`);
  } else if (signUpRes.status === 409 || signUpRes.status === 422) {
    // 409 Conflict or 422 Unprocessable Entity both mean "user already exists"
    userAlreadyExisted = true;
    console.log(
      `      → User already exists (HTTP ${signUpRes.status}) — treating as success`,
    );
  } else {
    // Any other non-2xx is a real failure
    let body = "";
    try {
      body = await signUpRes.text();
    } catch {}
    throw new Error(
      `Better-auth sign-up failed with HTTP ${signUpRes.status}: ${body}`,
    );
  }

  // ── Step 2: Upsert the gym_members spike row ──
  //
  // SELECT first — if the row exists, LEAVE IT (do NOT overwrite userId).
  // Only INSERT when absent. userId is always NULL on INSERT (claim does that).
  //
  // guard:allow-unscoped — single-tenant gym tables
  const db = getDb();

  console.log(`\n[2/2] Checking gym_members for email: ${normalised}...`);

  const existingRow = await db
    .select()
    .from(schema.gymMembers)
    .where(eq(schema.gymMembers.email, normalised))
    .limit(1)
    .then((r: (typeof schema.gymMembers.$inferSelect)[]) => r[0] ?? null);

  let memberAlreadyExisted = false;
  let memberId: string;
  let memberUserId: string | null;

  if (existingRow) {
    memberAlreadyExisted = true;
    memberId = existingRow.id;
    memberUserId = existingRow.userId;
    console.log(`      → Row already exists — leaving untouched`);
    console.log(`        id:      ${memberId}`);
    console.log(
      `        userId:  ${memberUserId ?? "(null — ready to claim)"}`,
    );
  } else {
    // Insert an unclaimed row — userId IS NULL so the claim can link it
    const newId = `mbr_spike_ma1_001`;
    const newRow = {
      id: newId,
      userId: null,
      firstName: "Spike",
      lastName: "Tester",
      email: normalised,
      phoneE164,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db
      .insert(schema.gymMembers)
      .values(newRow)
      .onConflictDoNothing({ target: schema.gymMembers.id });

    memberId = newId;
    memberUserId = null;
    console.log(`      → Inserted unclaimed row`);
    console.log(`        id:      ${memberId}`);
    console.log(`        userId:  (null — ready to claim)`);
  }

  return {
    email: normalised,
    memberId,
    memberUserId,
    userAlreadyExisted,
    memberAlreadyExisted,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point — called when run with tsx / pnpm db:seed-ma1-test-account
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("─".repeat(70));
  console.log("MA1 spike test-account seed");
  console.log("─".repeat(70));

  const result = await seedMa1TestAccount();

  console.log("\n─".repeat(35));
  console.log("\nSeed complete. Use these values for the device spike:");
  console.log(`  email:      ${result.email}`);
  console.log(
    `  password:   ${process.env.MA1_SPIKE_PASSWORD ?? "spike-test-pw-CHANGEME"}`,
  );
  console.log(`  memberId:   ${result.memberId}`);
  console.log(
    `  userId:     ${result.memberUserId ?? "(null — claim will link this)"}`,
  );
  console.log(
    "\nRe-run safely — seed is idempotent (leaves existing rows untouched).",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
