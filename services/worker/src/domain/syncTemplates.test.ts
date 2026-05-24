import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the worker logger to avoid env-validation requirements during tests.
vi.mock("../lib/logger.js", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Drizzle's .execute() is the terminal raw-SQL call we exercise here.
const executeMock = vi.fn().mockResolvedValue({ rows: [] });
const mockDb = { execute: executeMock } as any;

// Stub global fetch — syncWhatsAppTemplates uses fetch() against the Meta
// Graph API directly.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { syncWhatsAppTemplates } = await import("./syncTemplates.js");

describe("syncWhatsAppTemplates (WA-08)", () => {
  beforeEach(() => {
    executeMock.mockClear();
    fetchMock.mockReset();
  });

  it("fetches Meta Graph API v23 with Bearer auth", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await syncWhatsAppTemplates("tk_abc", "12345", mockDb);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("graph.facebook.com/v23.0/12345/message_templates");
    expect(init?.headers?.Authorization).toBe("Bearer tk_abc");
  });

  it("upserts each template with ON CONFLICT DO UPDATE and returns count", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            name: "class_reminder",
            status: "approved",
            category: "utility",
            language: "en_US",
            components: [],
          },
          {
            name: "waitlist_offer",
            status: "pending",
            category: "utility",
            language: "en_US",
            components: [],
          },
          {
            name: "payment_failed",
            status: "approved",
            category: "utility",
            language: "en_US",
            components: [],
          },
        ],
      }),
    });
    const result = await syncWhatsAppTemplates("tk", "wa1", mockDb);
    expect(result.synced).toBe(3);
    expect(executeMock).toHaveBeenCalledTimes(3);
    // First call's SQL fragment should contain the INSERT + ON CONFLICT.
    // Drizzle's sql template produces an object; serialize via JSON to scan.
    const firstSql = JSON.stringify(executeMock.mock.calls[0][0]);
    expect(firstSql).toContain("INSERT INTO whatsapp_templates");
    expect(firstSql).toContain("ON CONFLICT (name) DO UPDATE");
  });

  it("throws on Meta API error (non-2xx)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    await expect(
      syncWhatsAppTemplates("tk_bad", "wa1", mockDb),
    ).rejects.toThrow(/401/);
  });
});
