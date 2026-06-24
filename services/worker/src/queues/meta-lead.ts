/**
 * services/worker/src/queues/meta-lead.ts
 *
 * MC3 (LEAD-01): META_LEAD queue handler — Graph API retrieval + ingest.
 *
 * Architecture (D-10):
 *   The edge-webhooks receiver only verifies + dedupes + enqueues a job
 *   carrying { leadgenId, formId, pageId, adId }. THIS handler does the
 *   heavy work:
 *     1. Resolves the Page access token from app_secrets (D-08, never logged).
 *     2. GETs field_data from Meta Graph v23 (GET /{leadgen_id}?access_token=...).
 *     3. Calls ingestMetaLead() to materialise the member + conversation +
 *        attribution(meta_lead_id) + opt-in (source='meta_lead_ads').
 *
 * Retry strategy (Pitfall 5 — retrieval race):
 *   The Leadgen webhook fires immediately on form submission, but Meta may not
 *   have the lead retrievable for a few seconds. Throwing from this handler
 *   triggers pg-boss retry using the enqueue-time options set by enqueueMetaLead()
 *   in MC3-01 (retryLimit:5, retryBackoff). A 404 or error.code=100 ("Object
 *   does not exist") is retryable. error.code=190 (invalid token) is permanent —
 *   return without throwing (pg-boss marks the job complete, won't retry).
 *
 * Permissions required on the Page access token (operator setup — D-09):
 *   - leads_retrieval
 *   - pages_manage_ads
 *   (May require Meta App Review — documented in the ops note below.)
 *
 * Ops note (D-09):
 *   Before this handler receives live data, the operator must:
 *     1. Enter the Page access token as "META_PAGE_ACCESS_TOKEN" in the
 *        "Meta Conversion Tracking" Settings card (/gymos/settings/integrations).
 *     2. Subscribe the Facebook App to the Page's 'leadgen' field:
 *        POST https://graph.facebook.com/v23.0/{PAGE_ID}/subscribed_apps
 *          ?access_token={PAGE_ACCESS_TOKEN}&subscribed_fields=leadgen
 *        (or via the Meta App Dashboard → Webhooks → Subscribe to Page / leadgen field)
 *     3. Ensure the token has leads_retrieval + pages_manage_ads permissions;
 *        if not, submit the app for Meta App Review.
 *        The token's user must have "Leads Access" on the Page in Business Manager.
 */

import type { PgBoss } from "pg-boss";
import { QUEUE_NAMES, MetaLeadPayload } from "@gymos/queue";
import { getDb } from "../lib/db.js";
import { getLogger } from "../lib/logger.js";
import { readAppSecretByKey } from "../lib/appSecrets.js";
import { ingestMetaLead } from "../domain/meta-lead-ingest.js";

/**
 * Register the pg-boss subscriber for the `meta-lead` queue.
 *
 * batchSize: 1 + localConcurrency: 1 — one retrieval job at a time, pacing
 * under Meta's Graph API rate limits (low-volume for a single-studio deploy).
 * includeMetadata: true — exposes retryCount/retryLimit for logging context.
 */
export async function registerMetaLeadWorker(boss: PgBoss): Promise<void> {
  const log = getLogger();

  await boss.work(
    QUEUE_NAMES.META_LEAD,
    { batchSize: 1, localConcurrency: 1, includeMetadata: true },
    async (jobs: any) => {
      const job = Array.isArray(jobs) ? jobs[0] : jobs;
      const data = MetaLeadPayload.parse(job.data);

      const db = getDb();

      // ── 1. Resolve Page access token from app_secrets (D-08) ─────────────
      // Never logged — only presence/absence is observed (same posture as
      // META_CAPI_TOKEN in meta-capi-event.ts).
      const pageToken = await readAppSecretByKey("META_PAGE_ACCESS_TOKEN", db);
      if (!pageToken) {
        log.warn(
          { leadgenId: data.leadgenId },
          "[meta-lead] META_PAGE_ACCESS_TOKEN not configured in app_secrets — skipping. " +
            "Enter the Page access token in /gymos/settings/integrations (D-08).",
        );
        return; // unconfigured-skip — job marked complete, no retry
      }

      // ── 2. Retrieve field_data from Meta Graph v23 ───────────────────────
      // endpoint: GET https://graph.facebook.com/v23.0/{leadgen_id}?access_token={token}
      // access_token as query param (Graph API v23 convention).
      const graphUrl = `https://graph.facebook.com/v23.0/${data.leadgenId}?access_token=${pageToken}`;

      let resp: Response;
      let body: Record<string, unknown>;

      try {
        resp = await fetch(graphUrl);
        body = await resp.json().catch(() => ({}) as Record<string, unknown>);
      } catch (fetchErr) {
        // Network-level failure (ECONNREFUSED, ETIMEDOUT, etc.) — retryable.
        log.warn(
          { leadgenId: data.leadgenId, err: fetchErr },
          "[meta-lead] network error fetching from Graph — will retry",
        );
        throw fetchErr; // re-throw triggers pg-boss retry with backoff
      }

      if (!resp.ok) {
        const errCode = (body as any)?.error?.code as number | undefined;
        const errMsg = (body as any)?.error?.message as string | undefined;

        if (errCode === 190) {
          // Permanent — invalid/expired Page access token (Pitfall 6).
          // Do NOT throw (would retry forever) — return and log prominently.
          log.error(
            { leadgenId: data.leadgenId, errCode, errMsg },
            "[meta-lead] Page token invalid (code 190) — permanent failure. " +
              "Re-enter META_PAGE_ACCESS_TOKEN in Settings. Not retrying.",
          );
          return; // permanent — pg-boss marks job complete
        }

        // All other non-200 responses (including 404 / code 100 availability lag —
        // Pitfall 5) are retryable: throw so pg-boss retries with backoff.
        log.warn(
          {
            leadgenId: data.leadgenId,
            httpStatus: resp.status,
            errCode,
            errMsg,
            retryCount: job?.retryCount ?? 0,
            retryLimit: job?.retryLimit ?? 5,
          },
          "[meta-lead] Graph GET non-200 (may be availability lag) — retrying",
        );
        throw new Error(
          `Graph ${resp.status} code=${errCode ?? "?"} — retrying`,
        );
      }

      // ── 3. Ingest the lead ────────────────────────────────────────────────
      const result = await ingestMetaLead(db, body, data.leadgenId, data.formId);

      if (!result) {
        // D-07: parked (no email or phone) — already logged by ingestMetaLead
        return;
      }

      log.info(
        { leadgenId: data.leadgenId, memberId: result.memberId },
        "[meta-lead] lead ingested successfully",
      );
    },
  );
}
