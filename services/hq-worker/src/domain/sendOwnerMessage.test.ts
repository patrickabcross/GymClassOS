import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockHqWabaClient } from "../lib/hq-waba-client.js";

// ─── Gate mocks ──────────────────────────────────────────────────────────────
// We mock the gate modules so tests can control each gate's outcome
// independently, exactly like the studio sendMessage tests pattern.
// This avoids needing a real db handle in the orchestrator tests.

const hasOwnerOptInMock = vi.fn<() => Promise<boolean>>();
const isOwnerInWindowMock = vi.fn<() => boolean>();
const isOwnerTemplateApprovedMock = vi.fn<() => Promise<boolean>>();

vi.mock("../lib/gates/ownerOptInGate.js", () => ({
  hasOwnerOptIn: hasOwnerOptInMock,
}));

vi.mock("../lib/gates/ownerWindowGate.js", () => ({
  isOwnerInWindow: isOwnerInWindowMock,
  OWNER_WINDOW_HOURS: 24,
}));

vi.mock("../lib/gates/ownerTemplateGate.js", () => ({
  isOwnerTemplateApproved: isOwnerTemplateApprovedMock,
}));

// ─── DB mock — provides the opt-in row for phone + lastInboundAt load ─────────
const optInRow = {
  phoneE164: "+15551234567",
  lastInboundAt: new Date("2026-06-19T10:00:00.000Z").toISOString(),
};
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};
const mockDb = { select: vi.fn().mockReturnValue(selectChain) };

vi.mock("../lib/db.js", () => ({
  getHqDb: () => mockDb,
  schema: {
    hqWhatsappOptIn: {
      studioId: { name: "studio_id" },
      phoneE164: { name: "phone_e164" },
      lastInboundAt: { name: "last_inbound_at" },
    },
  },
}));

const {
  sendOwnerMessage,
  OwnerNoOptInError,
  OwnerWindowExpiredError,
  OwnerTemplateNotApprovedError,
} = await import("./sendOwnerMessage.js");

describe("sendOwnerMessage (HQD-03, D-09 gate order)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: opt-in row returns the test phone + recent inbound
    selectChain.limit.mockResolvedValue([optInRow]);
  });

  // ─── Gate 1: opt-in ────────────────────────────────────────────────────────

  it("throws OwnerNoOptInError when hasOwnerOptIn is false", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(false);

    await expect(
      sendOwnerMessage({
        studioId: "studio_1",
        messageId: "msg_1",
        payload: { type: "text", body: "Hello" },
        db: mockDb as any,
        client: mockHqWabaClient,
      }),
    ).rejects.toThrow(OwnerNoOptInError);
  });

  // ─── Gate 2: 24h window (text messages only) ───────────────────────────────

  it("throws OwnerWindowExpiredError when text payload and lastInboundAt is out of window", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(true);
    isOwnerInWindowMock.mockReturnValueOnce(false);

    await expect(
      sendOwnerMessage({
        studioId: "studio_1",
        messageId: "msg_1",
        payload: { type: "text", body: "Hello" },
        db: mockDb as any,
        client: mockHqWabaClient,
      }),
    ).rejects.toThrow(OwnerWindowExpiredError);
  });

  // ─── Gate 3: approved template ────────────────────────────────────────────

  it("throws OwnerTemplateNotApprovedError when template payload and template not approved", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(true);
    isOwnerTemplateApprovedMock.mockResolvedValueOnce(false);

    await expect(
      sendOwnerMessage({
        studioId: "studio_1",
        messageId: "msg_1",
        payload: {
          type: "template",
          name: "unapproved_template",
          vars: {},
        },
        db: mockDb as any,
        client: mockHqWabaClient,
      }),
    ).rejects.toThrow(OwnerTemplateNotApprovedError);
  });

  // ─── Successful sends ─────────────────────────────────────────────────────

  it("calls client.sendMessage and returns { wamid } for opt-in + in-window text", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(true);
    isOwnerInWindowMock.mockReturnValueOnce(true);

    const result = await sendOwnerMessage({
      studioId: "studio_1",
      messageId: "msg_2",
      payload: { type: "text", body: "Your studio is live!" },
      db: mockDb as any,
      client: mockHqWabaClient,
    });

    expect(result).toHaveProperty("wamid");
    expect(typeof result.wamid).toBe("string");
  });

  it("calls client.sendMessage for opt-in + approved template (window not required)", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(true);
    isOwnerTemplateApprovedMock.mockResolvedValueOnce(true);

    const result = await sendOwnerMessage({
      studioId: "studio_1",
      messageId: "msg_3",
      payload: {
        type: "template",
        name: "owner_welcome",
        vars: { name: "Alice" },
        language: "en_US",
      },
      db: mockDb as any,
      client: mockHqWabaClient,
    });

    expect(result).toHaveProperty("wamid");
    expect(typeof result.wamid).toBe("string");
  });

  // ─── Gate order: opt-in checked before window ──────────────────────────────

  it("throws OwnerNoOptInError (not OwnerWindowExpiredError) when opt-in fails — gate order enforced", async () => {
    hasOwnerOptInMock.mockResolvedValueOnce(false);
    isOwnerInWindowMock.mockReturnValue(false); // would throw window error if reached

    const err = await sendOwnerMessage({
      studioId: "studio_1",
      messageId: "msg_4",
      payload: { type: "text", body: "Hello" },
      db: mockDb as any,
      client: mockHqWabaClient,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(OwnerNoOptInError);
    expect(err).not.toBeInstanceOf(OwnerWindowExpiredError);
  });
});
