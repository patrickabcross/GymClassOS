---
phase: BD1-hq-foundation
verified: 2026-06-19T11:55:53Z
status: human_needed
score: 6/6 must-haves verified (code-level); 3 items deferred on external dependencies
re_verification: false
human_verification:
  - test: "Deploy apps/hq to Vercel with DATABASE_URL (HQ Neon), BETTER_AUTH_SECRET, HQ_SUPER_ADMIN_EMAIL, BETTER_AUTH_URL set; navigate to the deployed URL and sign in with the super-admin email"
    expected: "Sign-in succeeds, operator lands on the HQ dashboard; no redirect to /access-denied"
    why_human: "apps/hq Vercel deploy requires the operator to provision a HQ Neon project and configure three env vars; no in-repo simulation possible (NitroViteError + no local dev server)"
  - test: "Attempt to sign in to apps/hq with a known studio staff credential (e.g. coach@somegym.com)"
    expected: "Redirect to /access-denied (302); user cannot access any HQ route"
    why_human: "Runtime Better-auth gate; requires live deploy and a real sign-in attempt"
  - test: "Deploy services/hq-worker to Fly with DATABASE_URL_UNPOOLED pointing at HQ Neon; curl GET /healthz on the deployed service port"
    expected: "HTTP 200 with JSON body containing ok:true; pg-boss connects without error"
    why_human: "Requires Fly app creation (fly app create gymos-hq-worker), setting Fly secrets, and fly deploy; cannot run without operator Fly account and HQ Neon credentials"
---

# Phase BD1: HQ Foundation Verification Report

**Phase Goal:** The operator can sign in to a running `apps/hq` control plane backed by its own Neon project; the structural PII boundary + fork-discipline CI guards are in place from day one; the Anthropic call-site is audited so the token-usage wrapper can be wired in BD2.

**Verified:** 2026-06-19T11:55:53Z
**Status:** human_needed — all code-level must-haves verified (6/6); 3 items require live-deploy + external credentials
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | apps/hq exists as a React Router v7 SSR app forked from Dispatch + Brain | VERIFIED | `apps/hq/` present; `react-router.config.ts` with `ssr: true`; `pnpm --filter @gymos/hq typecheck` exits 0 |
| 2 | Single super-admin Better-auth gate in place (HQ-FND-01) | VERIFIED | `auth.ts` with `createAuthPlugin` + `HQ_SUPER_ADMIN_EMAIL` gate; 19/19 unit tests pass including studio-staff rejection tests |
| 3 | HQ schema package exists, wired to dedicated Neon via runMigrations (HQ-FND-03) | VERIFIED | `packages/hq-schema` with `@gymos/hq-schema`; `apps/hq/server/plugins/db.ts` calls `runMigrations(hqMigrations, { table: HQ_MIGRATIONS_TABLE })`; no drizzle-kit push anywhere |
| 4 | HQ org + super-admin seeded idempotently in migrations (HQ-FND-04) | VERIFIED | Migrations v2/v3 in `packages/hq-schema/src/migrations.ts` with `ON CONFLICT (id) DO NOTHING`; `HQ_ORG_ID = "hq-org-gymclassos-v1"` in `constants.ts` |
| 5 | hq-worker Fly skeleton with flyctl baked in (HQ-FND-05) | VERIFIED | `services/hq-worker/` with `/healthz` Hono route; `Dockerfile` installs flyctl v0.3.96 at pinned tag; `fly.toml` with `http_checks` on `/healthz`; 8/8 env tests pass |
| 6 | Fork-boundary + PII-up CI guards wired and passing (HQ-FND-06) | VERIFIED | `scripts/guard-hq-fork-boundary.mjs` and `scripts/guard-hq-no-pii.mjs` both exit 0 on current codebase; wired into `"guards"` chain in root `package.json` |
| 7 | Anthropic call-site audited with concrete seam spec for BD2 | VERIFIED | `BD1-ANTHROPIC-AUDIT.md` (354 lines); call chain traced to `production-agent.ts:2654 recordUsage`; Option A (DB-trigger on `token_usage` INSERT) and Option B (pnpm patch) specified with implementation detail |
| 8 | templates/ untouched (fork-boundary) | VERIFIED | `git diff HEAD -- templates/` returns 0 bytes; `guard-hq-fork-boundary` exits 0 |
| 9 | HQ app typechecks cleanly | VERIFIED | `pnpm --filter @gymos/hq typecheck` exits 0; `pnpm --filter @gymos/hq-schema typecheck` exits 0; `pnpm --filter @gymos/hq-worker typecheck` exits 0 |
| 10 | Operator can sign in to running apps/hq | HUMAN NEEDED | Code complete and correct; requires live Vercel deploy + HQ Neon project + env vars |

