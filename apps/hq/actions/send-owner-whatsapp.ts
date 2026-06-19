/**
 * apps/hq/actions/send-owner-whatsapp.ts
 *
 * HQD owner-send defineAction (HQD-02, D-08).
 *
 * STRUCTURAL MEMBER EXCLUSION (D-08):
 *   The schema is .strict() and contains NO field that can express a member
 *   target. studioId resolves to the gym-owner's own B2B contact info stored
 *   in hq_whatsapp_opt_in (HQ Neon) — which physically contains no gym-member
 *   records. .strict() means ZodError is thrown at parse time for ANY unknown
 *   field (e.g. memberId, memberEmail, memberPhone, to).
 *
 * Producer pattern:
 *   This action is the pg-boss PRODUCER. It enqueues to the "hq-owner-send"
 *   queue. The WABA client + gate-ordered sendOwnerMessage orchestrator live
 *   in services/hq-worker (the CONSUMER). This mirrors the provision-studio
 *   producer/consumer split in BD2-05/06 and follows the integration-webhooks
 *   queue pattern from AGENTS.md.
 *
 * Deferred-on-external-dependency (D-13):
 *   The queue consumer (services/hq-worker) uses mockHqWabaClient until HQ
 *   WABA second phone number registration + Meta template approval are complete.
 *   No live WABA calls happen from this action.
 */

import { defineAction } from "@agent-native/core";
import { z } from "zod";
import { getBoss } from "@gymos/queue";

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * The HQD owner-send Zod schema.
 *
 * Exported as a named const so tests can import and parse it directly without
 * invoking `run` (which would require getBoss/getHqDb infrastructure).
 *
 * .strict() is load-bearing (D-08): any field NOT listed here throws ZodError.
 * There is NO member-target field. studioId → resolves owner contact via
 * hq_whatsapp_opt_in; topic → restricts to system/product categories.
 */
export const OwnerSendSchema = z
  .object({
    studioId: z
      .string()
      .min(1)
      .describe(
        "HQ studio registry ID — resolves owner contact from hq_whatsapp_opt_in (HQ Neon). " +
          "Never a gym-member ID. HQ Neon contains no gym-member records.",
      ),
    topic: z
      .enum([
        "system_update",
        "feature_announcement",
        "onboarding_guidance",
        "performance_insight",
        "billing_notice",
      ])
      .describe("B2B communication topic — system/product categories only"),
    payload: z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("text"),
          body: z.string().min(1).max(4096),
        }),
        z.object({
          type: z.literal("template"),
          name: z.string().min(1),
          vars: z.record(z.string(), z.string()),
          language: z.string().default("en_US"),
        }),
      ])
      .describe(
        "Message payload. text: free-text (requires owner within 24h window). " +
          "template: approved Meta template (required outside 24h window).",
      ),
  })
  .strict(); // .strict() — unknown fields (e.g. memberId) throw ZodError at parse time

export type OwnerSendInput = z.infer<typeof OwnerSendSchema>;

// ─── Payload sent to the hq-owner-send queue ──────────────────────────────────

export interface HqOwnerSendJobData {
  studioId: string;
  messageId: string;
  payload: OwnerSendInput["payload"];
}

// ─── defineAction ─────────────────────────────────────────────────────────────

export default defineAction({
  description:
    "Send a WhatsApp message to a gym owner about a GymClassOS system or product topic. " +
    "ONLY use for: system updates, feature announcements, onboarding guidance, " +
    "performance insights, billing notices. " +
    "NEVER send messages referencing gym members, bookings, conversations, or any PII. " +
    "This action sends from HQ's own WhatsApp Business Account — separate from any studio WABA. " +
    "The recipient is the gym owner (B2B), resolved from the HQ studio registry. " +
    "Enqueues to the hq-owner-send worker queue for gate-ordered delivery " +
    "(opt-in check → 24h window → approved-template gates).",
  schema: OwnerSendSchema,
  run: async ({ studioId, payload }) => {
    // Generate a message ID using Node's built-in crypto.randomUUID()
    // (nanoid is not a dep of @gymos/hq; matches the BD2-06 crypto.randomUUID() decision).
    const messageId = crypto.randomUUID();

    // Enqueue to hq-owner-send — the consumer (services/hq-worker) owns the
    // gated send path (sendOwnerMessage). This action NEVER calls the WABA
    // client directly (deferred-on-external-dependency, D-13).
    await getBoss().send(
      "hq-owner-send",
      { studioId, messageId, payload } satisfies HqOwnerSendJobData,
      {
        // Expire after 10 minutes — prevents a stuck job from blocking the queue.
        expireInSeconds: 600,
        // 3 retries for transient failures (mirror provision-studio pattern).
        retryLimit: 3,
      },
    );

    return { enqueued: true, messageId };
  },
});
