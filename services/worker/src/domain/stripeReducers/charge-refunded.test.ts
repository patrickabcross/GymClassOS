import { describe, it, expect, vi, beforeEach } from "vitest";

const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi
    .fn()
    .mockResolvedValue([
      { id: "pass_pi_abc_li_1", granted: 10, stripeChargeId: "pi_abc" },
    ]),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });
const mockTx = {
  select: vi.fn().mockReturnValue(selectChain),
  update: vi.fn().mockReturnValue(updateChain),
  execute: executeMock,
};

const chargeRetrieve = vi.fn();
const mockStripe = { charges: { retrieve: chargeRetrieve } } as any;

vi.mock("../../lib/db.js", () => ({
  schema: {
    passes: { stripeChargeId: { name: "stripe_charge_id" } },
    payments: { stripePaymentIntentId: { name: "stripe_payment_intent_id" } },
  },
}));

import { chargeRefunded } from "./charge-refunded.js";

describe("chargeRefunded (STR-06)", () => {
  beforeEach(() => {
    executeMock.mockClear();
    updateChain.set.mockClear();
    chargeRetrieve.mockReset();
  });

  it("refetches charge from Stripe (PITFALL #4)", async () => {
    chargeRetrieve.mockResolvedValueOnce({
      id: "ch_refund_1",
      payment_intent: "pi_abc",
    });
    const event = { data: { object: { id: "ch_refund_1" } } } as any;
    await chargeRefunded(event, mockTx as any, mockStripe);
    // Called with (id, {}, opts) — opts is undefined for platform events
    expect(chargeRetrieve).toHaveBeenCalledWith("ch_refund_1", {}, undefined);
  });

  it("inserts negative pass_debits entry with deterministic ID + ON CONFLICT DO NOTHING (idempotency assertion)", async () => {
    chargeRetrieve.mockResolvedValueOnce({
      id: "ch_refund_1",
      payment_intent: "pi_abc",
    });
    const event = { data: { object: { id: "ch_refund_1" } } } as any;
    await chargeRefunded(event, mockTx as any, mockStripe);
    const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
    expect(sqlStr).toContain("pass_debits");
    expect(sqlStr).toContain("pdebit_refund_ch_refund_1_pass_pi_abc_li_1");
    expect(sqlStr).toContain("ON CONFLICT");
    // amount is -10 (the negative of pass.granted=10)
    expect(sqlStr).toContain("-10");
  });

  it("marks payments.status='refunded' for the payment_intent", async () => {
    chargeRetrieve.mockResolvedValueOnce({
      id: "ch_x",
      payment_intent: "pi_y",
    });
    const event = { data: { object: { id: "ch_x" } } } as any;
    await chargeRefunded(event, mockTx as any, mockStripe);
    const setArgs = updateChain.set.mock.calls[0][0];
    expect(setArgs.status).toBe("refunded");
  });
});
