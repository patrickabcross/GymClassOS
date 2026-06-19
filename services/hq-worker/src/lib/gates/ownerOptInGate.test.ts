import { describe, it, expect, vi } from "vitest";

// Drizzle's query builder is a thenable; awaiting `.limit(1)` calls `.then`
// with the resolve handler — we mock that surface directly.
const selectChain: {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
} = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
};
const mockDb = { select: vi.fn().mockReturnValue(selectChain) };

vi.mock("../db.js", () => ({
  getHqDb: () => mockDb,
  schema: {
    hqWhatsappOptIn: {
      studioId: { name: "studio_id" },
      optedOutAt: { name: "opted_out_at" },
    },
  },
}));

const { hasOwnerOptIn } = await import("./ownerOptInGate.js");

describe("hasOwnerOptIn (HQD-01 / D-07 mirror; PITFALL #2)", () => {
  it("returns true when row exists and optedOutAt is null (opted in, not opted out)", async () => {
    selectChain.limit.mockResolvedValueOnce([
      { studioId: "studio_1", optedOutAt: null },
    ]);
    expect(await hasOwnerOptIn("studio_1", mockDb as any)).toBe(true);
  });

  it("returns false when row exists but optedOutAt is set (owner opted out)", async () => {
    selectChain.limit.mockResolvedValueOnce([
      { studioId: "studio_2", optedOutAt: "2026-06-01T10:00:00.000Z" },
    ]);
    expect(await hasOwnerOptIn("studio_2", mockDb as any)).toBe(false);
  });

  it("returns false when no row exists (studio never opted in)", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    expect(await hasOwnerOptIn("studio_unknown", mockDb as any)).toBe(false);
  });
});
