import { describe, it, expect, vi, beforeEach } from "vitest";

import { sendViaMyutik } from "./sendViaMyutik.js";

const URL = "https://myutik.com/api/channels/whatsapp/send";

function mockResponse(opts: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => {
      if (opts.json === undefined) throw new Error("no json body");
      return opts.json;
    },
    text: async () => opts.text ?? "",
  } as unknown as Response;
}

/** Parse the JSON body posted in the first fetch call. */
function postedBody(fetchMock: ReturnType<typeof vi.fn>): any {
  const init = fetchMock.mock.calls[0][1];
  return JSON.parse(init.body);
}

describe("sendViaMyutik", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("text send: posts { to, phoneNumberId, text } with no template keys", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: {
          sent: true,
          type: "text",
          result: { messages: [{ id: "wamid_text" }] },
        },
      }),
    );

    const out = await sendViaMyutik({
      apiKey: "key_x",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      text: "hello",
    });

    expect(out).toEqual({ wamid: "wamid_text" });

    // URL + method + headers
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("key_x");
    expect(init.headers["Content-Type"]).toBe("application/json");

    // body — text branch, no template keys
    const body = postedBody(fetchMock);
    expect(body).toEqual({
      to: "+447700900000",
      phoneNumberId: "302631896256150",
      text: "hello",
    });
    expect("templateName" in body).toBe(false);
    expect("templateLanguage" in body).toBe(false);
    expect("templateComponents" in body).toBe(false);
  });

  it("template send: posts template fields with components, omits text", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: { result: { messages: [{ id: "wamid_tpl" }] } },
      }),
    );

    const templateComponents = [
      {
        type: "body",
        parameters: [{ type: "text", text: "Yoga" }],
      },
    ];

    const out = await sendViaMyutik({
      apiKey: "key_x",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      templateName: "class_reminder",
      templateLanguage: "en_US",
      templateComponents,
    });

    expect(out).toEqual({ wamid: "wamid_tpl" });

    const body = postedBody(fetchMock);
    expect(body).toEqual({
      to: "+447700900000",
      phoneNumberId: "302631896256150",
      templateName: "class_reminder",
      templateLanguage: "en_US",
      templateComponents,
    });
    expect("text" in body).toBe(false);
  });

  it("omits undefined optional fields from the body", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: { result: { messages: [{ id: "wamid_min" }] } },
      }),
    );

    await sendViaMyutik({
      apiKey: "key_x",
      phoneNumberId: "302631896256150",
      to: "+447700900000",
      templateName: "hello_world",
      // templateLanguage + templateComponents undefined
    });

    const body = postedBody(fetchMock);
    expect(body).toEqual({
      to: "+447700900000",
      phoneNumberId: "302631896256150",
      templateName: "hello_world",
    });
    expect("templateLanguage" in body).toBe(false);
    expect("templateComponents" in body).toBe(false);
  });

  it("200 with no messages id throws a >= 500 error (so pg-boss retries)", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: true,
        status: 200,
        json: { sent: true, result: { messages: [] } },
      }),
    );

    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("400 throws Error with .status === 400 and message includes 400", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 400,
        json: { error: "bad request" },
      }),
    );

    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toMatchObject({ status: 400 });

    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 400,
        json: { error: "bad request" },
      }),
    );
    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toThrow(/400/);
  });

  it("409 throws .status === 409 and carries requiresTemplate detail", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: {
          error: "24h window closed",
          requiresTemplate: true,
          conversationId: "conv_1",
        },
      }),
    );

    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toMatchObject({ status: 409 });

    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 409,
        json: {
          error: "24h window closed",
          requiresTemplate: true,
          conversationId: "conv_1",
        },
      }),
    );
    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toThrow(/requiresTemplate/);
  });

  it("502 throws Error with .status === 502", async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 502,
        json: { error: "Meta send failed" },
      }),
    );

    await expect(
      sendViaMyutik({
        apiKey: "key_x",
        phoneNumberId: "302631896256150",
        to: "+447700900000",
        text: "hi",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
