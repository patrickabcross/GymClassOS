import { describe, expect, it } from "vitest";
import { parseTemplateBody, buildLeadAckVars } from "./lead-ack.js";

// ---------------------------------------------------------------------------
// parseTemplateBody — pure function tests (no API calls)
// ---------------------------------------------------------------------------

describe("parseTemplateBody", () => {
  it("Test 1: parses a normal 2-var body", () => {
    const componentsJson = JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, thanks for your interest in {{2}}. Feel free to reply here when you're ready.",
        },
      ],
    });
    const result = parseTemplateBody(componentsJson);
    expect(result.bodyText).toBe(
      "Hi {{1}}, thanks for your interest in {{2}}. Feel free to reply here when you're ready.",
    );
    expect(result.varCount).toBe(2);
  });

  it("Test 2: 0-var BODY component returns varCount 0 and the body text", () => {
    const componentsJson = JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Welcome to our gym! No placeholders here.",
        },
      ],
    });
    const result = parseTemplateBody(componentsJson);
    expect(result.bodyText).toBe("Welcome to our gym! No placeholders here.");
    expect(result.varCount).toBe(0);
  });

  it("Test 3: malformed JSON returns empty bodyText and varCount 0", () => {
    const result = parseTemplateBody("{ not json");
    expect(result.bodyText).toBe("");
    expect(result.varCount).toBe(0);
  });

  it("Test 4: missing BODY component (only HEADER/FOOTER) returns empty bodyText and varCount 0", () => {
    const componentsJson = JSON.stringify({
      components: [
        { type: "HEADER", text: "Welcome" },
        { type: "FOOTER", text: "Reply STOP to opt out" },
      ],
    });
    const result = parseTemplateBody(componentsJson);
    expect(result.bodyText).toBe("");
    expect(result.varCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildLeadAckVars — fallback path tests only (no live API calls)
// ---------------------------------------------------------------------------

describe("buildLeadAckVars", () => {
  it("Test 5: returns deterministic fallback when ANTHROPIC_API_KEY is unset", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      const result = await buildLeadAckVars({
        formTitle: "Schedule Enquiry",
        fields: [
          {
            id: "f1",
            type: "text",
            label: "Your name",
            required: true,
          },
          {
            id: "f2",
            type: "text",
            label: "Interest",
            required: false,
          },
        ],
        data: { f1: "Sarah Jones", f2: "boxing" },
        firstName: "Sarah",
        bodyText:
          "Hi {{1}}, thanks for your interest in {{2}}. Feel free to reply here when you're ready.",
        varCount: 2,
        classCatalog: [
          { name: "Boxing", category: "combat", description: null },
        ],
      });
      expect(result["1"]).toBe("Sarah");
      expect(result["2"]).toBe("our classes");
    } finally {
      if (saved !== undefined) {
        process.env.ANTHROPIC_API_KEY = saved;
      }
    }
  });

  it("Test 6: varCount 0 returns empty object without throwing", async () => {
    const result = await buildLeadAckVars({
      formTitle: "Contact Us",
      fields: [],
      data: {},
      firstName: "Alice",
      bodyText: "Welcome to our gym!",
      varCount: 0,
      classCatalog: [],
    });
    expect(result).toEqual({});
  });
});
