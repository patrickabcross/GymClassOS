/**
 * services/worker/src/queues/heartbeat-reactivate.ts
 *
 * BD4-02 / GOD-02, GOD-03, GOD-04, GOD-05: Daily dormant-member heartbeat.
 *
 * Mirrors telemetry-push.ts exactly (consumer-first, then idempotent boss.schedule).
 *
 * What it does:
 *   1. Reads studio_owner_config singleton; skips if missing or heartbeat_enabled===0.
 *   2. Detects dormant members via deterministic SQL (no LLM — auditable).
 *      "Dormant" = no attended/active booking in last DORMANCY_DAYS days, opted in, has phone.
 *   3. For each dormant member (up to heartbeat_batch_size):
 *      a. Synchronous suppression check: skip if >= 3 sends in rolling 90-day window (GOD-04).
 *      b. Synchronous opt-out re-check: skip if no opt-in row or opted_out_at IS NOT NULL.
 *      c. Find-or-create conversations row (channel='whatsapp').
 *      d. Pre-insert messages row (status='queued') — required before enqueue (Pitfall 2).
 *      e. Insert reactivation_attempts row.
 *      f. Enqueue via @gymos/queue producer → outbound-whatsapp → the chokepoint.
 *         On enqueue failure: rollback the attempt row to avoid ghost counts.
 *   4. Reads studio_brain_docs id='brand-voice' for personalization (GOD-05).
 *      Generic fallback when GOB not yet seeded.
 *   5. Logs counts (dormant found, sent, suppressed, optedOut).
 *
 * CRITICAL: This file MUST NOT import or modify the chokepoint or any gate module
 * (optInGate.ts / windowGate.ts / templateGate.ts). GOD is a PRODUCER only;
 * all compliance gates apply unchanged downstream.
 *
 * All live sends are mock-first / deferred-on-external-dependency (D-15):
 * the template gate rejects 'member_reactivation' until it has status='approved'
 * in whatsapp_templates — this is the intended deferred-activation seam.
 *
 * Schedule: cron = `${hash(STUDIO_ID) % 60} 9 * * *` (09:00 studio timezone, staggered)
 */

