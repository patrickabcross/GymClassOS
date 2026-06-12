import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for accountUpdated reducer (Plan P1c.1-03).
 *
 * Strategy: mock tx.execute and assert the SQL template was called with the
 * expected bound values.  We do NOT talk to a real DB — unit-test only.
 */

const executeMock = vi.fn().mockResolvedValue({ rowCount: 1 });
const mockTx = {
  execute: executeMock,
} as any;

const mockStripe = {} as any;

import { accountUpdated } from "./account-updated.js";

describe("accountUpdated (P1c.1-03 — account.updated reducer)", () => {
  beforeEach(() => {
    executeMock.mockClear();
  });

  it("calls tx.execute with an INSERT … ON CONFLICT upsert for a fully-enabled account", async () => {
    const event = {
      type: "account.updated",
      data: {
        object: {
          id: "acct_test_1",
          charges_enabled: true,
          payouts_enabled: true,
          requirements: {
            currently_due: [],
            disabled_reason: null,
          },
        },
      },
    } as any;

    await accountUpdated(event, mockTx, mockStripe, "acct_test_1");

    expect(executeMock).toHaveBeenCalledOnce();
    const sqlArg = executeMock.mock.calls[0][0];
    const sqlStr = JSON.stringify(sqlArg);
    // Verify the SQL targets connected_accounts and uses ON CONFLICT upsert
    expect(sqlStr).toContain("connected_accounts");
    expect(sqlStr).toContain("ON CONFLICT");
    // Bound values include the account ID
    expect(sqlStr).toContain("acct_test_1");
  });

  it("upserts chargesEnabled=false, requirementsDue when account is restricted", async () => {
    const event = {
      type: "account.updated",
      data: {
        object: {
          id: "acct_test_2",
          charges_enabled: false,
          payouts_enabled: false,
          requirements: {
            currently_due: ["external_account"],
            disabled_reason: "requirements.past_due",
          },
        },
      },
    } as any;

    await accountUpdated(event, mockTx, mockStripe, "acct_test_2");

    expect(executeMock).toHaveBeenCalledOnce();
    const sqlStr = JSON.stringify(executeMock.mock.calls[0][0]);
    // Bound values include the restriction details
    expect(sqlStr).toContain("acct_test_2");
    expect(sqlStr).toContain("external_account");
    expect(sqlStr).toContain("requirements.past_due");
  });

  it("accepts the (event, tx, stripe, stripeAccount?) signature for dispatch-table uniformity", async () => {
    const event = {
      type: "account.updated",
      data: {
        object: {
          id: "acct_test_3",
          charges_enabled: true,
          payouts_enabled: true,
          requirements: { currently_due: [], disabled_reason: null },
        },
      },
    } as any;

    // Calling WITHOUT stripeAccount should not throw (reads everything from event)
    await expect(
      accountUpdated(event, mockTx, mockStripe),
    ).resolves.toBeUndefined();

    // Calling WITH stripeAccount should also work (it's ignored but accepted)
    executeMock.mockClear();
    await expect(
      accountUpdated(event, mockTx, mockStripe, "acct_test_3"),
    ).resolves.toBeUndefined();
  });
});
