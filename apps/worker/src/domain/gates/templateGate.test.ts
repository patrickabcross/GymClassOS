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
    whatsappTemplates: {
      name: { name: "name" },
      status: { name: "status" },
    },
  },
}));

const { isTemplateApproved } = await import("./templateGate.js");

describe("isTemplateApproved (WA-08)", () => {
  it("returns true for approved template", async () => {
    selectChain.then.mockImplementationOnce((cb: any) =>
      cb([{ name: "class_reminder" }]),
    );
    expect(await isTemplateApproved("class_reminder", mockDb as any)).toBe(
      true,
    );
  });

  it("returns false for missing template", async () => {
    selectChain.then.mockImplementationOnce((cb: any) => cb([]));
    expect(await isTemplateApproved("missing", mockDb as any)).toBe(false);
  });

  // Note: the WHERE clause filters status='approved'; if the row exists with
  // a different status, the query returns no row → false. This is correct.
});
