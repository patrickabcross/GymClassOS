/**
 * services/worker/src/queues/meta-capi-event.ts
 *
 * MC1: Meta Conversions API (CAPI) event sender — the SOLE CAPI send
 * chokepoint (D-01). Every CAPI request goes through this handler.
 *
 * Architecture:
 *   - pg-boss consumer for QUEUE_NAMES.META_CAPI_EVENT (created in index.ts).
 *   - Resolves pixelId / testEventCode / stageEventMap from studio_owner_config
 *     at execution time (NOT baked into the job payload) so queued jobs never
 *     carry a stale Pixel ID.
 *   - Decrypts META_CAPI_TOKEN from app_secrets via readAppSecretByKey (AES-256-GCM,
 *     keyed from BETTER_AUTH_SECRET). Token is NEVER logged or sent client-side
 *     (CAPI-04 / D-17).
 *   - POSTs to https://graph.facebook.com/v23.0/<pixelId>/events with:
 *       • Hashed PII fields (em, ph, fn, ln) — caller pre-hashes; worker passes through.
 *       • Plain attribution signals (fbc, fbp, client_ip_address, client_user_agent).
 *       • event_time in Unix SECONDS (NOT divided again — payload already delivers seconds).
 *       • test_event_code at the TOP LEVEL of the POST body (sibling of `data`), only when configured.
 *       • event_id equal to the browser Pixel's eventID for browser<->server dedup (D-15).
 *   - Splits permanent vs retryable errors:
 *       • Permanent (4xx is_transient:false | code 190): write lead_status='failed', return (no retry).
 *       • Transient (5xx | network): re-throw on non-final attempts so pg-boss retries with backoff;
 *         on the FINAL attempt write lead_status='failed' and return — event isolated, process lives (D-18).
 *   - Writes back lead_status + lead_sent_at on meta_lead_attribution via raw parameterized SQL.
 *     The worker does NOT import apps/staff-web/server/db/schema.ts (separate build, no cross-app deps).
 *   - Unconfigured-skip: if pixelId or META_CAPI_TOKEN are absent, logs a warning and returns
 *     cleanly — the queue stays healthy; activation requires no redeploy.
 */

