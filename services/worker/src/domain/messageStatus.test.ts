import { describe, it, expect, vi } from "vitest";
import { STATUS_RANK, applyOrdinalStatusUpdate } from "./messageStatus.js";

describe("STATUS_RANK", () => {
  it("enforces strict ordering queued < sent < delivered < read < failed", () => {
    expect(STATUS_RANK.queued).toBe(0);
    expect(STATUS_RANK.sent).toBe(1);
    expect(STATUS_RANK.delivered).toBe(2);
    expect(STATUS_RANK.read).toBe(3);
    expect(STATUS_RANK.failed).toBe(4);
  });
});

describe("applyOrdinalStatusUpdate", () => {
  it("throws on unknown status", async () => {
    const mockDb = { execute: vi.fn() } as any;
    await expect(
      // @ts-expect-error — invalid status by design
      applyOrdinalStatusUpdate(mockDb, "wamid_x", "unknown", null),
    ).rejects.toThrow(/Unknown message status/);
  });

  it("uses ordinal-guard CASE WHEN in SQL", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as any;
    await applyOrdinalStatusUpdate(
      mockDb,
      "wamid_x",
      "delivered",
      "1234567890",
    );
    const sqlObj = mockDb.execute.mock.calls[0][0];
    const sqlStr = JSON.stringify(sqlObj);
    expect(sqlStr).toContain("CASE status");
    expect(sqlStr).toContain("queued");
    expect(sqlStr).toContain("sent");
    expect(sqlStr).toContain("delivered");
    expect(sqlStr).toContain("read");
    expect(sqlStr).toContain("failed");
  });

  it("writes updated_at = NOW() in the UPDATE (Blocker #2)", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as any;
    await applyOrdinalStatusUpdate(mockDb, "wamid_x", "sent", "1234567890");
    const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
    expect(sqlStr).toContain("updated_at = NOW()");
  });

  it("returns updatedRows from execute result", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as any;
    const result = await applyOrdinalStatusUpdate(
      mockDb,
      "wamid_y",
      "sent",
      "1234567890",
    );
    expect(result.updatedRows).toBe(1);
  });

  it("converts unix timestamp to ISO", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
    } as any;
    await applyOrdinalStatusUpdate(
      mockDb,
      "wamid_z",
      "delivered",
      "1700000000",
    );
    const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
    // 1700000000 unix = 2023-11-14T22:13:20.000Z
    expect(sqlStr).toContain("2023-11-14T22:13:20.000Z");
  });

  it("propagates errorCode for failed status", async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    } as any;
    await applyOrdinalStatusUpdate(
      mockDb,
      "wamid_f",
      "failed",
      "1700000000",
      "131047",
    );
    const sqlStr = JSON.stringify(mockDb.execute.mock.calls[0][0]);
    expect(sqlStr).toContain("131047");
  });
});
