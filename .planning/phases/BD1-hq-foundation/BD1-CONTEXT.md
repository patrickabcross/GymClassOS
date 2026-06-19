# Phase BD1: HQ Foundation - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning
**Mode:** Auto (`--auto`) — recommended defaults selected, grounded in `.planning/research/` (STACK/ARCHITECTURE/PITFALLS) + codebase scout.

<domain>
## Phase Boundary

Stand up the operator control-plane app `apps/hq` as a running, sign-in-able shell with its own data layer and worker — plus the structural guardrails the rest of v2.0 depends on. Concretely BD1 delivers HQ-FND-01..06:

- `apps/hq` forked (copy-out) from agent-native **Dispatch** + **Brain** templates, with single super-admin Better-auth.
- A dedicated HQ Neon project + `packages/hq-schema`, migrated additively via `runMigrations`, seeding an HQ org + super-admin so Brain/Dispatch `accessFilter`/`orgId` queries return data.
- A `services/hq-worker` Fly skeleton (pg-boss against HQ Neon, `/healthz`), with `flyctl` baked into its image for BD2 provisioning.
- CI guards: `apps/hq` fork-boundary + a PII-up guard (no `*connection*`/`*database_url*`/`*dsn*` columns in HQ schema; no studio Neon creds in HQ env).
- An audit of the Anthropic SDK call-site in `createAgentChatPlugin` producing a token-usage wrapper insertion spec consumed by BD2 TEL (no wiring in BD1).

NOT in BD1: telemetry ingest/push (BD2 TEL), provisioning saga (BD2 PROV), Brain cohorts/console (BD3 HQB), dispatcher sends (BD3 HQD), studio-tier work (BD4).
</domain>

<decisions>
## Implementation Decisions

### Template Composition (HQ-FND-02)
- **D-01:** Fork **Dispatch** as the `apps/hq` app shell (it is the control-plane template) and copy **Brain** surfaces into `apps/hq/` for the customer-context layer. Copy-out only — `templates/` is never edited in place (matches how `apps/staff-web` adapted Mail/Calendar).
- **D-02:** **Exclude the Videos template** from `apps/hq` (Remotion 4.x + react-three + render cluster — no BD1/BD3 feature needs it; HQD-05 video is lowest priority and reconsidered later).
- **D-03:** **Defer Content real-time collab (Yjs)** — single super-admin makes CRDT collaboration unnecessary. If a Content surface is copied for HQD-04 later, take the non-collab path.
- **D-04:** Record every copied file's origin in `apps/hq/MODIFICATIONS.md` (fork-boundary discipline + upstream merge tractability).

### HQ Auth & Isolation (HQ-FND-01)
- **D-05:** Better-auth **single super-admin** for v2.0 (email/password + magic link acceptable; OAuth deferred). Multi-user/roles is `HQ-FUT-01`.
- **D-06:** Isolation is **deployment-level**: HQ has its own Better-auth instance + its own Neon. A studio staff credential cannot authenticate to HQ and HQ admin cannot authenticate to a studio — there is no shared session store. No allowlist gymnastics required.

### HQ Data Layer (HQ-FND-03, HQ-FND-04)
- **D-07:** New workspace package **`packages/hq-schema`** holds the HQ Drizzle schema (studio registry, provisioning_runs, telemetry tables land here in BD2). Added to `pnpm-workspace.yaml` in BD1.
- **D-08:** HQ runs against its **own dedicated Neon project** (separate from every studio Neon). Provision the HQ Neon project via Neon MCP (`create_project`) or document the connection-string env for the operator; never co-locate with a studio DB.
- **D-09:** Schema changes are **strictly additive** via `runMigrations` in the HQ app's db plugin — no `drizzle-kit push`, no destructive SQL (carries the project-wide no-breaking-DB-changes rule).
- **D-10:** **Seed an HQ org + super-admin row inside `runMigrations`** (not at app boot), so Brain/Dispatch `accessFilter`/`orgId` queries return non-empty results immediately (Pitfall F-02).

### hq-worker Skeleton (HQ-FND-05)
- **D-11:** `services/hq-worker` mirrors `services/worker` structure (pg-boss bootstrap + `/healthz` on its own port). Hosts the provisioning saga (BD2) + scheduled jobs.
- **D-12:** **Bake `flyctl` into the hq-worker container image in BD1** (base image + pinned version), because Fly secrets cannot be set via the Machines REST API — BD2 PROV will shell out to `flyctl` via `execa`. Doing it now means PROV doesn't reshape the image.
- **D-13:** Fly config for hq-worker follows the existing `services/edge-webhooks/fly.toml` single-app/two-process precedent; exact topology finalized in planning.

