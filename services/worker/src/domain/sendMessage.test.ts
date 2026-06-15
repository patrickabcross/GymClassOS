import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the gates (we tested them separately in Task 1).
const hasOptIn = vi.fn();
const isInWindow = vi.fn();
const isTemplateApproved = vi.fn();
vi.mock("./gates/optInGate.js", () => ({ hasOptIn }));
vi.mock("./gates/windowGate.js", () => ({ isInWindow, WINDOW_HOURS: 24 }));
vi.mock("./gates/templateGate.js", () => ({ isTemplateApproved }));

// Mock the MYÜTIK send client — verifies our chokepoint refuses BEFORE any
// send escapes to MYÜTIK (success criteria #3 + #4).
const sendViaMyutik = vi.fn();
vi.mock("./sendViaMyutik.js", () => ({ sendViaMyutik }));

// renderApprovedTemplateBody is exercised by its own unit suite
// (templateBody.test.ts). Mock it here so sendMessage tests control the
// in-window template-vs-text decision deterministically.
const renderApprovedTemplateBody = vi.fn();
vi.mock("./templateBody.js", () => ({ renderApprovedTemplateBody }));

// Mock the secrets readers so creds are resolved without a real DB call.
vi.mock("../lib/secrets.js", () => ({
  getMyutikApiKey: vi.fn().mockResolvedValue("myutik_test_key"),
  getMyutikPhoneNumberId: vi.fn().mockResolvedValue("302631896256150"),
  getWhatsAppAccessToken: vi.fn().mockResolvedValue("wa_test_token"),
  getWhatsAppPhoneNumberId: vi.fn().mockResolvedValue("11111111"),
  getWhatsAppBusinessAccountId: vi.fn().mockResolvedValue("waba_test"),
  getStripeSecretKey: vi.fn().mockResolvedValue("rk_test_mock"),
  readSecret: vi.fn().mockResolvedValue(null),
  writeSecret: vi.fn().mockResolvedValue(undefined),
}));

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
    whatsappTemplates: { name: {}, componentsJson: {} },
  },
}));

const { sendMessage } = await import("./sendMessage.js");
const { NoOptInError, WindowExpiredError, TemplateNotApprovedError } =
  await import("../lib/errors.js");

