import type { PgBoss } from "pg-boss";

/**
 * STUB — real implementation lands in Plan P1b-05 Task 2.
 *
 * Task 1 (bootstrap) creates the file shell so apps/worker/src/index.ts can
 * import + call this function and `pnpm --filter @gymos/worker typecheck`
 * exits 0. Task 2 replaces this body with the actual pg-boss subscriber:
 *   - boss.work("inbound-whatsapp", { teamSize: 5, teamConcurrency: 5 }, ...)
 *   - dispatch on payload.kind (HIGH #6)
 *   - upsertConversationAndMessage (HIGH #4)
 *   - applyOrdinalStatusUpdate (PITFALL #11 + Blocker #2)
 */
export async function registerInboundWhatsAppWorker(_boss: PgBoss) {
  throw new Error(
    "registerInboundWhatsAppWorker stub — Task 2 of P1b-05 wires the real boss.work() handler",
  );
}
