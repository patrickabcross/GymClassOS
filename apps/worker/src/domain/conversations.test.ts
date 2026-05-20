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
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

let insertCallSequence: ("conversation" | "message")[] = [];
const mockDb = {
  select: vi.fn().mockReturnValue(selectChain),
  insert: vi.fn().mockImplementation((table: any) => {
    // table identity is mocked — we route by call order rather than introspection.
    // First insert call on the messages table chain uses onConflictDoNothing.
    // Conversation upsert (when no existing conv) uses the plain chain.
    // The test sequences below control which call goes to which chain.
    const next = insertCallSequence.shift() ?? "message";
    return next === "conversation"
      ? conversationInsertChain
      : messageInsertChain;
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
  },
}));

import { upsertConversationAndMessage } from "./conversations.js";

describe("upsertConversationAndMessage", () => {
  beforeEach(() => {
    selectChain.then.mockReset();
    messageInsertChain.values.mockClear();
    messageInsertChain.onConflictDoNothing.mockClear();
    messageInsertChain.returning.mockReset();
    conversationInsertChain.values.mockClear();
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
    insertCallSequence = ["conversation", "message"];
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
    insertCallSequence = ["message"];
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
    insertCallSequence = ["message"];
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
});
