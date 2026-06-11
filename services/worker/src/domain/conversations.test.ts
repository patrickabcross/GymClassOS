import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module — chained INSERT must end with .onConflictDoNothing.returning(...)
const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  then: vi.fn(),
};
const messageInsertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};
const conversationInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};
// opt-in INSERT chain: values → onConflictDoNothing (no .returning)
const optInInsertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

// Insert call sequence: controls which chain is returned per insert call.
// "conversation" | "message" | "optIn"
let insertCallSequence: ("conversation" | "message" | "optIn")[] = [];
const mockDb = {
  select: vi.fn().mockReturnValue(selectChain),
  insert: vi.fn().mockImplementation((_table: any) => {
    // table identity is mocked — we route by call order rather than introspection.
    // The test sequences below control which call goes to which chain.
    const next = insertCallSequence.shift() ?? "message";
    if (next === "conversation") return conversationInsertChain;
    if (next === "optIn") return optInInsertChain;
    return messageInsertChain;
  }),
  update: vi.fn().mockReturnValue(updateChain),
};

vi.mock("../lib/db.js", () => ({
  getDb: () => mockDb,
  schema: {
    messages: {
      externalId: { name: "external_id" },
      id: { name: "id" },
    },
    gymMembers: {
      phoneE164: { name: "phone_e164" },
      id: { name: "id" },
    },
    conversations: {
      memberId: { name: "member_id" },
      channel: { name: "channel" },
      id: { name: "id" },
    },
    whatsappOptIn: {
      memberId: { name: "member_id" },
    },
  },
}));

import {
  upsertConversationAndMessage,
  materialiseOutboundMirror,
} from "./conversations.js";

describe("upsertConversationAndMessage", () => {
  beforeEach(() => {
    selectChain.then.mockReset();
    messageInsertChain.values.mockClear();
    messageInsertChain.onConflictDoNothing.mockClear();
    messageInsertChain.returning.mockReset();
    conversationInsertChain.values.mockClear();
    optInInsertChain.values.mockClear();
    optInInsertChain.onConflictDoNothing.mockClear();
    updateChain.set.mockClear();
    updateChain.where.mockClear();
    mockDb.insert.mockClear();
    insertCallSequence = [];
  });

  it("returns unknown_phone if no member matches", async () => {
    selectChain.then.mockResolvedValueOnce(null); // no member
    const result = await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_new",
        from: "447700900099",
        type: "text",
        text: { body: "x" },
      },
      "{}",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toBe("unknown_phone");
  });

  it("creates conversation + message for known member with no prior conversation", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_1", phoneE164: "+447700900000" }) // member found
      .mockResolvedValueOnce(null); // no existing conversation
    insertCallSequence = ["conversation", "message", "optIn"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_new" }]); // INSERT messages OK
    const result = await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_new",
        from: "447700900000",
        type: "text",
        text: { body: "hello" },
      },
      '{"raw":"hello"}',
    );
    expect(result.processed).toBe(true);
    expect(conversationInsertChain.values).toHaveBeenCalled();
  });

  it("messages INSERT uses .onConflictDoNothing on externalId (HIGH #4 — race-safe)", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_2", phoneE164: "+447700900001" })
      .mockResolvedValueOnce({ id: "conv_existing", unreadCount: 3 });
    insertCallSequence = ["message", "optIn"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_y" }]);
    await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_y",
        from: "447700900001",
        type: "text",
        text: { body: "hi again" },
      },
      "{}",
    );
    // The messages INSERT chain must have .onConflictDoNothing called with target=externalId
    expect(messageInsertChain.onConflictDoNothing).toHaveBeenCalled();
    const args = messageInsertChain.onConflictDoNothing.mock.calls[0][0];
    expect(args?.target).toBeDefined();
  });

  it("returns duplicate_wamid when .onConflictDoNothing triggers (concurrent race)", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_3", phoneE164: "+447700900002" })
      .mockResolvedValueOnce({ id: "conv_dup", unreadCount: 0 });
    insertCallSequence = ["message"];
    messageInsertChain.returning.mockResolvedValueOnce([]); // ON CONFLICT triggered — empty return
    const result = await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_race",
        from: "447700900002",
        type: "text",
        text: { body: "race" },
      },
      "{}",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toBe("duplicate_wamid");
  });

  it("updates existing conversation when prior conversation exists", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_4", phoneE164: "+447700900003" })
      .mockResolvedValueOnce({ id: "conv_existing_2", unreadCount: 2 });
    insertCallSequence = ["message", "optIn"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_z" }]);
    await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_existing",
        from: "447700900003",
        type: "text",
        text: { body: "again" },
      },
      "{}",
    );
    expect(updateChain.set).toHaveBeenCalled();
    // unread_count incremented to 3 (2 + 1)
    const setCall =
      updateChain.set.mock.calls[updateChain.set.mock.calls.length - 1][0];
    expect(setCall.unreadCount).toBe(3);
  });

  // WA-09: opt-in auto-capture tests
  it("WA-09: first inbound inserts one whatsapp_opt_in row with source=inbound_reply", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_5", phoneE164: "+447700900004" }) // member found
      .mockResolvedValueOnce({ id: "conv_new", unreadCount: 0 }); // existing conversation
    insertCallSequence = ["message", "optIn"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_optin" }]);
    const result = await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_first",
        from: "447700900004",
        type: "text",
        text: { body: "hello first time" },
      },
      '{"raw":"hello first time"}',
    );
    expect(result.processed).toBe(true);
    // optIn INSERT must have been called with source='inbound_reply'
    expect(optInInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: "mem_5",
        evidenceMessageId: "wamid_first",
        source: "inbound_reply",
      }),
    );
    // onConflictDoNothing must be called (idempotency — never clears existing opt-out)
    expect(optInInsertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("WA-09: duplicate-wamid path does NOT call the opt-in insert", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_6", phoneE164: "+447700900005" }) // member found
      .mockResolvedValueOnce({ id: "conv_dup2", unreadCount: 0 }); // existing conversation
    insertCallSequence = ["message"]; // only message insert — no optIn if wamid is duplicate
    messageInsertChain.returning.mockResolvedValueOnce([]); // ON CONFLICT → duplicate_wamid
    const result = await upsertConversationAndMessage(
      mockDb as any,
      {
        id: "wamid_dup",
        from: "447700900005",
        type: "text",
        text: { body: "dup" },
      },
      "{}",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toBe("duplicate_wamid");
    // opt-in INSERT must NOT have been attempted on the duplicate path
    expect(optInInsertChain.values).not.toHaveBeenCalled();
  });
});

