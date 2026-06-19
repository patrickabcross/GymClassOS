/**
 * services/worker/src/queues/daily-owner-digest.ts
 *
 * BD4-02 / GOD-01: Daily gym-owner WhatsApp digest of studio metrics.
 *
 * Mirrors telemetry-push.ts exactly (consumer-first, then idempotent boss.schedule).
 *
 * What it does:
 *   1. Reads studio_owner_config singleton; skips if missing, digest_enabled===0,
 *      or owner_phone_e164 is empty (unconfigured-skip — worker still boots cleanly).
 *   2. Reads studio_telemetry_state singleton; skips if missing.
 *   3. Builds numeric metrics via buildTelemetrySnapshot() — reuses the existing
 *      telemetry aggregate (no new metric pipeline). NO LLM in BD4 (Open Question 1
 *      resolution: structured numeric digest only; LLM narrative is a future phase).
 *   4. Resolves the owner's gym_members row via phone_e164 lookup.
 *      If no matching member row → unconfigured-skip with log.warn.
 *      The provisioner must seed a gym_members row for the owner (one-time setup).
 *   5. Finds or creates the owner's conversations row (channel='whatsapp').
 *   6. Pre-inserts messages row (status='queued') — required before enqueue (Pitfall 2).
 *   7. Enqueues via @gymos/queue producer → outbound-whatsapp → the chokepoint.
 *
 * Template: 'owner_daily_digest' — pending Meta approval (D-15).
 * All live sends deferred-on-external-dependency: template gate rejects until
 * whatsapp_templates has status='approved' for this name.
 *
 * NO member PII in vars — numeric aggregates only (GOD-01 compliance).
 * This file MUST NOT import or modify the chokepoint or any gate module.
 *
 * Schedule: 06:00 daily in the studio's IANA timezone (distinct from telemetry-push
 * at 02:00 UTC and heartbeat at 09:xx studio-tz).
 */