### CI Guards (HQ-FND-06)
- **D-14:** Add two guards to the existing `pnpm guards` chain (`scripts/guard-*.mjs` pattern, Node-native recursive walk — Windows-friendly): (a) **fork-boundary guard** ensuring `apps/hq` never imports/edits `templates/` in place; (b) **PII-up guard** failing the build if any `packages/hq-schema` column name matches `*connection*`/`*database_url*`/`*dsn*`, or if a studio Neon connection string appears in HQ env/config.
- **D-15:** Guards are wired into both CI and `pnpm prep` so they block locally too (matches existing guard precedent).

### Anthropic Call-Site Audit (gates BD2 TEL-01)
- **D-16:** Locate the exact Anthropic SDK invocation inside `createAgentChatPlugin` (in `@agent-native/core`) where `response.usage.input_tokens`/`output_tokens` are available. **Document a wrapper insertion spec** in BD1's SUMMARY (file, function, interception point) — TEL-01 wires the per-studio token-usage capture in BD2. No token wiring in BD1.

### Claude's Discretion
- Exact Better-auth method (password vs magic link), hq-worker port number, guard script internals, and the apps/hq route/layout shape are at Claude's discretion — follow `apps/staff-web` + `services/worker` conventions.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone planning
- `.planning/PROJECT.md` — v2.0 milestone goals, three-tier model, constraints, key decisions
- `.planning/REQUIREMENTS.md` — HQ-FND-01..06 acceptance criteria
- `.planning/research/SUMMARY.md` — synthesized stack/architecture/pitfalls + BD phase grouping
- `.planning/research/STACK.md` — new deps (`@neondatabase/api-client`, `@vercel/sdk`, `execa`), flyctl-not-REST finding, template dep inventory
- `.planning/research/ARCHITECTURE.md` §V2-0..V2-14 — `apps/hq` topology, fork discipline, PII boundary mechanisms, hq-worker, build order
- `.planning/research/PITFALLS.md` — F-02 (HQ org seed), PII-up boundary vectors, fork-boundary adaptation traps

### Codebase patterns to mirror
- `apps/staff-web/server/plugins/auth.ts` — Better-auth plugin wiring precedent
- `apps/staff-web/server/db/index.ts`, `apps/staff-web/server/db/schema.ts` — Drizzle + runMigrations precedent
- `services/worker/src/` (`boss.ts`, `index.ts`, `queues/`, `lib/`) — pg-boss worker skeleton to mirror for `services/hq-worker`
- `services/edge-webhooks/fly.toml` — Fly app config precedent
- `scripts/guard-no-unscoped-queries.mjs`, `scripts/guard-no-env-credentials.mjs` — guard script patterns to copy for the new HQ guards
- `package.json` `"guards"` script — chain to extend
- `templates/dispatch/`, `templates/brain/` — fork sources for `apps/hq`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `templates/dispatch/` + `templates/brain/` — direct fork sources for the HQ shell + context layer.
- `services/worker/` — complete pg-boss worker skeleton (boss bootstrap, queues, lib/db mirror) to clone for `services/hq-worker`.
- `apps/staff-web/server/plugins/` — Better-auth + db plugin patterns (composable Nitro plugin precedent from P1b.1).
- `scripts/guard-*.mjs` — 12 existing guards using Node-native recursive `readdirSync` walks; new guards follow the same shape and join the `pnpm guards` chain.

### Established Patterns
- Additive-only migrations applied via `runMigrations` / direct-to-Neon (no `drizzle-kit push` — enforced by `guard-no-drizzle-push.mjs`).
- Local pg-core Drizzle mirror inside each service (avoids cross-app dialect-typing friction) — `services/hq-worker` should follow this until `packages/hq-schema` is consumable.
- `@/` path alias in staff-web; React Router v7 loaders return plain objects (no `json()`).

### Integration Points
- `pnpm-workspace.yaml` — add `apps/hq`, `packages/hq-schema`, `services/hq-worker`.
- `package.json` `"guards"` chain — add `guard:hq-fork-boundary` + `guard:hq-no-pii`.
- New Neon project (HQ) — independent of `gymos-demo`.
</code_context>

<specifics>
## Specific Ideas

- HQ is the operator control plane — keep it visually/functionally distinct from `apps/staff-web`; it is NOT a studio surface.
- The token-usage audit output is a hard prerequisite the BD2 TEL plan consumes — treat it as a BD1 deliverable, not a nice-to-have.
- No local dev server constraint applies to any RR-v7/Nitro app (NitroViteError) — verify via deploy / `tsc` / unit tests, not `pnpm dev`.
</specifics>

<deferred>
## Deferred Ideas

- Multi-user HQ admin + roles (`HQ-FUT-01`) — v2.0 is single super-admin.
- Yjs collaborative editing on HQ Content surfaces (`HQ-FUT-02`).
- HQD Video/Remotion render pipeline — out of BD1; lowest priority within v2.0 (HQD-05).
- Telemetry tables, provisioning tables, studio registry columns — land in `packages/hq-schema` during BD2 (BD1 sets up the package; BD2 fills domain tables).
</deferred>

---

*Phase: BD1-hq-foundation*
*Context gathered: 2026-06-19*
