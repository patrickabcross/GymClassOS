import { describe, it, expect } from "vitest";
import { GATED_ACTIONS, GATED_ACTION_LIST } from "./gated-actions.js";
import {
  MOBILE_ADMIN_ALLOWLIST,
  buildAdminToolList,
} from "./mobile-admin-tools.js";

const GATED = [
  "send-template-to-members",
  "create-checkout-link",
  "cancel-occurrence",
  "reschedule-occurrence",
  "publish-form",
];

// Verbs that mutate studio data — must NEVER be in the read+dashboard allow-list.
const MUTATING = [
  ...GATED,
  "update-member",
  "create-class-definition",
  "create-class-occurrence",
  "set-occurrence-capacity",
  "update-class-definition",
  "mark-occurrence-complete",
  "create-trainer",
  "update-trainer",
  "create-schedule-rule",
  "update-schedule-rule",
  "deactivate-schedule-rule",
  "save-segment",
  "import-leads",
  "content-create-document",
  "content-update-document",
  "video-create-composition",
  "send-email",
  "archive-email",
];

function stubRegistry(names: string[]) {
  const reg: Record<string, any> = {};
  for (const n of names)
    reg[n] = {
      tool: {
        description: `desc ${n}`,
        parameters: { type: "object", properties: {} },
      },
      run: async () => ({}),
    };
  return reg;
}

describe("mobile admin tool allow-list (AI-02)", () => {
  it("GATED_ACTIONS is exactly the five gated Tier-3 verbs", () => {
    expect([...GATED_ACTIONS].sort()).toEqual([...GATED].sort());
    expect([...GATED_ACTION_LIST].sort()).toEqual([...GATED].sort());
  });

  it("MOBILE_ADMIN_ALLOWLIST is exactly the 12 locked read+dashboard verbs", () => {
    expect([...MOBILE_ADMIN_ALLOWLIST].sort()).toEqual(
      [
        "complete-task",
        "create-task",
        "list-at-risk-members",
        "list-classes",
        "list-fill-rate",
        "list-inbox-summary",
        "list-members",
        "list-payments",
        "list-renewals",
        "list-revenue",
        "list-trainers",
        "upsert-section-note",
      ].sort(),
    );
  });

  it("the allow-list contains no gated or mutating verb", () => {
    for (const m of MUTATING) expect(MOBILE_ADMIN_ALLOWLIST).not.toContain(m);
  });

  it("the BUILT tool list excludes every gated verb even when present in the registry", () => {
    const reg = stubRegistry([...MOBILE_ADMIN_ALLOWLIST, ...GATED]);
    const names = buildAdminToolList(reg).map((t) => t.name);
    for (const g of GATED) expect(names).not.toContain(g);
    expect(names.sort()).toEqual([...MOBILE_ADMIN_ALLOWLIST].sort());
  });

  it("the defensive GATED_ACTIONS filter strips a gated verb wrongly added to the allow-list", () => {
    const polluted = [
      ...MOBILE_ADMIN_ALLOWLIST,
      "cancel-occurrence",
      "create-checkout-link",
    ];
    const reg = stubRegistry(polluted);
    const names = buildAdminToolList(reg, polluted).map((t) => t.name);
    expect(names).not.toContain("cancel-occurrence");
    expect(names).not.toContain("create-checkout-link");
  });
});
