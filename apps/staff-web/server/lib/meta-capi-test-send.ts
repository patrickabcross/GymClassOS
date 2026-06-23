/**
 * Synthetic test-Lead ENQUEUE helper (D-01 + D-10).
 *
 * D-01 (LOCKED): staff-web (Vercel) MUST NOT POST to Meta directly.
 * This helper ENQUEUES a meta-capi-event Lead job so the Fly worker — the
 * sole CAPI sender — sends it to Meta Test Events. The Meta Graph API is
 * never called from staff-web; only the worker calls it.
 *
 * D-10: the enqueued event is a REAL, well-formed Lead with pre-hashed
 * synthetic PII, proving the full token + pixel + worker path.
 */

import { createHash } from "node:crypto";
import { enqueueMetaCapiEvent } from "../../app/lib/queue-client.js";
import { readAppSecretByKey } from "./app-secrets.js";

export interface MetaTestSendResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

function sha256Hex(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * D-10 + D-01: enqueue a REAL (synthetic) CAPI Lead so the Fly worker sends
 * it to Meta Test Events. staff-web never POSTs to Meta itself.
 *
 * @param args.pixelId  - Current Pixel ID (presence-checked before enqueue).
 * @param args.memberId - A real member id for the worker attribution write-back.
 */
export async function enqueueMetaTestLead(args: {
  pixelId: string;
  memberId: string;
}): Promise<MetaTestSendResult> {
  if (!args.pixelId) return { ok: false, error: "Pixel ID not configured." };

  // Presence pre-check only — so the UI gives a clear error before enqueuing.
  // The worker reads the token itself at execution time; we never return the value.
  const tokenPresent = (await readAppSecretByKey("META_CAPI_TOKEN")) !== null;
  if (!tokenPresent)
    return { ok: false, error: "Conversions API token not configured." };

  const eventId =
    "mc1_test_" +
    Math.random().toString(36).slice(2, 9) +
    "_" +
    Date.now().toString(36);

  try {
    await enqueueMetaCapiEvent({
      eventId,
      memberId: args.memberId,
      eventName: "Lead",
      actionSource: "website",
      eventTime: Math.floor(Date.now() / 1000), // Unix SECONDS (not ms)
      // Synthetic pre-hashed PII so the Lead payload is well-formed (D-10).
      // Raw email never enters the queue — normalized then SHA-256.
      hashedEmail: sha256Hex("test@example.com"),
      // pixelId + testEventCode are NOT passed — the worker resolves them from
      // studio_owner_config at execution time and sets test_event_code top-level
      // in the POST body, so the event appears in Meta's Test Events tab.
    });
    return { ok: true, eventId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
