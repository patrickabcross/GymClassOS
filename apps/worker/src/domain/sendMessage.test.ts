import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the gates (we tested them separately in Task 1).
const hasOptIn = vi.fn();
const isInWindow = vi.fn();
const isTemplateApproved = vi.fn();
vi.mock("./gates/optInGate.js", () => ({ hasOptIn }));
vi.mock("./gates/windowGate.js", () => ({ isInWindow, WINDOW_HOURS: 24 }));
vi.mock("./gates/templateGate.js", () => ({ isTemplateApproved }));

// Mock the WhatsApp adapter — verifies our chokepoint refuses BEFORE any
// fetch escapes to Meta (success criteria #3 + #4).
const sendText = vi.fn();
const sendTemplate = vi.fn();
vi.mock("@gymos/whatsapp", () => ({ sendText, sendTemplate }));

// Mock the local db schema mirror — selectChain ends at .limit(1) which
// resolves a rows array; updateChain.where() resolves undefined.
const selectChain: {
  from: any;
  where: any;
  limit: any;
} = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const mockDb = {
  select: vi.fn().mockReturnValue(selectChain),
  update: vi.fn().mockReturnValue(updateChain),
};
vi.mock("../lib/db.js", () => ({
  getDb: () => mockDb,
  schema: {
    gymMembers: { id: {}, phoneE164: {} },
    conversations: { memberId: {}, channel: {}, id: {} },
    messages: { id: {} },
  },
}));

const { sendMessage } = await import("./sendMessage.js");
const {
  NoOptInError,
  WindowExpiredError,
  TemplateNotApprovedError,
} = await import("../lib/errors.js");

describe("sendMessage chokepoint (D-10)", () => {
  beforeEach(() => {
    hasOptIn.mockReset();
    isInWindow.mockReset();
    isTemplateApproved.mockReset();
    sendText.mockReset();
    sendTemplate.mockReset();
    selectChain.limit.mockReset();
    updateChain.set.mockClear();
    updateChain.where.mockClear();
  });

  it("throws NoOptInError + does NOT call adapter when opt-in missing (WA-07)", async () => {
    hasOptIn.mockResolvedValueOnce(false);
    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_1",
        payload: { type: "text", body: "hi" },
        db: mockDb as any,
      }),
    ).rejects.toBeInstanceOf(NoOptInError);
    // Success criterion #4: NO fetch to Meta on gate failure.
    expect(sendText).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("throws WindowExpiredError + does NOT call adapter for text outside window (WA-06)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: "2026-05-18T12:00:00.000Z" },
      ]);
    isInWindow.mockReturnValueOnce(false);

    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_1",
        payload: { type: "text", body: "hi" },
        db: mockDb as any,
      }),
    ).rejects.toBeInstanceOf(WindowExpiredError);
    // Success criterion #3: NO fetch to Meta on window expiry.
    expect(sendText).not.toHaveBeenCalled();
  });

  it("allows template send OUTSIDE window (WA-06 + WA-08 happy path)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([{ id: "conv_1", lastInboundAt: null }]);
    isTemplateApproved.mockResolvedValueOnce(true);
    sendTemplate.mockResolvedValueOnce({ messageId: "wamid_sent_abc" });

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_2",
      payload: {
        type: "template",
        name: "class_reminder",
        vars: { 1: "Yoga" },
      },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("wamid_sent_abc");
    expect(sendTemplate).toHaveBeenCalledWith({
      to: "447700900000",
      name: "class_reminder",
      vars: { 1: "Yoga" },
      language: undefined,
    });
    // isInWindow should NOT have been consulted (template path)
    expect(isInWindow).not.toHaveBeenCalled();
  });

  it("throws TemplateNotApprovedError for unapproved template name (WA-08)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([{ id: "conv_1", lastInboundAt: null }]);
    isTemplateApproved.mockResolvedValueOnce(false);

    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_3",
        payload: { type: "template", name: "unapproved", vars: {} },
        db: mockDb as any,
      }),
    ).rejects.toBeInstanceOf(TemplateNotApprovedError);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("text in window calls sendText + marks status='sent'", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    sendText.mockResolvedValueOnce({ messageId: "wamid_OK" });

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_5",
      payload: { type: "text", body: "hello" },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("wamid_OK");
    expect(sendText).toHaveBeenCalledWith({
      to: "447700900000",
      body: "hello",
    });
    // Two updates: messages.status='sent' + conversations.last_outbound_at
    const setArgs = updateChain.set.mock.calls.map((c) => c[0]);
    expect(
      setArgs.some(
        (s) => s.status === "sent" && s.externalId === "wamid_OK",
      ),
    ).toBe(true);
  });

  it("marks status='failed' on 4xx Meta response without re-throwing", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    const err = new Error("Invalid phone number") as Error & {
      status?: number;
    };
    err.status = 400;
    sendText.mockRejectedValueOnce(err);

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_6",
      payload: { type: "text", body: "hi" },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("");
    const setArgs = updateChain.set.mock.calls.map((c) => c[0]);
    expect(
      setArgs.some(
        (s) => s.status === "failed" && typeof s.errorCode === "string",
      ),
    ).toBe(true);
  });

  it("re-throws on 5xx (pg-boss retries)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    const err = new Error("Bad gateway") as Error & { status?: number };
    err.status = 502;
    sendText.mockRejectedValueOnce(err);

    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_7",
        payload: { type: "text", body: "hi" },
        db: mockDb as any,
      }),
    ).rejects.toThrow(/Bad gateway/);
  });

  it("strips leading + from phone before passing to adapter", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_p", phoneE164: "+447700900123" }])
      .mockResolvedValueOnce([
        { id: "conv_p", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    sendText.mockResolvedValueOnce({ messageId: "wamid_p" });
    await sendMessage({
      memberId: "mem_p",
      messageId: "msg_p",
      payload: { type: "text", body: "x" },
      db: mockDb as any,
    });
    const sendArgs = sendText.mock.calls[0][0];
    expect(sendArgs.to).toBe("447700900123");
    expect(sendArgs.to).not.toMatch(/^\+/);
  });

  it("throws when member has no phone_e164", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit.mockResolvedValueOnce([
      { id: "mem_nophone", phoneE164: null },
    ]);
    await expect(
      sendMessage({
        memberId: "mem_nophone",
        messageId: "msg_x",
        payload: { type: "text", body: "x" },
        db: mockDb as any,
      }),
    ).rejects.toThrow(/has no phone_e164/);
    expect(sendText).not.toHaveBeenCalled();
  });
});
