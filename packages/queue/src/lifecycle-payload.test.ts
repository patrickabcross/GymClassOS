import { describe, it, expect } from "vitest";
import { MetaCapiEventPayload } from "./types.js";

// MC2-01 Task 1: lifecycle payload extension tests
// These tests verify the three new optional fields added to MetaCapiEventPayload.

const BASE_PAYLOAD = {
  eventId: "ev_abc123",
  memberId: "mem_001",
  eventName: "Purchase",
  actionSource: "system_generated",
  eventTime: 1750000000,
};

describe("MetaCapiEventPayload — MC2 lifecycle extension", () => {
  it("parses a payload with all three new fields (value, currency, stageKey)", () => {
    const result = MetaCapiEventPayload.safeParse({
      ...BASE_PAYLOAD,
      value: 29.99,
      currency: "gbp",
      stageKey: "purchase",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe(29.99);
      expect(result.data.currency).toBe("gbp");
      expect(result.data.stageKey).toBe("purchase");
    }
  });

  it("parses a payload with NONE of the three new fields (Contact/Schedule callers omit them)", () => {
    const result = MetaCapiEventPayload.safeParse(BASE_PAYLOAD);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBeUndefined();
      expect(result.data.currency).toBeUndefined();
      expect(result.data.stageKey).toBeUndefined();
    }
  });

  it("rejects stageKey that is not one of lead|contact|purchase|schedule", () => {
    const result = MetaCapiEventPayload.safeParse({
      ...BASE_PAYLOAD,
      stageKey: "checkout",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative value", () => {
    const result = MetaCapiEventPayload.safeParse({
      ...BASE_PAYLOAD,
      value: -1,
      currency: "gbp",
      stageKey: "purchase",
    });
    expect(result.success).toBe(false);
  });

  it("rejects currency whose length is not 3", () => {
    const result = MetaCapiEventPayload.safeParse({
      ...BASE_PAYLOAD,
      value: 9.99,
      currency: "gb",
      stageKey: "purchase",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all four valid stageKey values", () => {
    for (const stageKey of ["lead", "contact", "purchase", "schedule"] as const) {
      const result = MetaCapiEventPayload.safeParse({ ...BASE_PAYLOAD, stageKey });
      expect(result.success, `stageKey '${stageKey}' should be valid`).toBe(true);
    }
  });

  it("accepts zero value (free event)", () => {
    const result = MetaCapiEventPayload.safeParse({
      ...BASE_PAYLOAD,
      value: 0,
      currency: "usd",
      stageKey: "purchase",
    });
    expect(result.success).toBe(true);
  });
});
