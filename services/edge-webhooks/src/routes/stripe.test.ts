import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env — Vitest hoists vi.mock() above all imports below.
vi.mock("../lib/env.js", () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: "sk_test_xxx",
    STRIPE_WEBHOOK_SECRET: "whsec_xxx",
    WHATSAPP_VERIFY_TOKEN: "demo",
    WHATSAPP_APP_SECRET: "demo",
    DATABASE_URL: "postgres://x",
    DATABASE_URL_UNPOOLED: "postgres://x",
    GIT_SHA: "test",
    NODE_ENV: "test",
    PORT: 3001,
  }),
}));

// vi.mock is hoisted above all imports; mock fns must be hoisted with vi.hoisted
// so they exist before the mock factories run.
const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  insertWebhookEvent: vi.fn(),
  enqueueStripeEvent: vi.fn(),
  enqueueInboundWhatsApp: vi.fn(),
}));

vi.mock("../lib/stripe.js", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
  STRIPE_API_VERSION: "test-version",
}));

vi.mock("../lib/idempotency.js", () => ({
  insertWebhookEvent: mocks.insertWebhookEvent,
}));

vi.mock("@gymos/queue", () => ({
  enqueueStripeEvent: mocks.enqueueStripeEvent,
  enqueueInboundWhatsApp: mocks.enqueueInboundWhatsApp,
}));

const { constructEvent, insertWebhookEvent, enqueueStripeEvent } = mocks;

import { buildApp } from "../server.js";

describe("POST /webhooks/stripe", () => {
  beforeEach(() => {
    constructEvent.mockReset();
    insertWebhookEvent.mockReset();
    enqueueStripeEvent.mockReset();
  });

  it("returns 400 for tampered body (BEFORE any DB write)", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
    const app = buildApp();
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=bad" },
      body: '{"id":"evt_tampered"}',
    });
    expect(res.status).toBe(400);
    expect(insertWebhookEvent).not.toHaveBeenCalled();
    expect(enqueueStripeEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when stripe-signature header missing", async () => {
    const app = buildApp();
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("returns 200 and enqueues on new event", async () => {
    constructEvent.mockReturnValue({
      id: "evt_abc",
      type: "checkout.session.completed",
    });
    insertWebhookEvent.mockResolvedValue({
      inserted: true,
      eventKey: "stripe:evt_abc",
    });
    const app = buildApp();
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=good" },
      body: '{"id":"evt_abc"}',
    });
    expect(res.status).toBe(200);
    expect(enqueueStripeEvent).toHaveBeenCalledWith({ eventId: "evt_abc" });
  });

  it("returns 200 but skips enqueue on duplicate", async () => {
    constructEvent.mockReturnValue({
      id: "evt_dup",
      type: "checkout.session.completed",
    });
    insertWebhookEvent.mockResolvedValue({
      inserted: false,
      eventKey: "stripe:evt_dup",
    });
    const app = buildApp();
    const res = await app.request("/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=good" },
      body: '{"id":"evt_dup"}',
    });
    expect(res.status).toBe(200);
    expect(enqueueStripeEvent).not.toHaveBeenCalled();
  });
});

describe("GET /healthz", () => {
  it("returns 200 with ok + version", async () => {
    const app = buildApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      version: string;
      app: string;
    };
    expect(json.ok).toBe(true);
    expect(json.version).toBe("test");
    expect(json.app).toBe("edge-webhooks");
  });
});
