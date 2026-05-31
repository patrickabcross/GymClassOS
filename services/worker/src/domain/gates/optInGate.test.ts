import { describe, it, expect, vi } from "vitest";

// Drizzle's query builder is a thenable; awaiting `.limit(1)` calls `.then`
// with the resolve handler — we mock that surface directly.
const selectChain: {
  from: any;
  where: any;
  limit: any;
  then: any;
} = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  then: vi.fn(),
};
const mockDb = { select: vi.fn().mockReturnValue(selectChain) };

vi.mock("../../lib/db.js", () => ({
  getDb: () => mockDb,
  schema: {
    whatsappOptIn: {
      memberId: { name: "member_id" },
      optedOutAt: { name: "opted_out_at" },
    },
  },
}));

const { hasOptIn } = await import("./optInGate.js");

describe("hasOptIn (WA-07, WA-09/WA-10; PITFALL #17)", () => {
  it("returns true when row exists and optedOutAt is null (opted in, not opted out)", async () => {
    // Row exists, optedOutAt null → gate passes.
    selectChain.limit.mockResolvedValueOnce([
      { memberId: "mem_1", optedOutAt: null },
    ]);
    expect(await hasOptIn("mem_1", mockDb as any)).toBe(true);
  });

  it("returns false when row exists but optedOutAt is set (opted out member refused)", async () => {
    // Row exists but optedOutAt is set → gate refuses even with an opt-in row.
    selectChain.limit.mockResolvedValueOnce([
      { memberId: "mem_2", optedOutAt: "2026-05-31T10:00:00.000Z" },
    ]);
    expect(await hasOptIn("mem_2", mockDb as any)).toBe(false);
  });

  it("returns false when no row exists (never opted in)", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    expect(await hasOptIn("mem_unknown", mockDb as any)).toBe(false);
  });
});