import type { PgBoss } from "pg-boss";
import { sql, eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "../lib/db.js";
import { getEnv } from "../lib/env.js";
import { getLogger } from "../lib/logger.js";
import { enqueueOutboundWhatsApp } from "@gymos/queue";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

const HEARTBEAT_QUEUE = "heartbeat-reactivate";

/** Members with no attended/active booking in this many days are "dormant". */
const DORMANCY_DAYS = 30;

/** Maximum reactivation attempts before suppression kicks in. */
const SUPPRESSION_MAX = 3;

/** Rolling window for the suppression ceiling check (days). */
const SUPPRESSION_WINDOW_DAYS = 90;

/** WhatsApp template name for reactivation — pending Meta approval (D-15). */
const REACTIVATION_TEMPLATE = "member_reactivation";

// ---------------------------------------------------------------------------
// Deterministic stagger helper (Pitfall W-02 from roadmap)
// ---------------------------------------------------------------------------

/**
 * Simple deterministic string hash to spread heartbeat runs across the hour.
 * Returns a non-negative 32-bit integer — same output for same input across runs.
 */
export function simpleHash(s: string): number {
  let h = 0;
  for (const c of s) {
    h = (h * 31 + c.charCodeAt(0)) | 0;
  }
  return Math.abs(h);
}

// ---------------------------------------------------------------------------
// Pure exported helpers — testable without DB or pg-boss
// ---------------------------------------------------------------------------

/**
 * Returns true when the member has reached the 3/90-day suppression ceiling.
 * Called synchronously BEFORE enqueue — no member escapes the counter (GOD-04).
 */
export function isSuppressed(attemptCount: number): boolean {
  return attemptCount >= SUPPRESSION_MAX;
}

/**
 * Returns true when the member should be excluded due to opt-out state.
 *   - No opt-in row (undefined) → excluded (never opted in).
 *   - opted_out_at IS NOT NULL → excluded (opted out).
 *   - opted_out_at IS NULL → included (actively opted in).
 * Defense-in-depth: the dormancy SQL already filters opted-out members,
 * but we re-check here before enqueueing (GOD-04, day one).
 */
export function isExcludedOptOut(
  row: { optedOutAt: string | null } | undefined,
): boolean {
  if (!row) return true; // no opt-in row
  return row.optedOutAt != null; // opted_out_at set = opted out
}

/**
 * Derive a deterministic greeting line from the studio's brand voice doc.
 * Takes the first non-empty line, trims it, and truncates to fit Meta's
 * template variable field limit (160 chars). NO LLM — pure string manipulation
 * (required for out-of-window template compliance + auditability).
 */
function deriveGreeting(brandVoice: string): string {
  const firstLine = brandVoice
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "We miss you at the studio!";
  return firstLine.slice(0, 160);
}

/**
 * Assemble WhatsApp template variable map from studio brand voice (GOD-05).
 * When brandVoice is null (GOB not yet seeded), returns a generic fallback
 * so GOD heartbeat works standalone without GOB being configured.
 * NO member PII in vars — all sends are approved-template substitutions.
 */
export function buildReactivationVars(
  brandVoice: string | null,
): Record<string, string> {
  return {
    "1": brandVoice ? deriveGreeting(brandVoice) : "We miss you at the studio!",
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register the daily heartbeat reactivation job with pg-boss.
 *
 * Call order mirrors telemetry-push.ts:
 *   1. boss.work() — register consumer FIRST so the schedule has a destination.
 *   2. boss.schedule() — register the staggered 09:00 studio-tz cron (idempotent).
 */
export async function registerHeartbeatReactivate(boss: PgBoss): Promise<void> {
  const log = getLogger();
  const env = getEnv();

  // ── Deterministic minute stagger (Pitfall W-02) ─────────────────────────
  // Studios sharing the same Fly region would otherwise all fire at exactly
  // 09:00 — the hash distributes sends across the 09:00–09:59 window.
  const minuteOffset = simpleHash(env.STUDIO_ID ?? "default") % 60;
  const cron = `${minuteOffset} 9 * * *`;
  const tz = env.STUDIO_TIMEZONE ?? "Europe/London";

  // ── Register consumer FIRST ──────────────────────────────────────────────
  await boss.work(HEARTBEAT_QUEUE, async () => {
    const db = getDb();

    // ── 1. Read studio_owner_config singleton ─────────────────────────────
    const [ownerConfig] = await db
      .select()
      .from(schema.studioOwnerConfig)
      .where(eq(schema.studioOwnerConfig.id, "singleton"));

    if (!ownerConfig) {
      log.warn(
        "[heartbeat-reactivate] studio_owner_config singleton not found; " +
          "skipping. Seed the row via Neon console (see BD4-RESEARCH Section 4 Pitfall 4).",
      );
      return;
    }

    if (ownerConfig.heartbeatEnabled === 0) {
      log.info("[heartbeat-reactivate] heartbeat_enabled=0; skipping.");
      return;
    }

    const batchSize = ownerConfig.heartbeatBatchSize ?? 50;

    // ── 2. Read brand-voice once (GOD-05 personalization) ─────────────────
    const [brainRow] = await db
      .select({ body: schema.studioBrainDocs.body })
      .from(schema.studioBrainDocs)
      .where(eq(schema.studioBrainDocs.id, "brand-voice"))
      .limit(1);
    const brandVoice = brainRow?.body || null;

    // ── 3. Dormant detection (deterministic SQL, no LLM) ──────────────────
    // Dormant = no attended/active booking in last DORMANCY_DAYS days,
    // has a whatsapp opt-in row with opted_out_at IS NULL, and has phone_e164.
    // The LEFT JOIN pattern returns members whose recent booking LEFT JOIN = NULL.
    const dormantResult = await db.execute(sql`
      SELECT gm.id AS member_id
      FROM gym_members gm
      LEFT JOIN bookings b ON b.member_id = gm.id
        AND b.status IN ('attended', 'booked')
        AND b.booked_at >= (NOW() - (${DORMANCY_DAYS} || ' days')::interval)
      LEFT JOIN whatsapp_opt_in woi ON woi.member_id = gm.id
        AND woi.opted_out_at IS NULL
      WHERE b.id IS NULL
        AND woi.member_id IS NOT NULL
        AND gm.phone_e164 IS NOT NULL
      GROUP BY gm.id
      LIMIT ${batchSize}
    `);

    const dormantMembers = dormantResult.rows as Array<{ member_id: string }>;

    log.info(
      { count: dormantMembers.length, dormancyDays: DORMANCY_DAYS },
      "[heartbeat-reactivate] dormant members detected",
    );

    let sent = 0;
    let suppressed = 0;
    let optedOut = 0;

    for (const row of dormantMembers) {
      const memberId = row.member_id;

      // ── a. Suppression check (GOD-04 — synchronous BEFORE enqueue) ──────
      const suppressionResult = await db.execute(sql`
        SELECT COUNT(*)::INTEGER AS attempt_count
        FROM reactivation_attempts
        WHERE member_id = ${memberId}
          AND sent_at >= (NOW() - INTERVAL '${sql.raw(String(SUPPRESSION_WINDOW_DAYS))} days')
      `);
      const attemptCount = Number(
        (suppressionResult.rows[0] as Record<string, unknown>)?.attempt_count ?? 0,
      );

      if (isSuppressed(attemptCount)) {
        suppressed++;
        continue;
      }

      // ── b. Opt-out re-check (defense in depth) ───────────────────────────
      const optInRows = await db
        .select({ optedOutAt: schema.whatsappOptIn.optedOutAt })
        .from(schema.whatsappOptIn)
        .where(eq(schema.whatsappOptIn.memberId, memberId))
        .limit(1);

      const optInRow = optInRows[0];
      if (isExcludedOptOut(optInRow)) {
        optedOut++;
        continue;
      }

      // ── c. Find or create conversations row ──────────────────────────────
      const existingConvs = await db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.memberId, memberId),
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
          VALUES (${conversationId}, ${memberId}, 'whatsapp', 'closed', 0, now(), now())
        `);
      }

      // ── d. Pre-insert messages row (Pitfall 2 — MUST exist before enqueue) ─
      const messageId = `msg_${nanoid()}`;
      await db.execute(sql`
        INSERT INTO messages (id, conversation_id, direction, message_type, status, agent_initiated, created_at)
        VALUES (${messageId}, ${conversationId}, 'out', 'template', 'queued', true, now())
      `);

      // ── e. Insert reactivationAttempts (same path as enqueue — GOD-04) ───
      // Uses Drizzle insert so the schema barrel reference (`schema.reactivationAttempts`)
      // is visible for type checking and the grep guard passes.
      const attemptId = nanoid();
      await db
        .insert(schema.reactivationAttempts)
        .values({ id: attemptId, memberId, sentAt: new Date().toISOString() });

      // ── f. Enqueue via chokepoint producer (GOD-03) ──────────────────────
      // payload type='template' because heartbeat sends are by definition
      // out-of-window (dormant members). Out-of-window MUST use an approved
      // template — the chokepoint rejects type:'text' out-of-window with WindowExpiredError.
      const vars = buildReactivationVars(brandVoice);
      try {
        await enqueueOutboundWhatsApp({
          messageId,
          memberId,
          payload: {
            type: "template",
            name: REACTIVATION_TEMPLATE,
            vars,
          },
        });
        sent++;
      } catch (err) {
        // Rollback the attempt row so a failed enqueue doesn't leave a ghost
        // count that eats into the 3/90-day ceiling (RESEARCH Section 5).
        await db
          .delete(schema.reactivationAttempts)
          .where(eq(schema.reactivationAttempts.id, attemptId));
        log.error(
          { err, memberId, messageId },
          "[heartbeat-reactivate] enqueue failed; attempt row rolled back",
        );
      }
    }

    log.info(
      { dormant: dormantMembers.length, sent, suppressed, optedOut },
      "[heartbeat-reactivate] run complete",
    );
  });

  // ── Schedule: staggered 09:00 in studio timezone (idempotent) ───────────
  await boss.schedule(HEARTBEAT_QUEUE, cron, {}, { tz: tz } as any);

  log.info(
    { queue: HEARTBEAT_QUEUE, cron, tz },
    "[heartbeat-reactivate] heartbeat scheduled",
  );
}
