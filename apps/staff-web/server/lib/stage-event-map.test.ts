import { describe, it, expect } from "vitest";
import {
  resolveStageEvent,
  DEFAULT_STAGE_EVENT_MAP,
} from "./stage-event-map.js";

// ---------------------------------------------------------------------------
// Unit tests for the pure stageEventMap resolver (D-05 spec).
//
// Covers: null/undefined → defaults, full JSON override, partial override
// with fallback, malformed JSON fallback, and object-input branch.
// ---------------------------------------------------------------------------

describe("DEFAULT_STAGE_EVENT_MAP", () => {
  it("has the 4 standard Meta event names", () => {
    expect(DEFAULT_STAGE_EVENT_MAP).toEqual({
      lead: "Lead",
      contact: "Contact",
      purchase: "Purchase",
      schedule: "Schedule",
    });
  });
});

describe("resolveStageEvent — null / undefined input (D-05 defaults)", () => {
  it("null config → 'Lead' for lead", () => {
    expect(resolveStageEvent(null, "lead")).toBe("Lead");
  });

  it("undefined config → 'Contact' for contact", () => {
    expect(resolveStageEvent(undefined, "contact")).toBe("Contact");
  });

  it("empty string config → 'Purchase' for purchase", () => {
    expect(resolveStageEvent("", "purchase")).toBe("Purchase");
  });

  it("null config → 'Schedule' for schedule", () => {
    expect(resolveStageEvent(null, "schedule")).toBe("Schedule");
  });
});

describe("resolveStageEvent — full JSON string override", () => {
  it("full map JSON → returns mapped value for purchase", () => {
    const config = JSON.stringify({
      lead: "Lead",
      contact: "Contact",
      purchase: "Purchase",
      schedule: "Schedule",
    });
    expect(resolveStageEvent(config, "purchase")).toBe("Purchase");
  });

  it("custom lead name → returned", () => {
    expect(
      resolveStageEvent('{"lead":"CustomLeadName"}', "lead"),
    ).toBe("CustomLeadName");
  });
});

describe("resolveStageEvent — partial JSON (missing key falls back to default)", () => {
  it("config only has lead key → contact falls back to 'Contact'", () => {
    expect(
      resolveStageEvent('{"lead":"CustomLeadName"}', "contact"),
    ).toBe("Contact");
  });

  it("config only has lead key → purchase falls back to 'Purchase'", () => {
    expect(
      resolveStageEvent('{"lead":"CustomLeadName"}', "purchase"),
    ).toBe("Purchase");
  });
});

describe("resolveStageEvent — malformed JSON (never throws, falls back to default)", () => {
  it("malformed JSON → 'Lead' for lead (no throw)", () => {
    expect(resolveStageEvent("not-json{{{", "lead")).toBe("Lead");
  });

  it("malformed JSON → 'Contact' for contact (no throw)", () => {
    expect(resolveStageEvent("not-json{{{", "contact")).toBe("Contact");
  });

  it("empty-object JSON → defaults apply", () => {
    expect(resolveStageEvent("{}", "schedule")).toBe("Schedule");
  });

  it("null map value → falls back to default", () => {
    expect(resolveStageEvent('{"lead":null}', "lead")).toBe("Lead");
  });

  it("empty-string map value → falls back to default", () => {
    expect(resolveStageEvent('{"lead":""}', "lead")).toBe("Lead");
  });
});

describe("resolveStageEvent — object input branch (JSONB driver may return parsed object)", () => {
  it("plain object with all keys → returns mapped value", () => {
    expect(
      resolveStageEvent(
        { lead: "Lead", contact: "Contact", purchase: "Purchase", schedule: "Schedule" },
        "purchase",
      ),
    ).toBe("Purchase");
  });

  it("partial object → missing key falls back to default", () => {
    expect(resolveStageEvent({ lead: "Lead" }, "contact")).toBe("Contact");
  });

  it("object with custom lead name → returned", () => {
    expect(resolveStageEvent({ lead: "CustomLeadName" }, "lead")).toBe(
      "CustomLeadName",
    );
  });

  it("empty object → defaults apply", () => {
    expect(resolveStageEvent({}, "schedule")).toBe("Schedule");
  });
});
