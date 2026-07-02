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

// executeMock handles the pass_types SELECT and the passes INSERT.
// Default: { rows: [] } → lookupPassTypeByPrice returns null → no pass granted.
const executeMock = vi.fn().mockResolvedValue({ rows: [] });

const mockTx = {
  insert: vi.fn().mockImplementation(() => {
    insertCount += 1;
    // First insert = subscriptions (upsert); second = payments (do-nothing)
    return insertCount === 1 ? subInsertChain : paymentsInsertChain;
  }),
  execute: executeMock,
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
    // Reset both call history AND the once-queue so tests don't bleed into each other.
    executeMock.mockReset().mockResolvedValue({ rows: [] });
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

  // -------------------------------------------------------------------------
  // NEW: pass_type-driven grant cases (added in quick-260702-g8f)
  // -------------------------------------------------------------------------

  it("pass_type match: grants pass on invoice.paid with deterministic id pass_sub_<invoiceId>", async () => {
    // First execute call = pass_types SELECT → matching pass_type row
    executeMock.mockResolvedValueOnce({
      rows: [{ id: "unlimited", name: "Unlimited", credits: null, validity_days: null }],
    });

    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_typed",
      subscription: "sub_typed",
      customer: "cus_typed",
      payment_intent: "pi_typed",
      amount_paid: 8500,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_typed" },
      lines: {
        data: [{ period: { end: 1702692000 } }],
      },
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_typed",
      status: "active",
      current_period_end: 1702692000,
      metadata: { memberId: "mem_typed" },
      items: {
        data: [
          {
            price: { id: "price_unlimited" },
            current_period_end: 1702692000,
          },
        ],
      },
    });

    const event = { data: { object: { id: "in_typed" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe, "acct_connect");

    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeDefined();
    const sqlStr = JSON.stringify(insertCall![0]);
    // Deterministic id: pass_sub_<invoiceId>
    expect(sqlStr).toContain("pass_sub_in_typed");
    // credits null → granted = 999 (unlimited sentinel)
    expect(sqlStr).toContain("999");
    // pass_type_id stamped
    expect(sqlStr).toContain("unlimited");
    // source = subscription
    expect(sqlStr).toContain("subscription");
    // Idempotency guard
    expect(sqlStr).toContain("ON CONFLICT");
    expect(sqlStr).toContain("DO NOTHING");
  });

  it("replay invoice.paid: INSERT uses deterministic pass_sub_<invoiceId> + ON CONFLICT DO NOTHING (idempotent)", async () => {
    // First execute call = pass_types SELECT → matching row
    executeMock.mockResolvedValueOnce({
      rows: [{ id: "one_per_week", name: "1 Session / Week", credits: 5, validity_days: 30 }],
    });

    invoiceRetrieve.mockResolvedValueOnce({
      id: "in_idempotent",
      subscription: "sub_idempotent",
      customer: "cus_idp",
      payment_intent: "pi_idp",
      amount_paid: 4400,
      currency: "gbp",
      created: 1700000000,
      metadata: { memberId: "mem_idp" },
      lines: { data: [{ period: { end: 1702692000 } }] },
    });
    subRetrieve.mockResolvedValueOnce({
      id: "sub_idempotent",
      status: "active",
      current_period_end: 1702692000,
      metadata: { memberId: "mem_idp" },
      items: {
        data: [
          {
            price: { id: "price_one_per_week" },
            current_period_end: 1702692000,
          },
        ],
      },
    });

    const event = { data: { object: { id: "in_idempotent" } } } as any;
    await invoicePaid(event, mockTx as any, mockStripe, "acct_connect");

    const insertCall = executeMock.mock.calls.find((c) =>
      JSON.stringify(c[0]).includes("INSERT INTO passes"),
    );
    expect(insertCall).toBeDefined();
    const sqlStr = JSON.stringify(insertCall![0]);
    // Deterministic id keyed on invoice id — same on replay, ON CONFLICT deduplicates at DB
    expect(sqlStr).toContain("pass_sub_in_idempotent");
    expect(sqlStr).toContain("ON CONFLICT");
    expect(sqlStr).toContain("DO NOTHING");
    // Limited credits: granted = 5 (from pass_type.credits)
    expect(sqlStr).toContain("one_per_week"); // pass_type_id
  });
});
