import { describe, it, expect } from "vitest";
import {
  OutboundWhatsAppPayload,
  InboundWhatsAppPayload,
  StripeEventPayload,
  QUEUE_NAMES,
} from "./types.js";

describe("payload schemas", () => {
  it("OutboundWhatsAppPayload accepts text send", () => {
    const result = OutboundWhatsAppPayload.safeParse({
      messageId: "msg_abc",
      memberId: "mem_1",
      payload: { type: "text", body: "hi" },
    });
    expect(result.success).toBe(true);
  });

  it("OutboundWhatsAppPayload rejects empty body", () => {
    const result = OutboundWhatsAppPayload.safeParse({
      messageId: "msg_abc",
      memberId: "mem_1",
      payload: { type: "text", body: "" },
    });
    expect(result.success).toBe(false);
  });

  it("OutboundWhatsAppPayload accepts template send", () => {
    const result = OutboundWhatsAppPayload.safeParse({
      messageId: "msg_abc",
      memberId: "mem_1",
      payload: {
        type: "template",
        name: "class_reminder",
        vars: { 1: "Yoga", 2: "07:00" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("StripeEventPayload rejects non-evt_ IDs", () => {
    const result = StripeEventPayload.safeParse({ eventId: "abc123" });
    expect(result.success).toBe(false);
  });

  it("StripeEventPayload accepts evt_ IDs", () => {
    const result = StripeEventPayload.safeParse({ eventId: "evt_test_abc" });
    expect(result.success).toBe(true);
  });

  it("InboundWhatsAppPayload accepts message variant", () => {
    const result = InboundWhatsAppPayload.safeParse({
      kind: "message",
      externalId: "wamid.ABC",
      from: "447700900000",
      messageType: "text",
      body: "hi",
      timestamp: "1700000000",
    });
    expect(result.success).toBe(true);
  });

  it("InboundWhatsAppPayload accepts status variant with explicit fields (HIGH #6)", () => {
    const result = InboundWhatsAppPayload.safeParse({
      kind: "status",
      statusFor: "wamid.XYZ",
      newStatus: "delivered",
      timestamp: "1700000000",
      errorCode: undefined,
    });
    expect(result.success).toBe(true);
  });

  it("InboundWhatsAppPayload status variant rejects unknown newStatus", () => {
    const result = InboundWhatsAppPayload.safeParse({
      kind: "status",
      statusFor: "wamid.XYZ",
      newStatus: "exploded",
      timestamp: "1700000000",
    });
    expect(result.success).toBe(false);
  });

  it("InboundWhatsAppPayload rejects payloads without kind discriminator", () => {
    const result = InboundWhatsAppPayload.safeParse({
      externalId: "wamid.OLD",
      isStatus: false,
    });
    expect(result.success).toBe(false);
  });
});

describe("QUEUE_NAMES", () => {
  it("uses kebab-case queue names (D-13)", () => {
    expect(QUEUE_NAMES.OUTBOUND_WHATSAPP).toBe("outbound-whatsapp");
    expect(QUEUE_NAMES.INBOUND_WHATSAPP).toBe("inbound-whatsapp");
    expect(QUEUE_NAMES.STRIPE_EVENT).toBe("stripe-event");
  });
});
