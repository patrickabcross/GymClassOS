/**
 * One-off backfill: materialise outbound mirror messages stranded in webhook_events.
 *
 * Background
 * ----------
 * Before the quick-260611-rrh fix, the edge-webhooks receiver stored EVERY
 * inbound Meta webhook under eventType='messages.inbound', including MYÜTIK
 * outbound mirrors (where msg.from === metadata.phone_number_id). The worker
 * then called upsertConversationAndMessage, which matched the member by
 * msg.from (the BUSINESS number — no gym_members row owns it) and returned
 * reason='unknown_phone', marking the job processed. Result: outbound mirrors
 * in webhook_events.payload_raw were never written to the messages table.
 *
 * This script re-walks webhook_events and backfills the missing rows by calling
 * the same materialiseOutboundMirror that the fixed worker now uses.
 *
 * Unread-count recomputation rationale
 * -------------------------------------
 * The schema has no per-message "read at" marker per conversation — only a
 * coarse unread_count integer and last_outbound_at. We recompute unread_count
 * as: count of direction='in' messages newer than the conversation's
 * last_outbound_at. This is the most defensible correction given the schema:
 * an agent reply implies the coach saw everything up to that reply; only inbound
 * messages arriving AFTER the latest outbound are genuinely unread.
 *
 * Usage
 * -----
 * Dry-run (default — no DB writes):
 *   pnpm --filter @gymos/worker db:backfill-outbound
 *   # or directly:
 *   pnpm --filter @gymos/worker exec tsx scripts/backfill-outbound-mirrors.ts
 *
 * Commit mode (writes to Neon):
 *   pnpm --filter @gymos/worker exec tsx scripts/backfill-outbound-mirrors.ts --commit
 *
 * Idempotency
 * -----------
 * Re-running --commit is a documented no-op:
 *   1. The SELECT-1 pre-check skips wamids already present in the messages table.
 *   2. materialiseOutboundMirror uses onConflictDoNothing on the partial unique
 *      index (messages.external_id WHERE NOT NULL) as a second layer of safety.
 *
 * Deployment notes (for the user — executor does NOT deploy)
 * ----------------------------------------------------------
 * Per project memory, gymos scripts/migrations are applied manually against
 * gymos-demo Neon. Run dry-run first, review the report, then re-run with
 * --commit.
 *
 * The fixed receiver (quick-260611-rrh) + worker must be deployed (flyctl deploy
 * from services/edge-webhooks and services/worker) BEFORE running --commit so
 * that any new outbound mirrors land correctly going forward.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { eq, and, sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ is ONE level under services/worker
const SERVICE_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(SERVICE_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(SERVICE_ROOT, ".env"), quiet: true });

// ─────────────────────────────────────────────────────────────────────────────
// CLI arg parsing — BEFORE any DB access
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const commitMode = args.includes("--commit");

console.log(
  `\n=== backfill-outbound-mirrors [${commitMode ? "--commit" : "DRY-RUN"}] ===\n`,
);
if (!commitMode) {
  console.log(
    "Running in DRY-RUN mode. Pass --commit to write to the database.\n",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DB + domain — lazy import AFTER env is loaded
// ─────────────────────────────────────────────────────────────────────────────

const { getDb, schema } = await import("../src/lib/db.js");
const { materialiseOutboundMirror } =
  await import("../src/domain/conversations.js");

const db = getDb();

// ─────────────────────────────────────────────────────────────────────────────
// 1. Load all whatsapp webhook_events stored as 'messages.inbound'
//    (the old receiver stored outbound mirrors under this eventType too)
// ─────────────────────────────────────────────────────────────────────────────

// guard:allow-unscoped — backfill script
const events = await db
  .select()
  .from(schema.webhookEvents)
  .where(
    and(
      eq(schema.webhookEvents.provider, "whatsapp"),
      eq(schema.webhookEvents.eventType, "messages.inbound"),
    ),
  );

console.log(`Loaded ${events.length} whatsapp/messages.inbound webhook_events`);

// ─────────────────────────────────────────────────────────────────────────────
// 2. Walk entries, detect outbound mirrors
// ─────────────────────────────────────────────────────────────────────────────

type OutboundCandidate = {
  eventId: string;
  wamid: string;
  customerWaId: string;
  messageType: string;
  body: string | undefined;
  timestamp: string | undefined;
  payloadRaw: string;
};

const candidates: OutboundCandidate[] = [];

for (const event of events) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.payloadRaw);
  } catch {
    // Malformed payload — skip
    continue;
  }

  const entries =
    (parsed as { entry?: unknown[] })?.entry ??
    // Some payloads are the value object directly (edge case)
    [];

  for (const entry of entries as Array<{ changes?: unknown[] }>) {
    const changes = entry?.changes ?? [];
    for (const change of changes as Array<{ value?: unknown }>) {
      const value = (change?.value ?? {}) as {
        messages?: Array<{
          id: string;
          from: string;
          type?: string;
          text?: { body?: string };
          timestamp?: string;
        }>;
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string }>;
      };

      const phoneNumberId = String(value.metadata?.phone_number_id ?? "");
      const customerWaId =
        value.contacts?.[0]?.wa_id != null
          ? String(value.contacts[0].wa_id)
          : undefined;

      for (const msg of value.messages ?? []) {
        if (phoneNumberId && String(msg.from) === phoneNumberId) {
          // This is an outbound mirror
          if (!customerWaId) {
            console.warn(
              `  [SKIP] wamid=${msg.id} — outbound mirror but missing contacts[0].wa_id`,
            );
            continue;
          }
          candidates.push({
            eventId: event.id,
            wamid: msg.id,
            customerWaId,
            messageType: msg.type ?? "text",
            body: msg.text?.body,
            timestamp: msg.timestamp,
            payloadRaw: event.payloadRaw,
          });
        }
      }
    }
  }
}

console.log(`\nOutbound mirror candidates found: ${candidates.length}`);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pre-check: skip wamids already present in messages table
// ─────────────────────────────────────────────────────────────────────────────

const alreadyPresent: string[] = [];
const toMaterialise: OutboundCandidate[] = [];

for (const c of candidates) {
  // guard:allow-unscoped — backfill script
  const existing = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.externalId, c.wamid))
    .limit(1)
    .then((r: any) => r[0] ?? null);

  if (existing) {
    alreadyPresent.push(c.wamid);
  } else {
    toMaterialise.push(c);
  }
}

console.log(`Already present (skip): ${alreadyPresent.length}`);
console.log(`To materialise:         ${toMaterialise.length}`);

if (toMaterialise.length > 0) {
  console.log("\nCandidates to materialise:");
  // Group by customerWaId for the report
  const grouped = new Map<string, { wamids: string[]; dates: string[] }>();
  for (const c of toMaterialise) {
    const key = c.customerWaId;
    if (!grouped.has(key)) grouped.set(key, { wamids: [], dates: [] });
    const g = grouped.get(key)!;
    g.wamids.push(c.wamid);
    if (c.timestamp) {
      const d = new Date(parseInt(c.timestamp, 10) * 1000);
      g.dates.push(d.toISOString().slice(0, 10));
    }
  }
  for (const [waId, g] of grouped) {
    console.log(
      `  customerWaId=${waId} — ${g.wamids.length} message(s) on ${[...new Set(g.dates)].join(", ") || "unknown date"}`,
    );
  }
}

if (!commitMode) {
  console.log(
    "\n[DRY-RUN] No changes written. Re-run with --commit to apply.\n",
  );
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. --commit: materialise + correct timestamps + fix unread
// ─────────────────────────────────────────────────────────────────────────────

let materialised = 0;
let skippedDupe = 0;
let skippedUnknown = 0;
const touchedConversationMemberIds = new Set<string>();

for (const c of toMaterialise) {
  const result = await materialiseOutboundMirror(
    db,
    {
      externalId: c.wamid,
      customerWaId: c.customerWaId,
      messageType: c.messageType,
      body: c.body,
      timestamp: c.timestamp,
    },
    c.payloadRaw,
  );

  if (result.processed) {
    materialised++;
    touchedConversationMemberIds.add(c.customerWaId);

    // Correct the inserted message's created_at + sent_at to the historical
    // send time so per-message history reflects the actual timestamp.
    // materialiseOutboundMirror stamps lastOutboundAt=now() on the conversation
    // (coarse last-* marker); the per-message timestamps should be accurate.
    if (c.timestamp) {
      const tsSeconds = parseInt(c.timestamp, 10);
      if (!Number.isNaN(tsSeconds)) {
        // guard:allow-unscoped — backfill script
        await db.execute(
          sql`UPDATE messages
              SET created_at = to_timestamp(${tsSeconds})::text,
                  sent_at    = to_timestamp(${tsSeconds})::text
              WHERE external_id = ${c.wamid}`,
        );
      }
    }
  } else if (result.reason === "duplicate_wamid") {
    skippedDupe++;
  } else if (result.reason === "unknown_phone") {
    skippedUnknown++;
    console.warn(
      `  [WARN] wamid=${c.wamid} customerWaId=${c.customerWaId} — no gym_members row (unknown_phone)`,
    );
  }
}

console.log(`\nMaterialised: ${materialised}`);
console.log(`Duplicate (skipped): ${skippedDupe}`);
console.log(`Unknown phone (skipped): ${skippedUnknown}`);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Recompute lastOutboundAt + correct inflated unread_count for touched convs
// ─────────────────────────────────────────────────────────────────────────────

// Gather conversation ids for the touched members
// guard:allow-unscoped — backfill script
const touchedConvs =
  touchedConversationMemberIds.size > 0
    ? await db.execute(
        sql`SELECT c.id, c.unread_count AS old_unread
            FROM conversations c
            JOIN gym_members m ON m.id = c.member_id
            WHERE m.phone_e164 = ANY(${[...touchedConversationMemberIds].map((id) => `+${id}`)})
              AND c.channel = 'whatsapp'`,
      )
    : { rows: [] };

const unreadCorrections: Array<{
  convId: string;
  oldUnread: number;
  newUnread: number;
}> = [];

for (const row of (touchedConvs as any).rows ?? []) {
  const convId = row.id as string;
  const oldUnread = row.old_unread as number;

  // Recompute lastOutboundAt from MAX(messages.created_at) WHERE direction='out'
  // guard:allow-unscoped — backfill script
  await db.execute(
    sql`UPDATE conversations c
        SET last_outbound_at = (
              SELECT MAX(m.created_at)
              FROM messages m
              WHERE m.conversation_id = c.id
                AND m.direction = 'out'
            ),
            updated_at = NOW()::text
        WHERE c.id = ${convId}`,
  );

  // Recompute unread_count = count of direction='in' messages newer than
  // last_outbound_at. A coach reply implies they saw everything up to that
  // point; only messages arriving AFTER the latest outbound are unread.
  // guard:allow-unscoped — backfill script
  const newUnreadResult = await db.execute(
    sql`SELECT COUNT(*)::int AS new_unread
        FROM messages m
        WHERE m.conversation_id = ${convId}
          AND m.direction = 'in'
          AND m.created_at > (
            SELECT COALESCE(MAX(m2.created_at), '1970-01-01')
            FROM messages m2
            WHERE m2.conversation_id = ${convId}
              AND m2.direction = 'out'
          )`,
  );
  const newUnread = (newUnreadResult as any).rows?.[0]?.new_unread ?? oldUnread;

  // guard:allow-unscoped — backfill script
  await db.execute(
    sql`UPDATE conversations
        SET unread_count = ${newUnread}
        WHERE id = ${convId}`,
  );

  unreadCorrections.push({ convId, oldUnread, newUnread });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Final summary
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=== FINAL SUMMARY ===");
console.log(
  `Outbound mirror candidates found in webhook_events: ${candidates.length}`,
);
console.log(
  `Already present in messages table (skipped):      ${alreadyPresent.length}`,
);
console.log(
  `Newly materialised:                                ${materialised}`,
);
console.log(
  `Duplicate wamid (onConflictDoNothing path):        ${skippedDupe}`,
);
console.log(
  `Unknown phone (no gym_members row):                ${skippedUnknown}`,
);
console.log(
  `Conversations touched + unread recalculated:       ${unreadCorrections.length}`,
);

if (unreadCorrections.length > 0) {
  console.log("\nUnread count corrections:");
  for (const { convId, oldUnread, newUnread } of unreadCorrections) {
    console.log(`  convId=${convId}: ${oldUnread} → ${newUnread}`);
  }
}

console.log("\nDone.\n");
process.exit(0);
