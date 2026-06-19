/**
 * apps/hq/actions/send-owner-whatsapp.test.ts
 *
 * Unit proof of structural member exclusion (D-08 / HQD-02).
 *
 * The send-owner-whatsapp action's Zod schema is .strict() and STRUCTURALLY
 * member-free. These tests assert:
 *   (a) Valid payloads parse successfully.
 *   (b) Any unknown field (memberId, memberEmail, memberPhone, to, etc.) throws
 *       ZodError at parse time — the field cannot be expressed, not just ignored.
 *   (c) Out-of-enum topics throw.
 *   (d) Discriminated-union payload shape is enforced.
 *
 * Tests import OwnerSendSchema directly (not the action's `run`) so no
 * getBoss()/getDb() infrastructure is needed.
 */

import { describe, it, expect } from "vitest";
import { OwnerSendSchema } from "./send-owner-whatsapp.js";

const VALID_TEXT_PAYLOAD = {
  studioId: "studio-abc",
  topic: "system_update" as const,
  payload: { type: "text" as const, body: "Hello gym owner." },
};

const VALID_TEMPLATE_PAYLOAD = {
  studioId: "studio-abc",
  topic: "feature_announcement" as const,
  payload: {
    type: "template" as const,
    name: "onboarding_v1",
    vars: { ownerName: "Alice" },
    language: "en_US",
  },
};

describe("OwnerSendSchema — structural member exclusion (.strict())", () => {
  // ── Happy-path parses ────────────────────────────────────────────────────

  it("parses a valid text payload", () => {
    expect(() => OwnerSendSchema.parse(VALID_TEXT_PAYLOAD)).not.toThrow();
    const result = OwnerSendSchema.parse(VALID_TEXT_PAYLOAD);
    expect(result.studioId).toBe("studio-abc");
    expect(result.payload.type).toBe("text");
  });

  it("parses a valid template payload", () => {
    expect(() => OwnerSendSchema.parse(VALID_TEMPLATE_PAYLOAD)).not.toThrow();
    const result = OwnerSendSchema.parse(VALID_TEMPLATE_PAYLOAD);
    expect(result.payload.type).toBe("template");
  });

  it("template payload defaults language to en_US when omitted", () => {
    const input = {
      ...VALID_TEMPLATE_PAYLOAD,
      payload: {
        type: "template" as const,
        name: "onboarding_v1",
        vars: {},
      },
    };
    const result = OwnerSendSchema.parse(input);
    if (result.payload.type === "template") {
      expect(result.payload.language).toBe("en_US");
    }
  });

  it("accepts all valid topic enum values", () => {
    const topics = [
      "system_update",
      "feature_announcement",
      "onboarding_guidance",
      "performance_insight",
      "billing_notice",
    ] as const;
    for (const topic of topics) {
      expect(() =>
        OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, topic }),
      ).not.toThrow();
    }
  });

  // ── Structural member exclusion — CRITICAL D-08 ──────────────────────────
  // .strict() means ANY unknown field throws ZodError. There is no way to
  // express a member target through this schema.

  it("[D-08] rejects an unknown field: memberId (structural exclusion proof)", () => {
    expect(() =>
      OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, memberId: "member-xyz" }),
    ).toThrow();
  });

  it("[D-08] rejects an unknown field: memberEmail", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        memberEmail: "member@gym.com",
      }),
    ).toThrow();
  });

  it("[D-08] rejects an unknown field: memberPhone", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        memberPhone: "+1555000123",
      }),
    ).toThrow();
  });

  it("[D-08] rejects an unknown field: to (raw recipient override attempt)", () => {
    expect(() =>
      OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, to: "+1555000123" }),
    ).toThrow();
  });

  it("[D-08] rejects any unknown field added to an otherwise valid payload", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        extraField: "sneaky",
      }),
    ).toThrow();
  });

  // ── Topic enum enforcement ────────────────────────────────────────────────

  it("rejects an invalid topic", () => {
    expect(() =>
      OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, topic: "free_text" }),
    ).toThrow();
  });

  it("rejects an empty-string topic", () => {
    expect(() =>
      OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, topic: "" }),
    ).toThrow();
  });

  // ── Discriminated union payload enforcement ───────────────────────────────

  it("rejects a text payload without body", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        payload: { type: "text" },
      }),
    ).toThrow();
  });

  it("rejects a template payload without name", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        payload: { type: "template", vars: {} },
      }),
    ).toThrow();
  });

  it("rejects a payload with an unknown type discriminant", () => {
    expect(() =>
      OwnerSendSchema.parse({
        ...VALID_TEXT_PAYLOAD,
        payload: { type: "media", url: "https://example.com/img.png" },
      }),
    ).toThrow();
  });

  // ── Required field validation ─────────────────────────────────────────────

  it("rejects an empty studioId", () => {
    expect(() =>
      OwnerSendSchema.parse({ ...VALID_TEXT_PAYLOAD, studioId: "" }),
    ).toThrow();
  });

  it("rejects missing studioId", () => {
    const { studioId: _unused, ...rest } = VALID_TEXT_PAYLOAD;
    expect(() => OwnerSendSchema.parse(rest)).toThrow();
  });
});
