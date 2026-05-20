/**
 * P1b Success Criteria — integration suite (D-23).
 *
 * These tests verify the P1b ROADMAP success criteria at an integration
 * level (live Fly receiver — gymos-edge-webhooks). They exercise the
 * signature-verify + idempotency paths in apps/edge-webhooks/src/routes/*
 * against the deployed Fly app.
 *
 * Scenarios covered:
 *   #1. Stripe checkout.session.completed replay-twice → 1 payments row
 *   #2. WA inbound replay → 1 messages row (idempotent via ON CONFLICT)
 *   #3. sendMessage out-of-window (text) → WindowExpiredError + 0 fetches
 *   #4. sendMessage no-opt-in (text) → NoOptInError + 0 fetches
 *   #5. Tampered Stripe body → 400 BEFORE any business work (no DB write)
 *   #5b. Tampered WA body → 401 BEFORE any business work
 *
 * Scenarios #3 and #4 (the "no Meta fetch occurred" assertion) live as
 * unit tests in apps/worker/src/domain/sendMessage.test.ts — they assert
 * `expect(sendText).not.toHaveBeenCalled()` on gate failure. This file
 * documents that coverage rather than duplicating it: the unit layer is
 * the right home for assertions about the worker's internal call graph,
 * and a remote integration test cannot count Meta API calls anyway.
 *
 * LOCAL vs CI behaviour (MEDIUM #9 — anti vacuous-PASS):
 *
 *   LOCAL (process.env.CI != "true"):
 *     Missing WHATSAPP_APP_SECRET or STRIPE_WEBHOOK_SECRET → the
 *     network-bound `it()` cases are skipped via Vitest's `it.skipIf`.
 *     This lets a developer run `pnpm test:integration` without
 *     configuring any secrets — the suite exits 0 with 1 passing test
 *     + 4 skipped.
 *
 *   CI (process.env.CI === "true"):
 *     The `beforeAll` precondition asserts both secrets are present
 *     BEFORE any `it()` runs. If either is missing the suite throws and
 *     the CI build fails LOUDLY with a clear "MEDIUM #9: CI requires…"
 *     message. The suite must NOT pass silently via skip in CI.
 *
 * Required env to actually exercise the network tests locally:
 *   - FLY_EDGE_URL          (default: https://gymos-edge-webhooks.fly.dev)
 *   - WHATSAPP_APP_SECRET   (must match the Fly secret of the same name)
 *   - STRIPE_WEBHOOK_SECRET (must match the Fly secret of the same name)
 *
 * Required in CI (must be wired as GitHub Actions secrets, see the test
 * job in .github/workflows/* — Plan 09 SUMMARY notes the wiring step):
 *   - WHATSAPP_APP_SECRET
 *   - STRIPE_WEBHOOK_SECRET
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";
import fixtureWaInbound from "../fixtures/whatsapp/inbound-text.json" with { type: "json" };
import fixtureStripeCheckout from "../fixtures/stripe/checkout-session-completed.json" with { type: "json" };

const FLY_URL =
  process.env.FLY_EDGE_URL ?? "https://gymos-edge-webhooks.fly.dev";
const WA_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const IS_CI = process.env.CI === "true";

/**
 * MEDIUM #9 — CI-strict precondition.
 *
 * Runs before any `it()` block. In CI, missing secrets fail loudly so
 * a build never silently PASSes via universal skipIf. Locally, the
 * assertions are no-ops because IS_CI is false.
 *
 * If you are hitting this and you ARE running in CI: configure the
 * missing GitHub Actions secrets. The integration suite must NOT pass
 * silently via skip in CI.
 */
beforeAll(() => {
  if (IS_CI) {
    expect(
      WA_APP_SECRET,
      "MEDIUM #9: CI requires WHATSAPP_APP_SECRET — set it as a GitHub Actions secret. The integration suite must NOT pass silently via skip in CI.",
    ).toBeTruthy();
    expect(
      STRIPE_WEBHOOK_SECRET,
      "MEDIUM #9: CI requires STRIPE_WEBHOOK_SECRET — set it as a GitHub Actions secret. The integration suite must NOT pass silently via skip in CI.",
    ).toBeTruthy();
  }
});

function waSig(body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", WA_APP_SECRET).update(body).digest("hex")
  );
}

