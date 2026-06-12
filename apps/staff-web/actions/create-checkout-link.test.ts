/**
 * Tests for create-checkout-link action — Connect + subscription support.
 *
 * Strategy: vitest cannot import the `defineAction` wrapper (the @agent-native/core
 * module uses CJS React which ReferenceError: module is not defined in ESM vitest).
 * Tests instead assert the pure buildCheckoutParams helper that encodes the
 * session-building logic, and separately assert the guard logic via the exported
 * validateConnectedAccount helper.
 *
 * Tests cover:
 * 1. payment mode: { stripeAccount } 2nd arg, metadata.memberId, no subscription_data,
 *    no application_fee_*.
 * 2. subscription mode: subscription_data.metadata.memberId AND metadata.memberId
 *    (Pitfall 2), { stripeAccount } 2nd arg.
 * 3. null/chargesEnabled=false account → throws "not connected" error.
 */
import { describe, expect, it } from "vitest";
import {
  buildCheckoutParams,
  validateConnectedAccount,
} from "./create-checkout-link-helpers.js";

describe("buildCheckoutParams", () => {
  const BASE_URL = "https://gym-class-os.vercel.app";
  const acctId = "acct_test123";
  const memberId = "mbr_1";
  const priceId = "price_abc";

  // -------------------------------------------------------------------------
  // 1. payment mode
  // -------------------------------------------------------------------------
  it("payment mode: sets mode=payment, metadata.memberId, stripeAccount 2nd arg", () => {
    const { params, opts } = buildCheckoutParams({
      memberId,
      priceId,
      mode: "payment",
      acctId,
      baseUrl: BASE_URL,
    });

    // Second arg must be { stripeAccount }
    expect(opts).toMatchObject({ stripeAccount: "acct_test123" });

    expect(params.mode).toBe("payment");
    expect(params.metadata?.memberId).toBe(memberId);

    // NO subscription_data
    expect((params as any).subscription_data).toBeUndefined();

    // NO application_fee_*
    expect((params as any).application_fee_amount).toBeUndefined();
    expect((params as any).application_fee_percent).toBeUndefined();
  });

  it("payment mode: success/cancel URLs include memberId", () => {
    const { params } = buildCheckoutParams({
      memberId,
      priceId,
      mode: "payment",
      acctId,
      baseUrl: BASE_URL,
    });
    expect(params.success_url).toContain(memberId);
    expect(params.cancel_url).toContain(memberId);
  });

  // -------------------------------------------------------------------------
  // 2. subscription mode (Pitfall 2)
  // -------------------------------------------------------------------------
  it("subscription mode: sets subscription_data.metadata.memberId AND metadata.memberId", () => {
    const { params, opts } = buildCheckoutParams({
      memberId: "mbr_2",
      priceId: "price_sub",
      mode: "subscription",
      acctId,
      baseUrl: BASE_URL,
    });

    expect(opts).toMatchObject({ stripeAccount: "acct_test123" });
    expect(params.mode).toBe("subscription");

    // Pitfall 2: BOTH top-level metadata and subscription_data.metadata must be set
    expect(params.metadata?.memberId).toBe("mbr_2");
    expect((params as any).subscription_data?.metadata?.memberId).toBe("mbr_2");

    // NO application_fee_*
    expect((params as any).application_fee_amount).toBeUndefined();
    expect((params as any).application_fee_percent).toBeUndefined();
  });
});

describe("validateConnectedAccount", () => {
  // -------------------------------------------------------------------------
  // 3. Guard: null / chargesEnabled=false → throw "not connected"
  // -------------------------------------------------------------------------
  it("throws if account is null", () => {
    expect(() => validateConnectedAccount(null)).toThrow(/not connected/i);
  });

  it("throws if chargesEnabled is false", () => {
    expect(() =>
      validateConnectedAccount({
        id: "acct_test999",
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDue: ["id.front"],
        disabledReason: "requirements.past_due",
      }),
    ).toThrow(/not connected/i);
  });

  it("does not throw if chargesEnabled is true", () => {
    expect(() =>
      validateConnectedAccount({
        id: "acct_ok",
        chargesEnabled: true,
        payoutsEnabled: true,
        requirementsDue: [],
        disabledReason: null,
      }),
    ).not.toThrow();
  });
});
