import { describe, it, expect, vi, beforeEach } from "vitest";

const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
};
const mockTx = { insert: vi.fn().mockReturnValue(insertChain) };

const subRetrieve = vi.fn();
const mockStripe = { subscriptions: { retrieve: subRetrieve } } as any;

vi.mock("../../lib/db.js", () => ({
  schema: {
    stripeSubscriptions: {
      stripeSubscriptionId: { name: "stripe_subscription_id" },
    },
  },
}));

import { subscriptionUpdated } from "./subscription-updated.js";

describe("subscriptionUpdated (STR-05)", () => {
  beforeEach(() => {
    insertChain.values.mockClear();
    insertChain.onConflictDoUpdate.mockClear();
    subRetrieve.mockReset();
  });

  it("refetches subscription from Stripe (PITFALL #4)", async () => {
    subRetrieve.mockResolvedValueOnce({
      id: "sub_abc",
      status: "active",
      current_period_end: 1700100000,
      metadata: { memberId: "mem_1" },
    });
    const event = { data: { object: { id: "sub_abc" } } } as any;
    await subscriptionUpdated(event, mockTx as any, mockStripe);
    expect(subRetrieve).toHaveBeenCalledWith("sub_abc");
  });

  it("uses onConflictDoUpdate on stripe_subscriptions (idempotency assertion — STR-07 replay safety)", async () => {
    subRetrieve.mockResolvedValueOnce({
      id: "sub_replay",
      status: "active",
      current_period_end: 1700100000,
      metadata: {},
    });
    const event = { data: { object: { id: "sub_replay" } } } as any;
    await subscriptionUpdated(event, mockTx as any, mockStripe);
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });
});
