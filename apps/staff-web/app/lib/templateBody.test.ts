import { describe, expect, it } from "vitest";
import {
  renderTemplateBody,
  extractBodyText,
  resolveTemplateMessageBody,
} from "./templateBody.js";

describe("renderTemplateBody", () => {
  it("substitutes {{N}} placeholders from the vars map (happy path)", () => {
    expect(
      renderTemplateBody("Hi {{1}}, your {{2}} is ready", {
        "1": "Patrick",
        "2": "pass",
      }),
    ).toBe("Hi Patrick, your pass is ready");
  });

  it("leaves an unknown {{N}} placeholder intact (no matching var) and does not throw", () => {
    expect(
      renderTemplateBody("Hi {{1}}, your {{2}} is ready", { "1": "Pat" }),
    ).toBe("Hi Pat, your {{2}} is ready");
  });

  it("returns the body unchanged when vars is empty (placeholders left intact)", () => {
    expect(renderTemplateBody("Hi {{1}}", {})).toBe("Hi {{1}}");
  });

  it("returns the body unchanged when vars is undefined", () => {
    expect(renderTemplateBody("Hi {{1}}", undefined)).toBe("Hi {{1}}");
  });

  it("substitutes a repeated placeholder in every position", () => {
    expect(renderTemplateBody("{{1}} and {{1}} again", { "1": "x" })).toBe(
      "x and x again",
    );
  });

  it("returns plain text with no placeholders unchanged", () => {
    expect(renderTemplateBody("no tokens here", { "1": "x" })).toBe(
      "no tokens here",
    );
  });
});

describe("extractBodyText", () => {
  // Real shape from whatsapp_templates.components_json (verified via Neon):
  // a JSON STRING wrapping { components: [{ type: "BODY", text, example }, ...] }
  const realJsonString = JSON.stringify({
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, fancy testing yourself? It works for {{2}}.",
        example: { body_text: [["James", "functional fitness training"]] },
      },
    ],
  });

  it("extracts the BODY text from the wrapped JSON string shape (uppercase BODY)", () => {
    expect(extractBodyText(realJsonString)).toBe(
      "Hi {{1}}, fancy testing yourself? It works for {{2}}.",
    );
  });

  it("matches the BODY component case-insensitively", () => {
    const lower = JSON.stringify({
      components: [{ type: "body", text: "lower body" }],
    });
    expect(extractBodyText(lower)).toBe("lower body");
  });

  it("handles an already-parsed wrapped object", () => {
    const obj = { components: [{ type: "BODY", text: "parsed body" }] };
    expect(extractBodyText(obj)).toBe("parsed body");
  });

  it("handles a bare components array (not wrapped)", () => {
    const arr = [
      { type: "HEADER", text: "head" },
      { type: "BODY", text: "bare body" },
    ];
    expect(extractBodyText(arr)).toBe("bare body");
  });

  it("returns null when there is no BODY component", () => {
    const noBody = JSON.stringify({
      components: [{ type: "HEADER", text: "head" }],
    });
    expect(extractBodyText(noBody)).toBeNull();
  });

  it("returns null for null / garbage / unparseable input without throwing", () => {
    expect(extractBodyText(null)).toBeNull();
    expect(extractBodyText(undefined)).toBeNull();
    expect(extractBodyText("not json {{{")).toBeNull();
    expect(extractBodyText(42)).toBeNull();
    expect(extractBodyText({})).toBeNull();
  });
});

describe("resolveTemplateMessageBody", () => {
  const byName: Record<string, string | null> = {
    welcome: "Hi {{1}}, welcome to {{2}}!",
    no_body: null,
  };

  it("renders the resolved body with vars substituted", () => {
    const payload = JSON.stringify({
      name: "welcome",
      vars: { "1": "Pat", "2": "Hustle" },
    });
    expect(resolveTemplateMessageBody(payload, byName)).toEqual({
      text: "Hi Pat, welcome to Hustle!",
    });
  });

  it("returns null when the template name is not in the map", () => {
    const payload = JSON.stringify({ name: "missing", vars: {} });
    expect(resolveTemplateMessageBody(payload, byName)).toBeNull();
  });

  it("returns null when the mapped body is null", () => {
    const payload = JSON.stringify({ name: "no_body", vars: {} });
    expect(resolveTemplateMessageBody(payload, byName)).toBeNull();
  });

  it("returns null on malformed payload JSON without throwing", () => {
    expect(resolveTemplateMessageBody("not json {{{", byName)).toBeNull();
    expect(resolveTemplateMessageBody(null, byName)).toBeNull();
  });

  it("renders even when vars is absent (placeholders left intact)", () => {
    const payload = JSON.stringify({ name: "welcome" });
    expect(resolveTemplateMessageBody(payload, byName)).toEqual({
      text: "Hi {{1}}, welcome to {{2}}!",
    });
  });
});
