/**
 * MPV Phase 2: nightly materialiser — fills class_occurrences from class_schedule_rules.
 *
 * Follows the housekeeping.ts pattern:
 *   1. boss.work(QUEUE, handler) — register consumer FIRST
 *   2. boss.schedule(QUEUE, cron, data, {tz}) — register schedule second
 *
 * On each run:
 *   - Reads all active class_schedule_rules (active = 1)
 *   - For each rule: generates occurrences for the next WINDOW_DAYS using
 *     generateOccurrences() (DST-correct, pure function)
 *   - Fetches the rule's class_definition for duration_min → computes endsAt
 *   - Inserts occurrences via ON CONFLICT DO NOTHING (idempotent — backed
 *     by the partial unique index on (rule_id, starts_at) WHERE rule_id IS NOT NULL)
 *   - Advances generated_through on the rule to the last generated date
 *
 * Runs daily at 04:00 UTC (safe for all EU timezones — well before any
 * studio opens, and after BST/GMT offset only affects the "clock change" day).
 */
import type { PgBoss } from "pg-boss";
import { nanoid } from "nanoid";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import {
  generateOccurrences,
  type ScheduleRule,
} from "../domain/recurrence-generator.js";

const QUEUE = "class-materialize";
/** Rolling materialisation window: 8 weeks (56 days) from today. */
const WINDOW_DAYS = 56;

/**
 * Compute the window end date ("YYYY-MM-DD") from today + WINDOW_DAYS.
 * Uses UTC date arithmetic to avoid DST interference.
 */
function windowEndDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Add durationMin minutes to an ISO UTC timestamp and return the result.
 */
function addMinutes(isoUtc: string, durationMin: number): string {
  const ms = new Date(isoUtc).getTime() + durationMin * 60_000;
  return new Date(ms).toISOString();
}

/**
 * Register the consumer and cron schedule for the class occurrence materialiser.
 * Call this from index.ts main() before the admin server starts.
 */
export async function registerMaterializeClassOccurrences(
  boss: PgBoss,
): Promise<void> {
  const log = getLogger();

  // 1. Register consumer FIRST so the schedule tick has a claim destination.
  await boss.work(QUEUE, async () => {
    const db = getDb();
    const schema = (await import("../lib/db.js")).schema;

    // Fetch all active rules.
    const rules = await db
      .select()
      .from(schema.classScheduleRules)
      .where(eq(schema.classScheduleRules.active, 1));

    if (rules.length === 0) {
      log.info("[class-materialize] no active rules — nothing to do");
      return;
    }

    const endDate = windowEndDate();
    log.info(
      { ruleCount: rules.length, windowEnd: endDate },
      "[class-materialize] starting run",
    );

    let totalInserted = 0;
    let totalSkipped = 0;
    let rulesProcessed = 0;

    for (const rule of rules) {
      try {
        // Fetch the class definition for durationMin.
        const [def] = await db
          .select({
            id: schema.classDefinitions.id,
            durationMin: schema.classDefinitions.durationMin,
            active: schema.classDefinitions.active,
          })
          .from(schema.classDefinitions)
          .where(eq(schema.classDefinitions.id, rule.definitionId))
          .limit(1);

        if (!def) {
          log.warn(
            { ruleId: rule.id, definitionId: rule.definitionId },
            "[class-materialize] definition not found — skipping rule",
          );
          continue;
        }

        if (!def.active) {
          log.info(
            { ruleId: rule.id, definitionId: rule.definitionId },
            "[class-materialize] definition is inactive — skipping rule",
          );
          continue;
        }

        // Generate occurrences for the window.
        const occurrences = generateOccurrences(rule as ScheduleRule, endDate);

        if (occurrences.length === 0) {
          rulesProcessed++;
          continue;
        }

        // Insert occurrences — ON CONFLICT DO NOTHING is handled by Postgres
        // via the partial unique index idx_class_occurrences_rule_starts.
        // We use raw SQL for the ON CONFLICT clause since Drizzle 0.45 does
        // not have first-class partial-index conflict target support.
        for (const occ of occurrences) {
          const id = `occ_${nanoid(12)}`;
          const endsAt = addMinutes(occ.startsAtUtc, def.durationMin);

          const result = await db.execute(sql`
            INSERT INTO class_occurrences
              (id, definition_id, rule_id, starts_at, ends_at, capacity, location, trainer_id, status, created_at)
            VALUES
              (${id}, ${rule.definitionId}, ${rule.id}, ${occ.startsAtUtc}, ${endsAt},
               ${rule.capacity}, ${rule.location}, ${rule.trainerId}, 'scheduled', now())
            ON CONFLICT DO NOTHING
          `);

          // rowCount / rowsAffected differs between pg drivers; treat 0 = conflict.
          const rowsAffected =
            (result as { rowCount?: number; rowsAffected?: number }).rowCount ??
            (result as { rowCount?: number; rowsAffected?: number })
              .rowsAffected ??
            1;
          if (rowsAffected > 0) {
            totalInserted++;
          } else {
            totalSkipped++;
          }
        }

        // Advance generated_through to the last date in the window.
        const lastDate = occurrences[occurrences.length - 1].startsAtUtc.slice(
          0,
          10,
        );
        await db
          .update(schema.classScheduleRules)
          .set({ generatedThrough: lastDate })
          .where(eq(schema.classScheduleRules.id, rule.id));

        rulesProcessed++;
      } catch (err) {
        log.error(
          { err, ruleId: rule.id },
          "[class-materialize] error processing rule — continuing",
        );
      }
    }

    log.info(
      { rulesProcessed, totalInserted, totalSkipped },
      "[class-materialize] run complete",
    );
  });

  // 2. Schedule: daily at 04:00 UTC.
  await boss.schedule(QUEUE, "0 4 * * *", {}, { tz: "UTC" } as any);
  log.info(
    { queue: QUEUE, cron: "0 4 * * *", tz: "UTC" },
    "[class-materialize] scheduled",
  );
}
