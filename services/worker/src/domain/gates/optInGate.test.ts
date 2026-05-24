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
    whatsappOptIn: { memberId: { name: "member_id" } },
  },
}));

const { hasOptIn } = await import("./optInGate.js");

describe("hasOptIn (WA-07; PITFALL #17)", () => {
  it("returns true when row exists", async () => {
    // limit(1) resolves with a one-row array → rows.length > 0 → true
    selectChain.limit.mockResolvedValueOnce([{ memberId: "mem_1" }]);
    expect(await hasOptIn("mem_1", mockDb as any)).toBe(true);
  });

  it("returns false when no row", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    expect(await hasOptIn("mem_unknown", mockDb as any)).toBe(false);
  });
});