import type { PgBoss } from "pg-boss";
import { eq, sql, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../lib/db.js";
import { getEnv } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { buildTelemetrySnapshot } from "../domain/buildTelemetrySnapshot.js";
import { enqueueOutboundWhatsApp } from "@gymos/queue";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIGEST_QUEUE = "daily-owner-digest";

/** WhatsApp template name for owner digest — pending Meta approval (D-15). */
const DIGEST_TEMPLATE = "owner_daily_digest";

// ---------------------------------------------------------------------------
// Pure exported helper — testable without DB or pg-boss
// ---------------------------------------------------------------------------

/**
 * Assemble WhatsApp template variable map from telemetry snapshot numbers.
 * Numeric-only — NO member names, emails, phones, or any PII in vars (GOD-01).
 * Safe defaults (0 / "0%") prevent NaN/undefined reaching the template.
 */
export function buildDigestVars(snap: {
  activeMembers?: number;
  bookings?: number;
  retentionRate?: number;
}): Record<string, string> {
  return {
    "1": String(snap.activeMembers ?? 0),
    "2": String(snap.bookings ?? 0),
    "3": `${Math.round((snap.retentionRate ?? 0) * 100)}%`,
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the daily owner digest job with pg-boss.
 *
 * Call order mirrors telemetry-push.ts:
 *   1. boss.work() — register consumer FIRST so the schedule has a destination.
 *   2. boss.schedule() — register 06:00 studio-tz cron (idempotent).
 */
export async function registerDailyOwnerDigest(boss: PgBoss): Promise<void> {
  const log = getLogger();

  // ── Register consumer FIRST ──────────────────────────────────────────────
  await boss.work(DIGEST_QUEUE, async () => {
    const env = getEnv();
    const db = getDb();

    // ── 1. Read studio_owner_config singleton ─────────────────────────────
    const [ownerConfig] = await db
      .select()
      .from(schema.studioOwnerConfig)
      .where(eq(schema.studioOwnerConfig.id, "singleton"));

    if (!ownerConfig) {
      log.warn(
        "[daily-owner-digest] studio_owner_config singleton not found; " +
          "skipping. Seed the row via Neon console (see BD4-RESEARCH Section 4).",
      );
      return;
    }

    if (ownerConfig.digestEnabled === 0) {
      log.info("[daily-owner-digest] digest_enabled=0; skipping.");
      return;
    }

    if (!ownerConfig.ownerPhoneE164) {
      log.warn(
        "[daily-owner-digest] owner_phone_e164 is empty in studio_owner_config; " +
          "skipping. Set via provisioning or Neon console.",
      );
      return;
    }

    // ── 2. Read studio_telemetry_state singleton ──────────────────────────
    const [state] = await db
      .select()
      .from(schema.studioTelemetryState)
      .where(eq(schema.studioTelemetryState.id, "singleton"));

    if (!state) {
      log.warn(
        "[daily-owner-digest] studio_telemetry_state singleton not found; " +
          "skipping. Ensure BD2-03 migration has been applied.",
      );
      return;
    }

    // ── 3. Build aggregate metrics (numeric-only, no LLM in BD4) ─────────
    const studioId = env.STUDIO_ID ?? "studio";
    const snap = await buildTelemetrySnapshot(db, studioId, state);

    // ── 4. Resolve owner gym_members row by phone_e164 ────────────────────
    // The digest must send to a gym_members row because the chokepoint
    // (outbound-whatsapp → messages) requires a valid memberId.
    // The provisioner seeds this row; if absent, unconfigured-skip.
    const ownerMemberRows = await db
      .select({ id: schema.gymMembers.id })
      .from(schema.gymMembers)
      .where(eq(schema.gymMembers.phoneE164, ownerConfig.ownerPhoneE164))
      .limit(1);

    const ownerMemberId = ownerMemberRows[0]?.id;
    if (!ownerMemberId) {
      log.warn(
        {
          ownerPhoneE164: ownerConfig.ownerPhoneE164.slice(0, 5) + "***", // partial for safety
        },
        "[daily-owner-digest] no gym_members row found for owner_phone_e164; " +
          "skipping. The provisioner or admin must create a gym_members row for the owner " +
          "(one-time setup step — see BD4-RESEARCH Open Question 2).",
      );
      return;
    }

    // ── 5. Find or create the owner's conversations row ───────────────────
    const existingConvs = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.memberId, ownerMemberId),
          eq(schema.conversations.channel, "whatsapp"),
        ),
      )
      .limit(1);

    let conversationId: string;
    if (existingConvs[0]) {
      conversationId = existingConvs[0].id;
    } else {
      conversationId = `conv_${nanoid()}`;
      await db.execute(sql`
        INSERT INTO conversations (id, member_id, channel, status, unread_count, created_at, updated_at)
        VALUES (${conversationId}, ${ownerMemberId}, 'whatsapp', 'closed', 0, now(), now())
      `);
    }

    // ── 6. Pre-insert messages row (Pitfall 2 — MUST exist before enqueue) ─
    const messageId = `msg_${nanoid()}`;
    await db.execute(sql`
      INSERT INTO messages (id, conversation_id, direction, message_type, status, agent_initiated, created_at)
      VALUES (${messageId}, ${conversationId}, 'out', 'template', 'queued', true, now())
    `);

    // ── 7. Build numeric vars and enqueue digest ──────────────────────────
    const vars = buildDigestVars(snap);

    log.info(
      { studioId, ownerMemberId: ownerMemberId.slice(0, 8) + "***", vars },
      "[daily-owner-digest] enqueueing owner digest",
    );

    await enqueueOutboundWhatsApp({
      messageId,
      memberId: ownerMemberId,
      payload: {
        type: "template",
        name: DIGEST_TEMPLATE,
        vars,
      },
    });

    log.info(
      { messageId, studioId },
      "[daily-owner-digest] owner digest enqueued",
    );
  });

  // ── Schedule: 06:00 daily in studio timezone (idempotent) ───────────────
  const tz = getEnv().STUDIO_TIMEZONE ?? "Europe/London";
  await boss.schedule(DIGEST_QUEUE, "0 6 * * *", {}, { tz: tz } as any);

  log.info(
    { queue: DIGEST_QUEUE, cron: "0 6 * * *", tz },
    "[daily-owner-digest] daily digest scheduled",
  );
}
