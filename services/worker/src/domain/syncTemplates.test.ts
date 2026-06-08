// Tests for syncWhatsAppTemplates — MYÜTIK Template Extract API (WA-08).
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the worker logger to avoid env-validation requirements during tests.
vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Drizzle's .execute() is the terminal raw-SQL call we exercise here.
const executeMock = vi.fn().mockResolvedValue({ rows: [] });
const mockDb = { execute: executeMock } as any;

// Stub global fetch — syncWhatsAppTemplates uses fetch() against MYÜTIK.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { syncWhatsAppTemplates } = await import("./syncTemplates.js");

describe("syncWhatsAppTemplates (WA-08, MYÜTIK)", () => {
  beforeEach(() => {
    executeMock.mockClear();
    fetchMock.mockReset();
  });

  it("fetches MYÜTIK API with x-api-key header and phoneNumberId query param", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ templates: [], paging: { next: null } }),
    });
    await syncWhatsAppTemplates("key_abc", "302631896256150", mockDb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(url).toContain("myutik.com/api/channels/whatsapp/templates");
    expect(url).toContain("phoneNumberId=302631896256150");
    expect(init?.headers?.["x-api-key"]).toBe("key_abc");
    // Must NOT send Authorization header.
    expect(init?.headers?.["Authorization"]).toBeUndefined();
  });

  it("lowercases UPPERCASE status before upsert", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [
          {
            name: "class_reminder",
            status: "APPROVED",
            category: "UTILITY",
            language: "en_US",
            components: [],
          },
        ],
        paging: { next: null },
      }),
    });
    await syncWhatsAppTemplates("key_abc", "302631896256150", mockDb);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const firstSql = JSON.stringify(executeMock.mock.calls[0][0]);
    expect(firstSql).toContain("INSERT INTO whatsapp_templates");
    expect(firstSql).toContain("ON CONFLICT (name) DO UPDATE");
    // Status must be lowercased so templateGate's status='approved' filter matches.
    expect(firstSql).toContain("approved");
    expect(firstSql).not.toContain("APPROVED");
  });

  it("upserts each template and returns correct synced count", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        templates: [
          {
            name: "class_reminder",
            status: "APPROVED",
            category: "utility",
            language: "en_US",
            components: [],
          },
          {
            name: "waitlist_offer",
            status: "PENDING",
            category: "utility",
            language: "en_US",
            components: [],
          },
          {
            name: "payment_failed",
            status: "APPROVED",
            category: "utility",
            language: "en_US",
            components: [],
          },
        ],
        paging: { next: null },
      }),
    });
    const result = await syncWhatsAppTemplates(
      "key",
      "302631896256150",
      mockDb,
    );
    expect(result.synced).toBe(3);
    expect(executeMock).toHaveBeenCalledTimes(3);
  });

  it("throws on MYÜTIK API error (non-2xx)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(
      syncWhatsAppTemplates("bad_key", "302631896256150", mockDb),
    ).rejects.toThrow(/401/);
  });

  it("follows pagination: fetches twice when paging.next is set, second call includes after param", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          templates: [
            {
              name: "t1",
              status: "APPROVED",
              category: "utility",
              language: "en_US",
              components: [],
            },
          ],
          paging: { next: "cursor1" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          templates: [
            {
              name: "t2",
              status: "APPROVED",
              category: "utility",
              language: "en_US",
              components: [],
            },
          ],
          paging: { next: null },
        }),
      });

    const result = await syncWhatsAppTemplates(
      "key_abc",
      "302631896256150",
      mockDb,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain("after=cursor1");
    expect(result.synced).toBe(2);
  });
});
