import { describe, it, expect } from "vitest";
import {
  renderTemplateBody,
  extractBodyText,
  renderApprovedTemplateBody,
} from "./templateBody.js";

describe("renderTemplateBody", () => {
  it("substitutes {{N}} tokens from the vars map", () => {
    expect(
      renderTemplateBody("Hi {{1}}, see you at {{2}}!", {
        1: "Pat",
        2: "Yoga",
      }),
    ).toBe("Hi Pat, see you at Yoga!");
  });

  it("leaves unknown placeholders intact (partial vars)", () => {
    expect(renderTemplateBody("Hi {{1}} and {{2}}", { 1: "Pat" })).toBe(
      "Hi Pat and {{2}}",
    );
  });

  it("leaves text unchanged when vars is undefined", () => {
    expect(renderTemplateBody("Hello {{1}}", undefined)).toBe("Hello {{1}}");
  });

  it("returns plain text unchanged when there are no placeholders", () => {
    expect(renderTemplateBody("No tokens here", { 1: "x" })).toBe(
      "No tokens here",
    );
  });
});

describe("extractBodyText", () => {
  it("extracts BODY text from a JSON string wrapper (uppercase type)", () => {
    const json = JSON.stringify({
      components: [
        { type: "HEADER", text: "Header" },
        { type: "BODY", text: "Body text {{1}}" },
      ],
    });
    expect(extractBodyText(json)).toBe("Body text {{1}}");
  });

  it("matches the body type case-insensitively", () => {
    const json = JSON.stringify({ components: [{ type: "body", text: "lc" }] });
    expect(extractBodyText(json)).toBe("lc");
  });

  it("accepts an already-parsed wrapped object", () => {
    expect(
      extractBodyText({ components: [{ type: "BODY", text: "parsed" }] }),
    ).toBe("parsed");
  });

  it("accepts a bare components array", () => {
    expect(extractBodyText([{ type: "BODY", text: "bare" }])).toBe("bare");
  });

  it("returns null on unparseable JSON string", () => {
    expect(extractBodyText("not-json")).toBeNull();
  });

  it("returns null when there is no BODY component", () => {
    expect(
      extractBodyText(JSON.stringify({ components: [{ type: "FOOTER" }] })),
    ).toBeNull();
  });

  it("returns null for null/undefined/non-object input", () => {
    expect(extractBodyText(null)).toBeNull();
    expect(extractBodyText(undefined)).toBeNull();
    expect(extractBodyText(42)).toBeNull();
  });

  it("returns null when BODY text is not a string", () => {
    expect(
      extractBodyText({ components: [{ type: "BODY", text: 123 }] }),
    ).toBeNull();
  });
});

describe("renderApprovedTemplateBody", () => {
  it("extracts the BODY and substitutes vars", () => {
    const json = JSON.stringify({
      components: [{ type: "BODY", text: "Hi {{1}}, your {{2}} class is on" }],
    });
    expect(renderApprovedTemplateBody(json, { 1: "Pat", 2: "Yoga" })).toBe(
      "Hi Pat, your Yoga class is on",
    );
  });

  it("returns null when no BODY component exists (caller falls back)", () => {
    const json = JSON.stringify({ components: [{ type: "FOOTER" }] });
    expect(renderApprovedTemplateBody(json, { 1: "x" })).toBeNull();
  });

  it("returns null on malformed components_json", () => {
    expect(renderApprovedTemplateBody("not-json", { 1: "x" })).toBeNull();
    expect(renderApprovedTemplateBody(undefined, undefined)).toBeNull();
  });

  it("returns null when the BODY text is empty (never an empty string)", () => {
    const json = JSON.stringify({ components: [{ type: "BODY", text: "" }] });
    expect(renderApprovedTemplateBody(json, {})).toBeNull();
  });

  it("renders even with no vars (no placeholders)", () => {
    const json = JSON.stringify({
      components: [{ type: "BODY", text: "See you soon" }],
    });
    expect(renderApprovedTemplateBody(json, undefined)).toBe("See you soon");
  });
});
