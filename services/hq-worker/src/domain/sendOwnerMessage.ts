import { eq } from "drizzle-orm";
import type { getHqDb } from "../lib/db.js";
import { schema } from "../lib/db.js";
import { hasOwnerOptIn } from "../lib/gates/ownerOptInGate.js";
import { isOwnerInWindow } from "../lib/gates/ownerWindowGate.js";
import { isOwnerTemplateApproved } from "../lib/gates/ownerTemplateGate.js";
import type {
  HqWabaClient,
  SendOwnerMessagePayload,
} from "../lib/hq-waba-client.js";

// ─── Typed errors ─────────────────────────────────────────────────────────────

/**
 * Thrown when the studio has no active opt-in row in hq_whatsapp_opt_in
 * (either never opted in, or the owner has opted out).
 */
export class OwnerNoOptInError extends Error {
  constructor(studioId: string) {
    super(
      `Studio "${studioId}" has no active HQ WABA opt-in. ` +
        "Owner must opt in via the signup form or a manual opt-in before messages can be sent.",
    );
    this.name = "OwnerNoOptInError";
  }
}

/**
 * Thrown when a text message is attempted outside the 24h Meta inbound window.
 * Use an approved template (type: 'template') to send outside the window.
 */
export class OwnerWindowExpiredError extends Error {
  constructor(studioId: string) {
    super(
      `Studio "${studioId}" owner has not messaged HQ within the last 24 hours. ` +
        "Use an approved template payload to send outside the Meta inbound window.",
    );
    this.name = "OwnerWindowExpiredError";
  }
}

/**
 * Thrown when a template message is attempted with a template that does not
 * have status='approved' in hq_whatsapp_templates.
 */
export class OwnerTemplateNotApprovedError extends Error {
  constructor(templateName: string) {
    super(
      `HQ WABA template "${templateName}" is not approved. ` +
        "Template must be approved by Meta before it can be used for owner sends.",
    );
    this.name = "OwnerTemplateNotApprovedError";
  }
}

// ─── sendOwnerMessage ─────────────────────────────────────────────────────────

/**
 * Gate-ordered HQ owner B2B send orchestrator (HQD-03, D-09).
 *
 * MIRROR of services/worker/src/domain/sendMessage.ts gate order.
 * DO NOT import from services/worker — CI guard enforces WABA separation (D-07).
 *
 * Gate order (D-09):
 *   1. hasOwnerOptIn(studioId, db)       → throw OwnerNoOptInError on false
 *   2. Load hq_whatsapp_opt_in row        → get phone_e164 + last_inbound_at
 *   3. if payload.type === 'text':
 *        isOwnerInWindow(lastInboundAt) → throw OwnerWindowExpiredError if !inWindow
 *   4. if payload.type === 'template':
 *        isOwnerTemplateApproved(name) → throw OwnerTemplateNotApprovedError if false
 *   5. client.sendMessage({ to: phoneE164, payload }) → return { wamid }
 *
 * The client is injected (mockHqWabaClient in tests, real client in prod) so
 * live WABA calls never happen in unit tests (D-13 deferred-on-external-dependency).
 */
export async function sendOwnerMessage(args: {
  studioId: string;
  messageId: string;
  payload: SendOwnerMessagePayload;
  db: ReturnType<typeof getHqDb>;
  client: HqWabaClient;
}): Promise<{ wamid: string }> {
  const { studioId, payload, db, client } = args;

  // ── Gate 1: opt-in ─────────────────────────────────────────────────────────
  if (!(await hasOwnerOptIn(studioId, db))) {
    throw new OwnerNoOptInError(studioId);
  }

  // ── Step 2: load opt-in row → phone_e164 + last_inbound_at ───────────────
  // guard:allow-unscoped — HQ send chokepoint; studio_id IS the access check
  const rows = await db
    .select({
      phoneE164: schema.hqWhatsappOptIn.phoneE164,
      lastInboundAt: schema.hqWhatsappOptIn.lastInboundAt,
    })
    .from(schema.hqWhatsappOptIn)
    .where(eq(schema.hqWhatsappOptIn.studioId, studioId))
    .limit(1);

  const row = rows[0];
  const phoneE164 = row.phoneE164;
  const lastInboundAt = row.lastInboundAt ? new Date(row.lastInboundAt) : null;

  // ── Gate 3: 24h window gate (text messages only) ───────────────────────────
  if (payload.type === "text") {
    if (!isOwnerInWindow(lastInboundAt)) {
      throw new OwnerWindowExpiredError(studioId);
    }
  }

  // ── Gate 4: approved template gate (template messages only) ───────────────
  if (payload.type === "template") {
    if (!(await isOwnerTemplateApproved(payload.name, db))) {
      throw new OwnerTemplateNotApprovedError(payload.name);
    }
  }

  // ── Step 5: send via HQ WABA client (mocked in tests, real in prod) ──────
  const res = await client.sendMessage({ to: phoneE164, payload });
  return res;
}