describe("sendMessage chokepoint (D-10)", () => {
  beforeEach(() => {
    hasOptIn.mockReset();
    isInWindow.mockReset();
    isTemplateApproved.mockReset();
    sendViaMyutik.mockReset();
    renderApprovedTemplateBody.mockReset();
    selectChain.limit.mockReset();
    updateChain.set.mockClear();
    updateChain.where.mockClear();
  });

  it("throws NoOptInError + does NOT call MYÜTIK when opt-in missing (WA-07)", async () => {
    hasOptIn.mockResolvedValueOnce(false);
    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_1",
        payload: { type: "text", body: "hi" },
        db: mockDb as any,
      }),
    ).rejects.toBeInstanceOf(NoOptInError);
    // Success criterion #4: NO send on gate failure.
    expect(sendViaMyutik).not.toHaveBeenCalled();
  });

  it("throws WindowExpiredError + does NOT call MYÜTIK for text outside window (WA-06)", async () => {
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
    // Success criterion #3: NO send on window expiry.
    expect(sendViaMyutik).not.toHaveBeenCalled();
  });

  it("sends the REAL template OUTSIDE window — window CLOSED (WA-06 + WA-08)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([{ id: "conv_1", lastInboundAt: null }]);
    isTemplateApproved.mockResolvedValueOnce(true);
    // Window CLOSED → real approved-template send (Meta policy).
    isInWindow.mockReturnValueOnce(false);
    sendViaMyutik.mockResolvedValueOnce({ wamid: "wamid_sent_abc" });

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
    // MYÜTIK receives template fields with a single body component (ordered params)
    expect(sendViaMyutik).toHaveBeenCalledWith({
      apiKey: "myutik_test_key",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      templateName: "class_reminder",
      templateLanguage: "en_US",
      templateComponents: [
        { type: "body", parameters: [{ type: "text", text: "Yoga" }] },
      ],
    });
    // isInWindow IS now consulted for template payloads (computed once for both
    // branches) — and out-of-window we never render an approved body to text.
    expect(isInWindow).toHaveBeenCalled();
    expect(renderApprovedTemplateBody).not.toHaveBeenCalled();
  });

  it("renders approved BODY to TEXT for in-window template send (r6t)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      // member, conversation (in-window), then whatsapp_templates row
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ])
      .mockResolvedValueOnce([
        {
          componentsJson: JSON.stringify({
            components: [{ type: "BODY", text: "Hi {{1}}, see you at {{2}}!" }],
          }),
        },
      ]);
    isTemplateApproved.mockResolvedValueOnce(true);
    isInWindow.mockReturnValueOnce(true);
    renderApprovedTemplateBody.mockReturnValueOnce(
      "Hi Patrick, see you at Yoga!",
    );
    sendViaMyutik.mockResolvedValueOnce({ wamid: "wamid_text_render" });

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_render",
      payload: {
        type: "template",
        name: "class_reminder",
        vars: { 1: "Patrick", 2: "Yoga" },
      },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("wamid_text_render");
    // WA-08 gate still fired for the template payload even though we send text.
    expect(isTemplateApproved).toHaveBeenCalledWith(
      "class_reminder",
      expect.anything(),
    );
    // Rendered body is sent as free TEXT — NOT as a template.
    expect(sendViaMyutik).toHaveBeenCalledWith({
      apiKey: "myutik_test_key",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      text: "Hi Patrick, see you at Yoga!",
    });
    const sendArgs = sendViaMyutik.mock.calls[0][0];
    expect(sendArgs.templateName).toBeUndefined();
  });

  it("falls back to the real template send when in-window render is empty (r6t)", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ])
      // template row present but renderApprovedTemplateBody returns null below
      .mockResolvedValueOnce([{ componentsJson: "not-json" }]);
    isTemplateApproved.mockResolvedValueOnce(true);
    isInWindow.mockReturnValueOnce(true);
    renderApprovedTemplateBody.mockReturnValueOnce(null);
    sendViaMyutik.mockResolvedValueOnce({ wamid: "wamid_fallback" });

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_fallback",
      payload: {
        type: "template",
        name: "class_reminder",
        vars: { 1: "Yoga" },
      },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("wamid_fallback");
    // Never sends empty text — falls back to the real template send.
    expect(sendViaMyutik).toHaveBeenCalledWith({
      apiKey: "myutik_test_key",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      templateName: "class_reminder",
      templateLanguage: "en_US",
      templateComponents: [
        { type: "body", parameters: [{ type: "text", text: "Yoga" }] },
      ],
    });
    const sendArgs = sendViaMyutik.mock.calls[0][0];
    expect(sendArgs.text).toBeUndefined();
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
    expect(sendViaMyutik).not.toHaveBeenCalled();
  });

  it("text in window calls MYÜTIK + marks status='sent'", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    sendViaMyutik.mockResolvedValueOnce({ wamid: "wamid_OK" });

    const result = await sendMessage({
      memberId: "mem_1",
      messageId: "msg_5",
      payload: { type: "text", body: "hello" },
      db: mockDb as any,
    });
    expect(result.externalId).toBe("wamid_OK");
    // MYÜTIK receives the text payload + resolved creds; KEEP the leading +
    expect(sendViaMyutik).toHaveBeenCalledWith({
      apiKey: "myutik_test_key",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      text: "hello",
    });
    // Two updates: messages.status='sent' + conversations.last_outbound_at
    const setArgs = updateChain.set.mock.calls.map((c) => c[0]);
    expect(
      setArgs.some((s) => s.status === "sent" && s.externalId === "wamid_OK"),
    ).toBe(true);
  });

  it("marks status='failed' on 4xx MYÜTIK response without re-throwing", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_1", phoneE164: "+447700900000" }])
      .mockResolvedValueOnce([
        { id: "conv_1", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    sendViaMyutik.mockRejectedValueOnce(
      Object.assign(new Error("MYÜTIK send 409: window closed"), {
        status: 409,
      }),
    );

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
    sendViaMyutik.mockRejectedValueOnce(
      Object.assign(new Error("Bad gateway"), { status: 502 }),
    );

    await expect(
      sendMessage({
        memberId: "mem_1",
        messageId: "msg_7",
        payload: { type: "text", body: "hi" },
        db: mockDb as any,
      }),
    ).rejects.toThrow(/Bad gateway/);
  });

  it("keeps the leading + on the phone before passing to MYÜTIK", async () => {
    hasOptIn.mockResolvedValueOnce(true);
    selectChain.limit
      .mockResolvedValueOnce([{ id: "mem_p", phoneE164: "+447700900123" }])
      .mockResolvedValueOnce([
        { id: "conv_p", lastInboundAt: new Date().toISOString() },
      ]);
    isInWindow.mockReturnValueOnce(true);
    sendViaMyutik.mockResolvedValueOnce({ wamid: "wamid_p" });
    await sendMessage({
      memberId: "mem_p",
      messageId: "msg_p",
      payload: { type: "text", body: "x" },
      db: mockDb as any,
    });
    const sendArgs = sendViaMyutik.mock.calls[0][0];
    expect(sendArgs.to).toBe("+447700900123");
    expect(sendArgs.to).toMatch(/^\+/);
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
    expect(sendViaMyutik).not.toHaveBeenCalled();
  });
});