import type { PgBoss } from "pg-boss";
import { sql } from "drizzle-orm";
import { QUEUE_NAMES, MetaCapiEventPayload } from "@gymos/queue";
import { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { readAppSecretByKey } from "../lib/appSecrets.js";
import { resolveStageEvent } from "../lib/stage-event-map.js";

/**
 * Register the pg-boss subscriber for the `meta-capi-event` queue.
 *
 * Mirrors registerOutboundWhatsAppWorker exactly:
 *   - batchSize: 1 + localConcurrency: 1 (paces under Meta's API rate limits)
 *   - includeMetadata: true (exposes retryCount / retryLimit for final-attempt detection)
 *
 * Job lifecycle:
 *   - Unconfigured (no pixelId or token): log.warn + return (pg-boss marks complete, no retry needed).
 *   - 2xx success: write lead_status='sent' + lead_sent_at=NOW(), return.
 *   - Permanent error (code 190 | 4xx is_transient:false): write lead_status='failed', return.
 *   - Transient error (5xx | network): re-throw so pg-boss retries; on final attempt write
 *     lead_status='failed' and return (D-18: per-event isolation, no process crash).
 */
export async function registerMetaCapiEventWorker(boss: PgBoss) {
  const log = getLogger();

  await boss.work(
    QUEUE_NAMES.META_CAPI_EVENT,
    { batchSize: 1, localConcurrency: 1, includeMetadata: true },
    async (jobs: any) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      const data = MetaCapiEventPayload.parse(job.data);
      const db = getDb();

      // ── 1. Resolve studio config from singleton row ─────────────────────
      // guard:allow-unscoped — single-tenant meta config (one Neon DB per studio)
      const configRows = await db.execute(sql`
        SELECT meta_pixel_id, meta_test_event_code, meta_stage_event_map
        FROM studio_owner_config
        LIMIT 1
      `);

      const configRowList =
        (configRows as any)?.rows ?? (configRows as any) ?? [];
      const configRow = Array.isArray(configRowList)
        ? configRowList[0]
        : undefined;

      const pixelId = configRow?.meta_pixel_id as string | null | undefined;

      if (!pixelId) {
        log.warn(
          { eventId: data.eventId },
          "[meta-capi-event] pixelId not configured in studio_owner_config — skipping",
        );
        return;
      }

      const metaTestEventCode = configRow?.meta_test_event_code as
        | string
        | null
        | undefined;
      const metaStageEventMap = configRow?.meta_stage_event_map as
        | string
        | Record<string, string>
        | null
        | undefined;

      // ── 2. Decrypt META_CAPI_TOKEN from app_secrets ─────────────────────
      // Token is NEVER logged — only presence/absence is observed.
      const token = await readAppSecretByKey("META_CAPI_TOKEN", db);
      if (!token) {
        log.warn(
          { eventId: data.eventId },
          "[meta-capi-event] META_CAPI_TOKEN not configured in app_secrets — skipping. " +
            "Ensure BETTER_AUTH_SECRET on the Fly worker matches Vercel staff-web (D-03).",
        );
        return;
      }

      // ── 3. Resolve event name from stageEventMap ─────────────────────────
      // Prefer the payload's eventName (already resolved by the submit handler)
      // but also resolve from the worker's map so a renamed config flows through
      // without a code change (forward-compat, D-05).
      const resolvedEventName = resolveStageEvent(metaStageEventMap, "lead");
      const eventName = data.eventName || resolvedEventName;

      // ── 4. Build the CAPI payload (Graph API v23 shape) ──────────────────
      // fbc, fbp, client_ip_address, client_user_agent: PLAIN — never hashed.
      // em, ph, fn, ln: pre-hashed SHA-256 by the submit handler — passed through as-is.
      // event_time: Unix SECONDS (data.eventTime is already seconds — do NOT divide again).
      // test_event_code: TOP-LEVEL sibling of `data`, only when configured.
      // event_id: shared browser<->server dedup key (must equal browser Pixel eventID, D-15).
      const userData: Record<string, unknown> = {};
      if (data.hashedEmail) userData.em = [data.hashedEmail];
      if (data.hashedPhone) userData.ph = [data.hashedPhone];
      if (data.hashedFn) userData.fn = data.hashedFn;
      if (data.hashedLn) userData.ln = data.hashedLn;
      if (data.fbc) userData.fbc = data.fbc; // PLAIN
      if (data.fbp) userData.fbp = data.fbp; // PLAIN
      if (data.clientIp) userData.client_ip_address = data.clientIp; // PLAIN
      if (data.clientUserAgent)
        userData.client_user_agent = data.clientUserAgent; // PLAIN
      // MC3 (LEAD-02): in-platform Lead Ad lead_id — PLAIN string, NOT hashed (confirmed RESEARCH D-14).
      if (data.leadId) userData.lead_id = data.leadId;

      const capiBody: Record<string, unknown> = {
        data: [
          {
            event_name: eventName,
            event_time: data.eventTime, // Unix SECONDS — already correct, do NOT divide
            event_id: data.eventId, // shared with browser Pixel (dedup, D-15)
            action_source: data.actionSource, // "website"
            ...(data.eventSourceUrl
              ? { event_source_url: data.eventSourceUrl }
              : {}),
            user_data: userData,
          },
        ],
      };

      // MC2 (LIFE-02): Purchase carries custom_data.value + custom_data.currency.
      // Meta REQUIRES both for revenue optimisation. Contact/Schedule omit custom_data.
      if (data.value != null && data.currency) {
        (capiBody.data as any[])[0].custom_data = {
          value: data.value, // already MAJOR units (caller divided)
          currency: data.currency, // ISO-4217 lowercase
        };
      }

      // test_event_code is a TOP-LEVEL key (sibling of `data`), NOT inside the event object.
      if (metaTestEventCode) {
        capiBody.test_event_code = metaTestEventCode;
      }

      // ── 5. POST to Meta Graph API v23 ─────────────────────────────────────
      // access_token sent as a query param (Graph API v23 convention).
      const endpoint = `https://graph.facebook.com/v23.0/${pixelId}/events?access_token=${token}`;

      const retryCount = Number(job?.retryCount ?? 0);
      const retryLimit = Number(job?.retryLimit ?? 5);

      let resp: Response;
      let respJson: Record<string, unknown>;

      try {
        resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(capiBody),
        });
        respJson = await resp
          .json()
          .catch(() => ({}) as Record<string, unknown>);
      } catch (fetchErr) {
        // Network-level failure (ECONNREFUSED, ETIMEDOUT, etc.) — retryable.
        if (retryCount >= retryLimit) {
          log.error(
            { err: fetchErr, eventId: data.eventId, retryCount, retryLimit },
            "[meta-capi-event] network error — giving up after final retry (D-18)",
          );
          // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
          await db.execute(sql`
            UPDATE meta_lead_attribution
            SET lead_status = ${"failed"},
                last_error = ${fetchErr instanceof Error ? fetchErr.message.slice(0, 500) : String(fetchErr).slice(0, 500)},
                updated_at = NOW()
            WHERE member_id = ${data.memberId}
          `);
          return; // event isolated — do NOT crash the worker process (D-18)
        }
        // Non-final attempt: let pg-boss retry with backoff.
        log.warn(
          { err: fetchErr, eventId: data.eventId, retryCount, retryLimit },
          "[meta-capi-event] network error — will retry",
        );
        throw fetchErr;
      }

      // ── 6. Classify the response ──────────────────────────────────────────
      const metaError = (respJson as any)?.error as
        | { code?: number; message?: string; is_transient?: boolean }
        | undefined;

      // Permanent error: bad access token (code 190) or any 4xx with is_transient != true.
      const isPermanent =
        !resp.ok &&
        (metaError?.is_transient === false ||
          metaError?.code === 190 ||
          (resp.status >= 400 &&
            resp.status < 500 &&
            metaError?.is_transient !== true));

      // ── 7. Handle success ─────────────────────────────────────────────────
      if (resp.ok) {
        log.info(
          {
            eventId: data.eventId,
            fbtrace: (respJson as any)?.fbtrace_id,
          },
          "[meta-capi-event] sent",
        );
        // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
        await db.execute(sql`
          UPDATE meta_lead_attribution
          SET lead_status = ${"sent"},
              lead_sent_at = NOW(),
              last_error = ${null},
              updated_at = NOW()
          WHERE member_id = ${data.memberId}
        `);
        // MC2: stamp the per-stage marker column so the fire point's idempotency
        // gate (contact/schedule) flips only on a confirmed successful send.
        if (data.stageKey && data.stageKey !== "lead") {
          const markerCol = {
            contact: "contact_sent_at",
            purchase: "purchase_sent_at",
            schedule: "schedule_sent_at",
          }[data.stageKey];
          if (markerCol) {
            // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
            await db.execute(sql`
              UPDATE meta_lead_attribution
              SET ${sql.raw(markerCol)} = NOW(), updated_at = NOW()
              WHERE member_id = ${data.memberId}
            `);
          }
        }
        return;
      }

      // ── 8. Handle permanent error (4xx / code 190 / is_transient:false) ──
      if (isPermanent) {
        const errMsg = metaError?.message ?? `HTTP ${resp.status}`;
        log.warn(
          { eventId: data.eventId, status: resp.status, error: metaError },
          "[meta-capi-event] permanent error — not retrying",
        );
        // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
        await db.execute(sql`
          UPDATE meta_lead_attribution
          SET lead_status = ${"failed"},
              last_error = ${errMsg.slice(0, 500)},
              updated_at = NOW()
          WHERE member_id = ${data.memberId}
        `);
        return; // pg-boss marks job complete — never retried
      }

      // ── 9. Handle transient error (5xx, is_transient:true) ───────────────
      const errMsg = metaError?.message ?? `HTTP ${resp.status}`;

      if (retryCount >= retryLimit) {
        log.error(
          {
            eventId: data.eventId,
            status: resp.status,
            error: metaError,
            retryCount,
            retryLimit,
          },
          "[meta-capi-event] giving up after final retry (D-18)",
        );
        // guard:allow-unscoped — worker post-send status write (single-tenant meta attribution)
        await db.execute(sql`
          UPDATE meta_lead_attribution
          SET lead_status = ${"failed"},
              last_error = ${errMsg.slice(0, 500)},
              updated_at = NOW()
          WHERE member_id = ${data.memberId}
        `);
        return; // event isolated — do NOT crash the worker process (D-18)
      }

      // Non-final transient: re-throw so pg-boss retries with backoff.
      log.warn(
        {
          eventId: data.eventId,
          status: resp.status,
          error: metaError,
          retryCount,
          retryLimit,
        },
        "[meta-capi-event] transient error — will retry",
      );
      throw new Error(`Meta CAPI ${resp.status}: ${JSON.stringify(metaError)}`);
    },
  );
}
