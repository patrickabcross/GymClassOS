import { GATED_ACTIONS } from "./gated-actions.js";

// LOCKED scope (MA4-CONTEXT.md): READ + DASHBOARD ONLY. Exactly these 12 verbs.
// NOT ALL−GATED subtraction (the static registry has ~80 actions incl. upstream
// Mail + staff-only verbs that subtraction would leak). Explicit allow-list only.
export const MOBILE_ADMIN_ALLOWLIST = [
  // Tier 1 — reads
  "list-fill-rate",
  "list-renewals",
  "list-revenue",
  "list-payments",
  "list-at-risk-members",
  "list-inbox-summary",
  "list-classes",
  "list-members",
  "list-trainers",
  // Tier 2 — dashboard / board authoring
  "upsert-section-note",
  "create-task",
  "complete-task",
] as const;

// Minimal structural shape of a loaded action registry entry we depend on.
type RegistryLike = Record<
  string,
  {
    tool: { description: string; parameters: unknown };
    run: (input: any) => Promise<any>;
  }
>;

export type AdminTool = {
  name: string;
  description: string;
  input_schema: unknown;
};

// PURE + testable: takes the registry (and optionally the allow-list) as args so
// the unit test can pass a stub registry / a deliberately-polluted allow-list
// WITHOUT importing the core framework runtime (vitest ESM/CJS caveat — BD4-01).
export function buildAdminToolList(
  registry: RegistryLike,
  allowlist: readonly string[] = MOBILE_ADMIN_ALLOWLIST,
): AdminTool[] {
  return allowlist
    .filter((name) => !GATED_ACTIONS.has(name)) // defensive structural filter
    .filter((name) => Boolean(registry[name])) // skip anything missing from registry
    .map((name) => ({
      name,
      description: registry[name].tool.description,
      input_schema: registry[name].tool.parameters,
    }));
}
