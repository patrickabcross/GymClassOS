import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// Mock env — Vitest hoists vi.mock() above all imports below.
vi.mock("../lib/env.js", () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    WHATSAPP_VERIFY_TOKEN: "demo_token",
    WHATSAPP_APP_SECRET: "demo_secret",
    PGCRYPTO_MASTER_KEY: "test-master-key-1234567890abcdef",
    DATABASE_URL: "postgres://x",
    DATABASE_URL_UNPOOLED: "postgres://x",
    GIT_SHA: "test",
    NODE_ENV: "test",
    PORT: 3001,
  }),
}));

// Mock the secrets module so tests don't hit the DB.
// Returns the env-fallback values directly (same values the env mock provides).
vi.mock("../lib/secrets.js", () => ({
  getWhatsAppVerifyToken: vi.fn().mockResolvedValue("demo_token"),
  getWhatsAppAppSecret: vi.fn().mockResolvedValue("demo_secret"),
  _resetSecretsCacheForTests: vi.fn(),
  readSecret: vi.fn().mockResolvedValue(null),
}));

// Mock DB so getDb() doesn't attempt a real Neon connection.
vi.mock("../lib/db.js", () => ({
  getDb: vi.fn().mockReturnValue({}),
  _resetDbForTests: vi.fn(),
}));

// vi.mock is hoisted above all imports; mock fns must be hoisted with vi.hoisted
// so they exist before the mock factories run.
const mocks = vi.hoisted(() => ({
  insertWebhookEvent: vi.fn(),
  enqueueInboundWhatsApp: vi.fn(),
  enqueueStripeEvent: vi.fn(),
}));

vi.mock("../lib/idempotency.js", () => ({
  insertWebhookEvent: mocks.insertWebhookEvent,
}));

vi.mock("@gymos/queue", () => ({
  enqueueInboundWhatsApp: mocks.enqueueInboundWhatsApp,
  enqueueStripeEvent: mocks.enqueueStripeEvent,
}));

const { insertWebhookEvent, enqueueInboundWhatsApp } = mocks;

import { buildApp } from "../server.js";

function validSig(body: string, secret: string): string {
  return (
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
  );
}

describe("GET /webhooks/whatsapp", () => {
  it("returns challenge on valid token", async () => {
    const app = buildApp();
    const res = await app.request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=demo_token&hub.challenge=test123",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("test123");
  });

  it("returns 403 on invalid token", async () => {
    const app = buildApp();
    const res = await app.request(
      "/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=test",
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /webhooks/whatsapp", () => {
  beforeEach(() => {
    insertWebhookEvent.mockReset();
    enqueueInboundWhatsApp.mockReset();
  });

  it("returns 401 on bad HMAC", async () => {
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=bad" },
      body: '{"entry":[]}',
    });
    expect(res.status).toBe(401);
    expect(insertWebhookEvent).not.toHaveBeenCalled();
  });

  it("enqueues STRUCTURED message payload on valid inbound (HIGH #6)", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "whatsapp:wamid_abc",
    });
    // No metadata.phone_number_id → direction defaults to "in"
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid_abc",
                    from: "447700900000",
                    type: "text",
                    text: { body: "hi" },
                    timestamp: "1700000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).toHaveBeenCalledWith({
      kind: "message",
      externalId: "wamid_abc",
      from: "447700900000",
      messageType: "text",
      body: "hi",
      timestamp: "1700000000",
      direction: "in",
    });
  });

  it("detects outbound mirror: enqueues direction='out' + customerWaId when msg.from === phone_number_id", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "whatsapp:wamid_outbound_mirror",
    });
    // Business number 302631896256150 is the sender → outbound mirror
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "302631896256150" },
                contacts: [{ wa_id: "447700900001" }],
                messages: [
                  {
                    id: "wamid_outbound_mirror",
                    from: "302631896256150",
                    type: "text",
                    text: { body: "Great session!" },
                    timestamp: "1700000100",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).toHaveBeenCalledWith({
      kind: "message",
      externalId: "wamid_outbound_mirror",
      from: "302631896256150",
      messageType: "text",
      body: "Great session!",
      timestamp: "1700000100",
      direction: "out",
      customerWaId: "447700900001",
    });
  });

  it("customer inbound with metadata present stays direction='in'", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "whatsapp:wamid_cust_inbound",
    });
    // Customer sends (from !== phone_number_id) → direction must stay "in"
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "302631896256150" },
                contacts: [{ wa_id: "447700900002" }],
                messages: [
                  {
                    id: "wamid_cust_inbound",
                    from: "447700900002",
                    type: "text",
                    text: { body: "What time is the class?" },
                    timestamp: "1700000200",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: "in",
        from: "447700900002",
      }),
    );
  });

  it("enqueues STRUCTURED status payload on valid status webhook (HIGH #6)", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "whatsapp:wamid_status_...",
    });
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid_outbound_XYZ",
                    status: "delivered",
                    timestamp: "1700000001",
                    recipient_id: "447700900000",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).toHaveBeenCalledWith({
      kind: "status",
      statusFor: "wamid_outbound_XYZ",
      newStatus: "delivered",
      timestamp: "1700000001",
      errorCode: undefined,
    });
  });

  it("propagates errorCode for failed status (HIGH #6)", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "whatsapp:wamid_status_failed",
    });
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid_outbound_FAIL",
                    status: "failed",
                    timestamp: "1700000002",
                    errors: [{ code: 131047, title: "Re-engagement message" }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).toHaveBeenCalledWith({
      kind: "status",
      statusFor: "wamid_outbound_FAIL",
      newStatus: "failed",
      timestamp: "1700000002",
      errorCode: "131047",
    });
  });

  it("skips enqueue on duplicate (idempotency)", async () => {
    insertWebhookEvent.mockResolvedValue({
      inserted: false,
      eventKey: "whatsapp:wamid_dup",
    });
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid_dup",
                    from: "1",
                    type: "text",
                    text: { body: "x" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const sig = validSig(body, "demo_secret");
    const app = buildApp();
    const res = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": sig },
      body,
    });
    expect(res.status).toBe(200);
    expect(enqueueInboundWhatsApp).not.toHaveBeenCalled();
  });
});