describe("materialiseOutboundMirror", () => {
  beforeEach(() => {
    selectChain.then.mockReset();
    messageInsertChain.values.mockClear();
    messageInsertChain.onConflictDoNothing.mockClear();
    messageInsertChain.returning.mockReset();
    conversationInsertChain.values.mockClear();
    optInInsertChain.values.mockClear();
    optInInsertChain.onConflictDoNothing.mockClear();
    updateChain.set.mockClear();
    updateChain.where.mockClear();
    mockDb.insert.mockClear();
    insertCallSequence = [];
  });

  it("(a) member matched by customerWaId, no prior conversation: creates conversation + message with direction='out' and status='sent', no opt-in", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_out_1", phoneE164: "+447700900010" }) // member found
      .mockResolvedValueOnce(null); // no existing conversation
    insertCallSequence = ["conversation", "message"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_out_1" }]);

    const result = await materialiseOutboundMirror(
      mockDb as any,
      {
        externalId: "wamid_out_1",
        customerWaId: "447700900010",
        messageType: "text",
        body: "Great session today!",
        timestamp: "1718000000",
      },
      '{"raw":"out"}',
    );

    expect(result.processed).toBe(true);
    // Conversation INSERT must have been called
    expect(conversationInsertChain.values).toHaveBeenCalled();
    // Message INSERT values must include direction:'out' and status:'sent'
    expect(messageInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({ direction: "out", status: "sent" }),
    );
    // opt-in INSERT must NOT have been attempted (agent reply ≠ opt-in)
    expect(optInInsertChain.values).not.toHaveBeenCalled();
  });

  it("(b) existing conversation: update sets lastOutboundAt + lastMessagePreview, NOT unreadCount/lastInboundAt/status", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_out_2", phoneE164: "+447700900011" })
      .mockResolvedValueOnce({ id: "conv_out_existing", unreadCount: 2 }); // existing conv
    insertCallSequence = ["message"];
    messageInsertChain.returning.mockResolvedValueOnce([{ id: "msg_out_2" }]);

    await materialiseOutboundMirror(
      mockDb as any,
      {
        externalId: "wamid_out_2",
        customerWaId: "447700900011",
        messageType: "text",
        body: "See you next class!",
      },
      "{}",
    );

    expect(updateChain.set).toHaveBeenCalled();
    const setCall = updateChain.set.mock.calls[0][0];
    // Must set lastOutboundAt and lastMessagePreview
    expect(setCall.lastOutboundAt).toBeDefined();
    expect(setCall.lastMessagePreview).toBe("See you next class!");
    // Must NOT touch unreadCount, lastInboundAt, or status
    expect(setCall).not.toHaveProperty("unreadCount");
    expect(setCall).not.toHaveProperty("lastInboundAt");
    expect(setCall).not.toHaveProperty("status");
    // opt-in INSERT must NOT have been attempted
    expect(optInInsertChain.values).not.toHaveBeenCalled();
  });

  it("(c) unknown customerWaId: returns processed:false, reason:'unknown_phone'", async () => {
    selectChain.then.mockResolvedValueOnce(null); // no member
    const result = await materialiseOutboundMirror(
      mockDb as any,
      {
        externalId: "wamid_out_3",
        customerWaId: "999999999999",
        messageType: "text",
        body: "hello",
      },
      "{}",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toBe("unknown_phone");
    // Nothing else should have been called
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(optInInsertChain.values).not.toHaveBeenCalled();
  });

  it("(d) duplicate wamid (returning []): returns processed:false, reason:'duplicate_wamid', no opt-in", async () => {
    selectChain.then
      .mockResolvedValueOnce({ id: "mem_out_4", phoneE164: "+447700900012" })
      .mockResolvedValueOnce({ id: "conv_out_dup", unreadCount: 0 });
    insertCallSequence = ["message"];
    // ON CONFLICT triggers — self-send dedup path
    messageInsertChain.returning.mockResolvedValueOnce([]);

    const result = await materialiseOutboundMirror(
      mockDb as any,
      {
        externalId: "wamid_out_dup",
        customerWaId: "447700900012",
        messageType: "text",
        body: "dup reply",
      },
      "{}",
    );
    expect(result.processed).toBe(false);
    expect(result.reason).toBe("duplicate_wamid");
    // opt-in INSERT must NOT have been attempted on the duplicate path
    expect(optInInsertChain.values).not.toHaveBeenCalled();
  });
});