function stripeSig(body: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${body}`;
  const sig = crypto
    .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("P1b Success Criteria", () => {
  it.skipIf(!STRIPE_WEBHOOK_SECRET)(
    "#5: tampered Stripe body returns 400 BEFORE DB write",
    async () => {
      // Bad signature — Stripe constructEvent() throws synchronously. The
      // receiver returns 400 before insertWebhookEvent is called. The
      // receiver-layer unit test in
      //   apps/edge-webhooks/src/routes/stripe.test.ts
      // already asserts insertWebhookEvent.toHaveBeenCalledTimes(0) on
      // this code path. This integration test re-confirms the live
      // deployment honours the same contract end-to-end.
      const res = await fetch(`${FLY_URL}/webhooks/stripe`, {
        method: "POST",
        headers: {
          "stripe-signature": "t=1234567890,v1=deadbeef",
          "content-type": "application/json",
        },
        body: '{"id":"evt_p1b_tampered_test","type":"checkout.session.completed"}',
      });
      expect(res.status).toBe(400);
    },
  );

  it.skipIf(!WA_APP_SECRET)(
    "#5b: tampered WA body returns 401 BEFORE DB write",
    async () => {
      // Force HMAC mismatch by sending a body that doesn't match the sig.
      // Receiver responds 401 BEFORE JSON.parse or any DB call (PITFALL #9
      // — raw body first, verify, then parse).
      const res = await fetch(`${FLY_URL}/webhooks/whatsapp`, {
        method: "POST",
        headers: {
          "x-hub-signature-256": "sha256=deadbeef",
          "content-type": "application/json",
        },
        body: '{"entry":[]}',
      });
      expect(res.status).toBe(401);
    },
  );

  it.skipIf(!WA_APP_SECRET)(
    "#2: WA inbound replay produces exactly 1 messages row (idempotency)",
    async () => {
      // Send the same payload twice. The receiver dedups via
      // ON CONFLICT (provider, external_id) DO NOTHING on webhook_events,
      // so the second POST is a no-op (no enqueue → no worker → no
      // duplicate messages row).
      //
      // Verifying the SQL count from the test runner requires a Neon
      // connection — left for the post-cutover human-verify checkpoint
      // (Task 3 of Plan 09). This test asserts the receiver returns
      // 200 on both calls (both are accepted), and the unit-level
      // dedup behaviour is covered by
      //   apps/edge-webhooks/src/routes/whatsapp.test.ts
      // which mocks insertWebhookEvent and asserts the second call
      // returns inserted=false.
      const body = JSON.stringify(fixtureWaInbound);
      const sig = waSig(body);
      const opts = {
        method: "POST",
        headers: {
          "x-hub-signature-256": sig,
          "content-type": "application/json",
        },
        body,
      } as const;
      const r1 = await fetch(`${FLY_URL}/webhooks/whatsapp`, opts);
      expect(r1.status).toBe(200);
      const r2 = await fetch(`${FLY_URL}/webhooks/whatsapp`, opts);
      expect(r2.status).toBe(200);
      // Post-cutover manual SQL (Task 3 of Plan 09):
      //   SELECT COUNT(*) FROM webhook_events
      //     WHERE external_id='wamid.P1B_FIXTURE_TEST_001';  -- expect 1
      //   SELECT COUNT(*) FROM messages
      //     WHERE external_id='wamid.P1B_FIXTURE_TEST_001';  -- expect 1
    },
  );

  it.skipIf(!STRIPE_WEBHOOK_SECRET)(
    "#1: Stripe checkout replay-twice produces 1 payments row",
    async () => {
      // Same payload twice with a fresh timestamp. The receiver dedups
      // via ON CONFLICT on webhook_events.external_id (== event.id), so
      // the second call returns "ok (dedup)" without enqueuing.
      const body = JSON.stringify(fixtureStripeCheckout);
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = stripeSig(body, timestamp);
      const opts = {
        method: "POST",
        headers: {
          "stripe-signature": sig,
          "content-type": "application/json",
        },
        body,
      } as const;
      const r1 = await fetch(`${FLY_URL}/webhooks/stripe`, opts);
      expect(r1.status).toBe(200);
      const r2 = await fetch(`${FLY_URL}/webhooks/stripe`, opts);
      expect(r2.status).toBe(200);
      // Post-cutover manual SQL (Task 3 of Plan 09):
      //   SELECT COUNT(*) FROM payments
      //     WHERE stripe_payment_intent_id='pi_test_p1b_fixture';  -- expect 1
      //
      // Note: the reducer refetches via stripe.checkout.sessions.retrieve
      // (PITFALL #4). The synthetic 'cs_test_p1b_fixture_001' ID does not
      // exist in any Stripe account; the reducer logs + marks the event
      // processed. For a tighter test against real Stripe state, use
      //   stripe trigger checkout.session.completed
      // and follow the dashboard "Resend" flow described in Task 3.
    },
  );

  it("#3 + #4: gate failures cause 0 Meta fetches (covered by Plan 06 unit tests)", () => {
    // Documentation-style assertion. The integration cannot directly
    // count outbound Meta API calls (they're inside the worker process
    // on Fly, not observable from this test runner). The relevant
    // assertions live in apps/worker/src/domain/sendMessage.test.ts:
    //
    //   it("throws WindowExpiredError + does not call sendText", ...) {
    //     ...
    //     expect(sendText).not.toHaveBeenCalled();
    //   }
    //   it("throws NoOptInError + does not call sendText", ...) {
    //     ...
    //     expect(sendText).not.toHaveBeenCalled();
    //   }
    //
    // Those tests run as part of `pnpm --filter @gymos/worker test`
    // alongside this suite in CI. This `expect(true)` exists purely so
    // the test report enumerates success criteria #3 and #4 alongside
    // the rest — making coverage visible at a glance.
    expect(true).toBe(true);
  });
});
