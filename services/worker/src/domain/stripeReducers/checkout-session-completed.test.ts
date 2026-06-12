import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
};
const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });
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
    executeMock.mockClear();
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
});
