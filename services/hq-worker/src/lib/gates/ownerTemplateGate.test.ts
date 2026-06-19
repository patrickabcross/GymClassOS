import { describe, it, expect, vi } from "vitest";

// Drizzle query builder mock — same pattern as ownerOptInGate.test.ts
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
    hqWhatsappTemplates: {
      name: { name: "name" },
      status: { name: "status" },
    },
  },
}));

const { isOwnerTemplateApproved } = await import("./ownerTemplateGate.js");

describe("isOwnerTemplateApproved (HQD-03 / D-07 mirror)", () => {
  it("returns true when template exists with status='approved'", async () => {
    selectChain.limit.mockResolvedValueOnce([{ name: "owner_welcome" }]);
    expect(await isOwnerTemplateApproved("owner_welcome", mockDb as any)).toBe(
      true,
    );
  });

  it("returns false when template exists but status is 'pending'", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    expect(
      await isOwnerTemplateApproved("owner_pending_template", mockDb as any),
    ).toBe(false);
  });

  it("returns false when template does not exist", async () => {
    selectChain.limit.mockResolvedValueOnce([]);
    expect(
      await isOwnerTemplateApproved("nonexistent_template", mockDb as any),
    ).toBe(false);
  });
});
