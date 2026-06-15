import { describe, it, expect, vi, beforeEach } from "vitest";

const subInsertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
};
const paymentsInsertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
};
let insertCount = 0;
const mockTx = {
  insert: vi.fn().mockImplementation(() => {
    insertCount += 1;
    // First insert = subscriptions (upsert); second = payments (do-nothing)
    return insertCount === 1 ? subInsertChain : paymentsInsertChain;
  }),
};

const invoiceRetrieve = vi.fn();
const subRetrieve = vi.fn();
const mockStripe = {
  invoices: { retrieve: invoiceRetrieve },
  subscriptions: { retrieve: subRetrieve },
} as any;

vi.mock("../../lib/db.js", () => ({
  schema: {
    stripeSubscriptions: {
      stripeSubscriptionId: { name: "stripe_subscription_id" },
    },
    payments: { stripePaymentIntentId: { name: "stripe_payment_intent_id" } },
  },
}));

import { invoicePaid } from "./invoice-paid.js";

describe("invoicePaid (STR-04)", () => {
  beforeEach(() => {
    subInsertChain.values.mockClear();
    subInsertChain.onConflictDoUpdate.mockClear();
    paymentsInsertChain.values.mockClear();
    paymentsInsertChain.onConflictDoNothing.mockClear();
    invoiceRetrieve.mockReset();
    subRetrieve.mockReset();
    insertCount = 0;
  });

  it("passes { stripeAccount } to both stripe.invoices.retrieve and stripe.subscriptions.retrieve (Pitfall 3 + P1c.1-03)", async () => {
    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_x",
      subscription: "sub_x",
      customer: "cus_x",
      payment_intent: "pi_x",
      amount_paid: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: {},
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_x",
      status: "active",
      current_period_end: 1700100000,
      metadata: { memberId: "mem_sub" },
    });
    const event = { data: { object: { id: "in_x" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe, "acct_connect");
    // Both retrieves must carry { stripeAccount } as their final arg
    expect(invoiceRetrieve).toHaveBeenCalledWith(
      "in_x",
      expect.any(Object),
      { stripeAccount: "acct_connect" },
    );
    expect(subRetrieve).toHaveBeenCalledWith(
      "sub_x",
      {},
      { stripeAccount: "acct_connect" },
    );
  });

  it("platform event (stripeAccount undefined): both retrieves called without stripeAccount header", async () => {
    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_platform",
      subscription: "sub_platform",
      customer: "cus_p",
      payment_intent: "pi_platform",
      amount_paid: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: {},
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_platform",
      status: "active",
      current_period_end: 1700100000,
      metadata: {},
    });
    const event = { data: { object: { id: "in_platform" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe);
    expect(invoiceRetrieve).toHaveBeenCalledWith(
      "in_platform",
      expect.any(Object),
      undefined,
    );
    expect(subRetrieve).toHaveBeenCalledWith("sub_platform", {}, undefined);
  });

  it("refetches invoice AND subscription from Stripe (PITFALL #4)", async () => {
    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_x",
      subscription: "sub_x",
      customer: "cus_x",
      payment_intent: "pi_x",
      amount_paid: 5000,
      currency: "gbp",
      created: 1700000000,
      metadata: {},
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_x",
      status: "active",
      current_period_end: 1700100000,
      metadata: { memberId: "mem_sub" },
    });
    const event = { data: { object: { id: "in_x" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe);
    expect(invoiceRetrieve).toHaveBeenCalledWith("in_x", expect.any(Object), undefined);
    expect(subRetrieve).toHaveBeenCalled();
  });

  it("uses onConflictDoNothing on payments and onConflictDoUpdate on subscriptions (idempotency assertion — STR-07 replay safety)", async () => {
    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_replay",
      subscription: "sub_replay",
      customer: "cus_replay",
      payment_intent: "pi_replay",
      amount_paid: 1000,
      currency: "gbp",
      created: 1700000000,
      metadata: {},
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_replay",
      status: "active",
      current_period_end: 1700100000,
      metadata: {},
    });
    const event = { data: { object: { id: "in_replay" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe);
    expect(subInsertChain.onConflictDoUpdate).toHaveBeenCalled();
    expect(paymentsInsertChain.onConflictDoNothing).toHaveBeenCalled();
  });
});
