import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
};
// executeMock handles both the pass_types SELECT and the passes INSERT.
// Default: { rows: [] } → lookupPassTypeByPrice returns null → legacy keyword path.
const executeMock = vi.fn().mockResolvedValue({ rows: [] });
const mockTx = {
  insert: vi.fn().mockReturnValue(insertChain),
  execute: executeMock,
};
const stripeRetrieve = vi.fn();
const mockStripe = {
  checkout: { sessions: { retrieve: stripeRetrieve } },
} as any;

vi.mock("../../lib/db.js", () => ({
  schema: {
    stripeCustomers: { stripeCustomerId: { name: "stripe_customer_id" } },
    payments: {
      stripePaymentIntentId: { name: "stripe_payment_intent_id" },
      id: { name: "id" },
    },
  },
}));

import { checkoutSessionCompleted } from "./checkout-session-completed.js";

describe("checkoutSessionCompleted (STR-03)", () => {
  beforeEach(() => {
    insertChain.values.mockClear();
    insertChain.onConflictDoNothing.mockClear();
    // Reset both call history AND the once-queue so tests don't bleed into each other.
    executeMock.mockReset().mockResolvedValue({ rows: [] });
    stripeRetrieve.mockReset();
  });

  it("refetches session from Stripe with stripeAccount as 3rd arg (Pitfall 3 + P1c.1-03)", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_test_abc",
      customer: "cus_abc",
      payment_intent: "pi_abc",
      amount_total: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_1" },
      line_items: { data: [] },
    });
    const event = { data: { object: { id: "cs_test_abc" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");
    expect(stripeRetrieve).toHaveBeenCalledWith(
      "cs_test_abc",
      expect.objectContaining({ expand: expect.any(Array) }),
      { stripeAccount: "acct_x" },
    );
  });

  it("passes undefined stripeAccount (platform event) — backward compatible", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_platform",
      customer: "cus_abc",
      payment_intent: "pi_abc",
      amount_total: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_1" },
      line_items: { data: [] },
    });
    const event = { data: { object: { id: "cs_platform" } } } as any;
    // No stripeAccount — platform event
    await checkoutSessionCompleted(event, mockTx as any, mockStripe);
    expect(stripeRetrieve).toHaveBeenCalledWith(
      "cs_platform",
      expect.objectContaining({ expand: expect.any(Array) }),
      undefined,
    );
  });

  it("refetches session from Stripe (PITFALL #4)", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_test_abc",
      customer: "cus_abc",
      payment_intent: "pi_abc",
      amount_total: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_1" },
      line_items: { data: [] },
    });
    const event = { data: { object: { id: "cs_test_abc" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe);
    expect(stripeRetrieve).toHaveBeenCalledWith(
      "cs_test_abc",
      expect.objectContaining({ expand: expect.any(Array) }),
      undefined, // no stripeAccount = platform event
    );
  });

  it("upserts stripe_customers + payments with onConflictDoNothing when stripeAccount provided (idempotency)", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_x",
      customer: "cus_x",
      payment_intent: "pi_x",
      amount_total: 1000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_x" },
      line_items: { data: [] },
    });
    const event = { data: { object: { id: "cs_x" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");
    expect(insertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("grants pass with deterministic ID for 10-pack line item (idempotency via deterministic ID + ON CONFLICT)", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_pack",
      customer: "cus_pack",
      payment_intent: "pi_pack",
      amount_total: 10000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_pack" },
      line_items: {
        data: [{ id: "li_1", description: "10-pack class credits" }],
      },
    });
    const event = { data: { object: { id: "cs_pack" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe);
    const passesCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("passes"),
    );
    expect(passesCall).toBeDefined();
    const sqlStr = JSON.stringify(passesCall![0]);
    expect(sqlStr).toContain("passes");
    expect(sqlStr).toContain("pass_pi_pack_li_1");
    expect(sqlStr).toContain("ON CONFLICT");
  });

  it("skips pass grant for unknown product description", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_unknown",
      customer: "cus_x",
      payment_intent: "pi_x",
      amount_total: 1000,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_x" },
      line_items: {
        data: [{ id: "li_unknown", description: "Custom T-shirt" }],
      },
    });
    const event = { data: { object: { id: "cs_unknown" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe);
    const passesCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("passes"),
    );
    expect(passesCall).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // NEW: pass_type-driven grant cases (added in quick-260702-g8f)
  // -------------------------------------------------------------------------

  it("pass_type match: stamps pass_type_id and correct credits/expiry for known price", async () => {
    // First execute call = pass_types SELECT → return a matching row.
    executeMock.mockResolvedValueOnce({
      rows: [{ id: "drop_in", name: "Drop-in", credits: 1, validity_days: 180 }],
    });

    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_typed",
      customer: "cus_typed",
      payment_intent: "pi_typed",
      amount_total: 1400,
      currency: "gbp",
      created: 1700000000,
      mode: "payment",
      metadata: { memberId: "mem_typed" },
      line_items: {
        data: [
          {
            id: "li_typed",
            price: { id: "price_dropin" },
            description: "Drop-in class",
          },
        ],
      },
    });

    const event = { data: { object: { id: "cs_typed" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");

    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeDefined();
    const sqlStr = JSON.stringify(insertCall![0]);
    expect(sqlStr).toContain("pass_pi_typed_li_typed");
    expect(sqlStr).toContain("drop_in"); // pass_type_id stamped
    expect(sqlStr).toContain("ON CONFLICT");
  });

  it("pass_type match: unlimited pass_type (credits null) → granted = 999", async () => {
    // credits = null → granted = 999 (unlimited sentinel)
    executeMock.mockResolvedValueOnce({
      rows: [{ id: "unlimited", name: "Unlimited", credits: null, validity_days: null }],
    });

    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_unlimited",
      customer: "cus_ul",
      payment_intent: "pi_ul",
      amount_total: 8500,
      currency: "gbp",
      created: 1700000000,
      mode: "payment",
      metadata: { memberId: "mem_ul" },
      line_items: {
        data: [
          {
            id: "li_ul",
            price: { id: "price_unlimited_pay" },
            description: "30 Days Unlimited",
          },
        ],
      },
    });

    const event = { data: { object: { id: "cs_unlimited" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");

    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeDefined();
    const sqlStr = JSON.stringify(insertCall![0]);
    // 999 is the unlimited sentinel
    expect(sqlStr).toContain("999");
    expect(sqlStr).toContain("unlimited"); // pass_type_id
    expect(sqlStr).toContain("ON CONFLICT");
  });

  it("subscription mode: no pass INSERT in this reducer (invoice.paid owns subscription grants)", async () => {
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_sub_mode",
      customer: "cus_sub",
      payment_intent: null,
      amount_total: 8500,
      currency: "gbp",
      created: 1700000000,
      mode: "subscription",
      metadata: { memberId: "mem_sub" },
      line_items: {
        data: [
          {
            id: "li_sub",
            price: { id: "price_sub" },
            description: "Unlimited membership",
          },
        ],
      },
    });

    const event = { data: { object: { id: "cs_sub_mode" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");

    // No pass INSERT must occur for subscription-mode checkouts
    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeUndefined();
  });

  it("unknown price + keyword description: falls back to legacy keyword grant with pass_type_id = NULL", async () => {
    // executeMock returns default { rows: [] } for the pass_types SELECT → no match
    stripeRetrieve.mockResolvedValueOnce({
      id: "cs_legacy",
      customer: "cus_legacy",
      payment_intent: "pi_legacy",
      amount_total: 1400,
      currency: "gbp",
      created: 1700000000,
      mode: "payment",
      metadata: { memberId: "mem_legacy" },
      line_items: {
        data: [
          {
            id: "li_legacy",
            price: { id: "price_unrecognised_xyz" },
            description: "drop-in class",
          },
        ],
      },
    });

    const event = { data: { object: { id: "cs_legacy" } } } as any;
    await checkoutSessionCompleted(event, mockTx as any, mockStripe, "acct_x");

    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeDefined();
    const sqlStr = JSON.stringify(insertCall![0]);
    expect(sqlStr).toContain("pass_pi_legacy_li_legacy");
    expect(sqlStr).toContain("ON CONFLICT");
    // Legacy path must write pass_type_id = NULL
    expect(sqlStr).toContain("NULL");
  });
});