**Score:** 9/9 code-verifiable truths VERIFIED; 3 items deferred on external dependency (live deploy)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/hq/package.json` | `@gymos/hq`, `@agent-native/core: workspace:*`, `@gymos/hq-schema: workspace:*` | VERIFIED | All three confirmed present |
| `apps/hq/react-router.config.ts` | RR v7 framework-mode config with `ssr: true` | VERIFIED | 10 lines, `ssr: true` present |
| `apps/hq/MODIFICATIONS.md` | Fork ledger, references Dispatch + Brain, Exclusions section, 20+ lines | VERIFIED | 134 lines; both template sources documented; Exclusions names Videos + Yjs |
| `packages/hq-schema/package.json` | `@gymos/hq-schema`, `drizzle-orm ^0.45.2` | VERIFIED | Both present |
| `packages/hq-schema/src/schema.ts` | No PII columns (`*connection*`/`*database_url*`/`*dsn*`) | VERIFIED | Only JSDoc comment lines reference those strings; no actual column definitions match |
| `packages/hq-schema/src/migrations.ts` | Additive only, ON CONFLICT, BD1-03 extension point | VERIFIED | v1 CREATE TABLE IF NOT EXISTS; v2/v3 ON CONFLICT (id) DO NOTHING seed |
| `packages/hq-schema/src/constants.ts` | `HQ_ORG_ID`, `HQ_ORG_SLUG`, `HQ_ORG_MEMBER_ID` | VERIFIED | All three constants present and exported |
| `apps/hq/server/plugins/db.ts` | `runMigrations(hqMigrations, { table: HQ_MIGRATIONS_TABLE })` | VERIFIED | Exact call confirmed |
| `apps/hq/server/plugins/auth.ts` | `createAuthPlugin` + `HQ_SUPER_ADMIN_EMAIL` + deny-by-default | VERIFIED | All present; `publicPaths: ["/access-denied"]`; redirect on non-admin |
| `apps/hq/server/plugins/auth-helpers.ts` | `isSuperAdmin`, `parseSuperAdminEmail` (no framework imports) | VERIFIED | Pure helpers, no server deps, enables vitest testing |
| `apps/hq/server/plugins/auth.test.ts` | 19 passing unit tests including studio-staff rejection | VERIFIED | 19/19 pass; 5 describe blocks; HQ-FND-01 isolation tests present |
| `apps/hq/.env.example` | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `HQ_SUPER_ADMIN_EMAIL` with "NEVER a studio Neon" warnings | VERIFIED | All four vars documented; "HQ's OWN dedicated Neon" + "NEVER a studio Neon" warnings present |
| `services/hq-worker/src/index.ts` | pg-boss start + `/healthz` Hono route | VERIFIED | `getBoss()` + `admin.get("/healthz", ...)` on PORT 3003 |
| `services/hq-worker/Dockerfile` | flyctl v0.3.96 baked into runtime stage | VERIFIED | Multi-stage build; flyctl installed at pinned GitHub releases tag |
| `services/hq-worker/fly.toml` | `app = 'gymos-hq-worker'`, `http_checks` on `/healthz` | VERIFIED | Both present; `min_machines_running = 1`, `auto_stop_machines = 'off'` |
| `services/hq-worker/src/lib/env.ts` | No WHATSAPP/STRIPE/PGCRYPTO fields | VERIFIED | No studio credentials in Zod env schema |
| `scripts/guard-hq-fork-boundary.mjs` | Exits 0 on current codebase; exits 1 on template import | VERIFIED | Exits 0 confirmed; BD1-06 summary documents negative case was tested and reverted |
| `scripts/guard-hq-no-pii.mjs` | Exits 0 on current codebase; exits 1 on PII column | VERIFIED | Exits 0 confirmed; negative case tested and reverted |
| `.planning/phases/BD1-hq-foundation/BD1-ANTHROPIC-AUDIT.md` | 300+ lines; concrete seam spec with file+line citations | VERIFIED | 354 lines; full call chain traced; Options A + B specified with implementation detail |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `apps/hq/package.json` | `@agent-native/core` | `workspace:*` dependency | VERIFIED | Present in package.json |
| `apps/hq/package.json` | `@gymos/hq-schema` | `workspace:*` dependency | VERIFIED | Present in package.json |
| `apps/hq/server/db/index.ts` | `@gymos/hq-schema` | `import * as hqSchema from "@gymos/hq-schema/schema"` | VERIFIED | `createGetDb` with merged schema confirmed |
| `apps/hq/server/plugins/db.ts` | `runMigrations` | `import { runMigrations } from "@agent-native/core/db"` + `import { hqMigrations, HQ_MIGRATIONS_TABLE }` | VERIFIED | Exact imports and call confirmed |
| `apps/hq/server/plugins/auth.ts` | `HQ_SUPER_ADMIN_EMAIL` | `parseSuperAdminEmail()` from `auth-helpers.ts` | VERIFIED | Gate reads env var via pure helper |
| `pnpm-workspace.yaml` | `apps/hq` | `apps/*` glob | VERIFIED | `apps/*` glob present at line 5 |
| `pnpm-workspace.yaml` | `packages/hq-schema` | `packages/*` glob | VERIFIED | `packages/*` glob present at line 2 |
| `pnpm-workspace.yaml` | `services/hq-worker` | `services/*` glob | VERIFIED | `services/*` glob present at line 6 |
| `package.json` guards chain | `guard-hq-fork-boundary.mjs` | `pnpm guard:hq-fork-boundary` in `"guards"` script | VERIFIED | Appended at end of guards chain |
| `package.json` guards chain | `guard-hq-no-pii.mjs` | `pnpm guard:hq-no-pii` in `"guards"` script | VERIFIED | Appended at end of guards chain |

---

### Data-Flow Trace (Level 4)

Not applicable for this phase. BD1 establishes structural scaffolding (schema packages, auth plugins, CI guards, audit doc). No dynamic data-rendering components were introduced that require data-flow tracing. Brain routes render against empty data intentionally until BD1-02 + BD1-03 are live-applied against a provisioned HQ Neon — this is documented in the SUMMARY as an intentional design decision, not a stub.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| apps/hq typechecks cleanly | `pnpm --filter @gymos/hq typecheck` | Exit 0 (DeprecationWarning only, not an error) | PASS |
| hq-schema typechecks cleanly | `pnpm --filter @gymos/hq-schema typecheck` | Exit 0 | PASS |
| hq-worker typechecks cleanly | `pnpm --filter @gymos/hq-worker typecheck` | Exit 0 | PASS |
| 19 unit tests pass (HQ-FND-01 auth) | `pnpm --filter @gymos/hq test` | 1 file, 19/19 passed | PASS |
| 8 unit tests pass (hq-worker env) | `pnpm --filter @gymos/hq-worker test` | 1 file, 8/8 passed | PASS |
| Fork-boundary guard passes | `node scripts/guard-hq-fork-boundary.mjs` | "clean (no apps/hq imports reach into templates/)" | PASS |
| PII-up guard passes | `node scripts/guard-hq-no-pii.mjs` | "clean (no PII-shaped columns in HQ schema; no real studio conn strings in HQ config)" | PASS |
| No drizzle-kit push anywhere | `node scripts/guard-no-drizzle-push.mjs` | "clean (no `drizzle-kit push` in any build/deploy path)" | PASS |
| templates/ byte-for-byte unchanged | `git diff HEAD -- templates/` | 0 bytes output | PASS |
| All 15 phase commits exist in git log | `git log --oneline \| grep <hash>` | All 15 BD1 commits present | PASS |
| apps/hq sign-in live | Requires Vercel deploy + HQ Neon + env vars | Cannot test without external credentials | SKIP |
| hq-worker /healthz live | Requires `fly deploy` + Fly secrets set | Cannot test without Fly account + HQ Neon unpooled URL | SKIP |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HQ-FND-01 | BD1-03 | Operator can sign in as single super-admin; studio staff accounts cannot authenticate to HQ | SATISFIED (code) + HUMAN NEEDED (live) | `createAuthPlugin` + `isSuperAdmin` gate; 19 unit tests cover studio-staff rejection; live sign-in requires deploy |
| HQ-FND-02 | BD1-01 | `apps/hq` forked from Dispatch + Brain; `templates/` never edited in place | SATISFIED | `git diff HEAD -- templates/` = 0 bytes; `guard-hq-fork-boundary` passes; `MODIFICATIONS.md` with 134-line ledger |
| HQ-FND-03 | BD1-02 | HQ runs against own dedicated Neon; additive `runMigrations` only (no drizzle-kit push, no destructive SQL) | SATISFIED | `runMigrations(hqMigrations, { table: "hq_migrations" })`; guard-no-drizzle-push passes; `.env.example` with "NEVER a studio Neon" warning; DATABASE_URL documented but not hardcoded |
| HQ-FND-04 | BD1-03 | HQ org + super-admin seeded at migration time so Brain/Dispatch queries return results | SATISFIED (code) + HUMAN NEEDED (live apply) | v2/v3 migrations with `ON CONFLICT DO NOTHING`; `HQ_ORG_ID` constant; separate from v1 (FK ordering safe); live apply deferred on HQ Neon provisioning |
| HQ-FND-05 | BD1-04 | `services/hq-worker` Fly skeleton (pg-boss + `/healthz`) | SATISFIED (code) + HUMAN NEEDED (deploy) | `Dockerfile` with flyctl v0.3.96; `fly.toml` with http_check on `/healthz`; 8/8 env tests pass; Fly deploy deferred on operator setup |
| HQ-FND-06 | BD1-06 | CI guards enforce fork-boundary + no PII columns or studio conn strings in HQ schema | SATISFIED | Both guards exit 0 on current codebase; both wired into `"guards"` chain; negative cases tested and reverted per SUMMARY |

All 6 requirements are marked `[x]` complete in `REQUIREMENTS.md` at lines 16-21 and Phase mapping table at lines 104-109.

No orphaned requirements: REQUIREMENTS.md maps HQ-FND-01..06 to Phase BD1 only. TEL-06 references HQ-FND-06 as its enforcement mechanism but belongs to a different phase/plan.

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `services/hq-worker/src/index.ts` | "no domain queues in BD1 skeleton" log line — BD2 queue registrations intentionally absent | Info | Not a data-blocking stub; documented intentional skeleton behavior per BD1-04-SUMMARY.md |
| `packages/hq-schema/src/migrations.ts` v3 | `user_id = 'hq-super-admin-placeholder'` — placeholder member row, not linked to real operator user_id | Warning | Not a blocker; the org row exists so accessFilter queries return data; BD3 must add first-sign-in hook to link real user_id. Documented in BD1-03-SUMMARY.md "Known Stubs" |
| `scripts/guard-db-tool-scoping` | Pre-existing failure in `pnpm guards` chain (60+ stale raw-DB denylist entries); unrelated to BD1 | Info | Pre-dates BD1-06; both new HQ guards pass independently; logged to `deferred-items.md` |

No blockers found. Two warnings are documented intentional partial states (skeleton queue registrations deferred to BD2; placeholder member row deferred to BD3). The pre-existing `guard-db-tool-scoping` failure pre-dates BD1 and is tracked separately.

---

### Human Verification Required

#### 1. Live Sign-in to apps/hq (HQ-FND-01)

**Test:** Provision a HQ Neon project; set `DATABASE_URL` (pooled), `BETTER_AUTH_SECRET` (fresh secret, different from studio), `HQ_SUPER_ADMIN_EMAIL` (operator email), and `BETTER_AUTH_URL` in the Vercel environment for apps/hq; deploy; navigate to the deployment URL; sign in with the super-admin email.

**Expected:** Sign-in succeeds; operator lands on the HQ dashboard (Dispatch + Brain surfaces); no redirect to `/access-denied`.

**Why human:** Requires the operator to provision a real HQ Neon project and configure Vercel environment variables. NitroViteError prevents local dev server; no in-repo simulation of the live auth flow is possible.

#### 2. Studio Staff Rejection at Runtime (HQ-FND-01 isolation)

**Test:** On the deployed apps/hq, attempt to sign in with a credential known to belong to a studio staff member (e.g. an email address registered in the gymos-demo studio Neon but NOT matching `HQ_SUPER_ADMIN_EMAIL`).

**Expected:** Redirected to `/access-denied` (302); cannot access any HQ route regardless of valid Better-auth session.

**Why human:** The unit tests (19/19 passing) cover `isSuperAdmin` logic exhaustively including studio-staff rejection, but live runtime confirmation requires a deployed HQ app and a real studio staff credential.

#### 3. hq-worker /healthz on Fly (HQ-FND-05)

**Test:** Run `fly app create gymos-hq-worker`, `fly secrets set DATABASE_URL_UNPOOLED=<hq-neon-unpooled>`, `fly deploy -a gymos-hq-worker --config services/hq-worker/fly.toml`; then `curl https://gymos-hq-worker.fly.dev/healthz` (or the internal Fly address on port 3003).

**Expected:** HTTP 200 JSON `{ ok: true, version: ..., app: "hq-worker" }`; no pg-boss connection error in logs.

**Why human:** Requires operator Fly account, the HQ Neon unpooled connection string, and a live `fly deploy`. Fly does not offer a local simulation path.

---

### Gaps Summary

No gaps. All six code-level must-haves are verified. The three human_needed items are legitimately deferred on external operator credentials (HQ Neon project, Vercel env vars, Fly account) that cannot be created in-repo — they are not defects in the delivered code.

The one partial stub (placeholder member row `hq-super-admin-placeholder`) is intentionally documented and scoped to BD3. It does not block BD1's goal: the org row exists so Brain/Dispatch `accessFilter`/`orgId` queries return results on day one, and sign-in is gated by `isSuperAdmin` (env-configured, runtime-enforced).

The pre-existing `guard:db-tool-scoping` failure in the guards chain pre-dates BD1 and is tracked in `deferred-items.md` — it is not introduced or worsened by BD1.

---

_Verified: 2026-06-19T11:55:53Z_
_Verifier: Claude (gsd-verifier)_
