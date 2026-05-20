import { describe, it, expect, vi } from "vitest";

const selectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
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
    selectChain.then.mockImplementationOnce((cb: any) =>
      cb([{ memberId: "mem_1" }]),
    );
    expect(await hasOptIn("mem_1", mockDb as any)).toBe(true);
  });

  it("returns false when no row", async () => {
    selectChain.then.mockImplementationOnce((cb: any) => cb([]));
    expect(await hasOptIn("mem_unknown", mockDb as any)).toBe(false);
  });
});
