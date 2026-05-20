import { describe, it, expect, vi } from "vitest";

// Mock the db module — it's the dependency we want to control.
// Vitest hoists vi.mock() calls so the mock factory runs BEFORE the
// idempotency.ts import below.
vi.mock("./db.js", () => {
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };
  return {
    getDb: () => ({ insert: vi.fn().mockReturnValue(insertChain) }),
    schema: {
      webhookEvents: {
        provider: { name: "provider" },
        externalId: { name: "external_id" },
        id: { name: "id" },
      },
    },
    __insertChain: insertChain,
  };
});

import { insertWebhookEvent } from "./idempotency.js";
const dbModule = await import("./db.js");
// @ts-expect-error — test-only export from the mock factory
const insertChain = dbModule.__insertChain;

describe("insertWebhookEvent", () => {
  it("returns inserted=true on new row (Stripe)", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "stripe:evt_1" }]);
    const result = await insertWebhookEvent({
      provider: "stripe",
      eventType: "checkout.session.completed",
      externalId: "evt_1",
      payloadRaw: "{}",
    });
    expect(result.inserted).toBe(true);
    expect(result.eventKey).toBe("stripe:evt_1");
  });

  it("returns inserted=false on conflict (WhatsApp dedup)", async () => {
    insertChain.returning.mockResolvedValueOnce([]);
    const result = await insertWebhookEvent({
      provider: "whatsapp",
      eventType: "messages.inbound",
      externalId: "wamid_abc",
      payloadRaw: "{}",
    });
    expect(result.inserted).toBe(false);
    expect(result.eventKey).toBe("whatsapp:wamid_abc");
  });

  it("honours idOverride when supplied", async () => {
    insertChain.returning.mockResolvedValueOnce([{ id: "custom-key" }]);
    const result = await insertWebhookEvent({
      provider: "stripe",
      eventType: "test",
      externalId: "evt_2",
      payloadRaw: "{}",
      idOverride: "custom-key",
    });
    expect(result.inserted).toBe(true);
    expect(result.eventKey).toBe("custom-key");
  });
});
