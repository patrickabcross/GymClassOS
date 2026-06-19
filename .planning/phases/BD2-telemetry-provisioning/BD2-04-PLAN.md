---
phase: BD2-telemetry-provisioning
plan: 04
type: execute
wave: 2
depends_on: ["01", "03"]
files_modified:
  - apps/hq/server/routes/api/telemetry/index.post.ts
  - apps/hq/server/plugins/auth.ts
  - apps/hq/server/lib/telemetry-token.ts
  - apps/hq/server/routes/api/telemetry/index.post.test.ts
  - services/worker/src/queues/telemetry-push.ts
  - services/worker/src/index.ts
  - services/worker/src/lib/env.ts
  - services/worker/.env.example
autonomous: true
requirements: [TEL-03, TEL-04, TEL-05, TEL-06]
must_haves:
  truths:
    - "A studio daily pg-boss job builds a TelemetrySnapshot and POSTs it to HQ /api/telemetry with the per-studio bearer token, then resets the accumulators"
    - "HQ /api/telemetry validates with TelemetrySnapshot.strict() — a body with member_email returns HTTP 422"
    - "HQ records last_telemetry_received_at per studio; an unknown/revoked token returns 401"
    - "HQ never accepts or stores a studio connection string (no such field in the ingest path)"
  artifacts:
    - path: "apps/hq/server/routes/api/telemetry/index.post.ts"
      provides: "Public telemetry ingest endpoint: sha256 token lookup + .strict() parse + snapshot/token-usage upsert"
      contains: "TelemetrySnapshot"
    - path: "services/worker/src/queues/telemetry-push.ts"
      provides: "Daily pg-boss job: build snapshot, POST to HQ, reset accumulators"
      exports: ["registerTelemetryPush"]
  key_links:
    - from: "services/worker/src/queues/telemetry-push.ts"
      to: "HQ POST /api/telemetry"
      via: "fetch with Authorization: Bearer STUDIO_TELEMETRY_TOKEN"
      pattern: "Authorization.*Bearer"
    - from: "apps/hq/server/routes/api/telemetry/index.post.ts"
      to: "hq_telemetry_snapshots + hq_token_usage + last_telemetry_received_at"
      via: "Drizzle onConflictDoUpdate upserts"
      pattern: "lastTelemetryReceivedAt|last_telemetry_received_at"
---

<objective>
Wire the telemetry TRANSPORT + INGEST (TEL-03..06): the studio-side daily pg-boss push job and the HQ-side `POST /api/telemetry` endpoint. The endpoint authenticates by sha256-hashing the bearer token against `hq_studio_tokens`, validates the body with `TelemetrySnapshot.strict()` (422 on any PII/unknown field — D-04), and upserts the snapshot + token usage while recording `last_telemetry_received_at`.

Purpose: closes the loop from BD2-03's capture to HQ storage. The strict schema is the structural PII-up wall (D-06/TEL-06). Depends on BD2-01 (hq tables + TelemetrySnapshot) and BD2-03 (studio_telemetry_state + buildTelemetrySnapshot).
Output: ingest route (public path), token-hash helper, a strict-rejection test, the studio push job + its env vars + worker registration.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/BD2-telemetry-provisioning/BD2-CONTEXT.md
@.planning/phases/BD2-telemetry-provisioning/BD2-RESEARCH.md
@.planning/phases/BD2-telemetry-provisioning/BD2-01-PLAN.md
@.planning/phases/BD2-telemetry-provisioning/BD2-03-PLAN.md

<interfaces>
<!-- HQ ingest endpoint reference impl is BD2-RESEARCH.md "Pattern 7". Studio push job is "Pattern 6". -->

From apps/hq/server/routes/api/_agent-native/brain/ingest.post.ts — the H3 route + bearer-token + sha256 + getDb pattern to mirror (defineEventHandler, getHeader auth, createError 401, getDb/schema from "../../../../db/index.js"). Note the route-file naming: `<name>.post.ts`. Place telemetry at `apps/hq/server/routes/api/telemetry/index.post.ts`.

From apps/hq/server/plugins/auth.ts — `createAuthPlugin({ publicPaths: ["/access-denied"] })`. The telemetry ingest is server-to-server (token-authenticated, not session) → MUST be added to publicPaths so the session guard does not 302 it. Add "/api/telemetry".

From @gymos/hq-schema (BD2-01): hqStudioTokens (studioId, tokenHash, revokedAt), hqTelemetrySnapshots (studioId, periodStart, periodEnd, payloadJson, receivedAt, lastTelemetryReceivedAt, UNIQUE(studioId, periodStart)), hqTokenUsage (studioId, date, inputTokens, outputTokens, requestCount, PK(studioId,date)), TelemetrySnapshot.

From services/worker/src/queues/housekeeping.ts — the boss.work(queue, handler) + boss.schedule(queue, cron, {}, { tz:"UTC" }) pattern + "register consumer FIRST". Mirror EXACTLY. Studio worker registration goes in services/worker/src/index.ts (createQueue loop + register call).

From services/worker/src/domain/buildTelemetrySnapshot.ts (BD2-03): buildTelemetrySnapshot(db, studioId, state).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: HQ ingest endpoint (sha256 token + .strict() 422 + upsert + last_telemetry_received_at) + token helper</name>
  <read_first>BD2-RESEARCH.md "Pattern 7: HQ Ingest Endpoint" (the full reference handler), apps/hq/server/routes/api/_agent-native/brain/ingest.post.ts (bearer + sha256 + getDb pattern), apps/hq/server/plugins/auth.ts (publicPaths), BD2-01-PLAN.md (hqStudioTokens / hqTelemetrySnapshots / hqTokenUsage / TelemetrySnapshot shapes), Pitfall P-06 (.strict() mandatory).</read_first>
  <files>apps/hq/server/lib/telemetry-token.ts, apps/hq/server/routes/api/telemetry/index.post.ts, apps/hq/server/plugins/auth.ts, apps/hq/server/routes/api/telemetry/index.post.test.ts</files>
  <behavior>
    - POST with no Authorization header → 401.
    - POST with a bearer token whose sha256 is not in hq_studio_tokens (or whose row has revoked_at set) → 401.
    - POST with a valid token but a body containing `member_email` (or any field outside the allow-list) → 422 (TelemetrySnapshot.strict() rejects it).
    - POST with a valid token + valid aggregate body → 200/`{ok:true}`; inserts/updates hq_telemetry_snapshots (UNIQUE studioId+periodStart upsert), accumulates hq_token_usage, sets last_telemetry_received_at.
    - A second POST with the same (studioId, periodStart) updates rather than duplicates (onConflictDoUpdate).
  </behavior>
  <action>
    1. `telemetry-token.ts`: export `hashToken(plain: string): string` = `createHash("sha256").update(plain).digest("hex")` (Node crypto). Also export `generateTelemetryToken(): string` (nanoid 32+ chars) for reuse by BD2-06 step 7. (Constant-time compare not needed here — lookup is by hash equality in SQL, which is itself a digest comparison; but keep timingSafeEqual available if comparing two hex strings of equal length.)
    2. `index.post.ts` (defineEventHandler): extract bearer token (mirror brain ingest); `const hash = hashToken(token)`; lookup `hqStudioTokens` WHERE tokenHash=hash AND revokedAt IS NULL → 401 if none; `const parsed = TelemetrySnapshot.strict().safeParse(await readBody(event))` → on failure `createError({ statusCode: 422, data: parsed.error })`; upsert hq_telemetry_snapshots (id nanoid, studioId from token row, periodStart/End, payloadJson JSON.stringify, receivedAt now, lastTelemetryReceivedAt now) `.onConflictDoUpdate` on (studioId, periodStart); upsert hq_token_usage on (studioId, date=periodEnd.slice(0,10)) accumulating input/output/request via `sql\`... + excluded...\``. Return `{ ok: true }`. CRITICAL: use the token row's studioId — NEVER read a studioId from the body for the FK (prevents spoofing one studio's data into another).
    3. `auth.ts`: add `"/api/telemetry"` to the `createAuthPlugin({ publicPaths: [...] })` array.
    4. Test file: vitest, mocking getDb (return canned token row / null) and readBody; implement the five behaviors. (No dev server — pure handler unit test.)
  </action>
  <verify>
    <automated>pnpm --filter @gymos/hq test -- telemetry</automated>
  </verify>
  <acceptance_criteria>
    - `pnpm --filter @gymos/hq test -- telemetry` passes (5 behaviors green; the member_email→422 case explicitly present).
    - `grep -n "TelemetrySnapshot.strict()\|\.strict()" apps/hq/server/routes/api/telemetry/index.post.ts` confirms strict parse.
    - `grep -n "/api/telemetry" apps/hq/server/plugins/auth.ts` confirms the public path.
    - `grep -n "lastTelemetryReceivedAt\|last_telemetry_received_at" apps/hq/server/routes/api/telemetry/index.post.ts` confirms TEL-05.
    - `grep -niE "connection|database_url|dsn|readBody.*connection" apps/hq/server/routes/api/telemetry/index.post.ts` returns NOTHING (TEL-06).
    - `pnpm --filter @gymos/hq exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>HQ ingest authenticates by token hash, rejects PII with 422, records last_telemetry_received_at, never touches a connection string; test green.</done>
</task>

<task type="auto">
  <name>Task 2: Studio daily telemetry-push pg-boss job + env + worker registration</name>
  <read_first>BD2-RESEARCH.md "Pattern 6: Telemetry Push Job", services/worker/src/queues/housekeeping.ts (boss.work + boss.schedule + consumer-first ordering + unconfigured-skip warning pattern), services/worker/src/index.ts (createQueue loop + register call ordering), services/worker/src/lib/env.ts (where to add HQ_INGEST_URL + STUDIO_TELEMETRY_TOKEN + STUDIO_ID), services/worker/src/lib/db.ts (studioTelemetryState mirror from BD2-03), services/worker/src/domain/buildTelemetrySnapshot.ts.</read_first>
  <files>services/worker/src/queues/telemetry-push.ts, services/worker/src/lib/env.ts, services/worker/.env.example, services/worker/src/index.ts</files>
  <action>
    1. `env.ts`: add (OPTIONAL — unconfigured studios skip cleanly like housekeeping): `HQ_INGEST_URL: z.string().url().optional()`, `STUDIO_TELEMETRY_TOKEN: z.string().min(16).optional()`, `STUDIO_ID: z.string().min(1).optional()`, `STUDIO_TIMEZONE: z.string().optional()`. Update `.env.example` with these (note: HQ_INGEST_URL + STUDIO_TELEMETRY_TOKEN + STUDIO_ID are set by the provisioning saga at Step 4/5/7 — BD2-05/06).
    2. `telemetry-push.ts`: export `registerTelemetryPush(boss)` mirroring housekeeping EXACTLY: register `boss.work("telemetry-push", handler)` FIRST; handler reads env, if HQ_INGEST_URL or STUDIO_TELEMETRY_TOKEN unset → `log.warn(...)` + return (worker still boots); else read the studio_telemetry_state singleton, call `buildTelemetrySnapshot(db, env.STUDIO_ID, state)`, `fetch(env.HQ_INGEST_URL, { method:"POST", headers:{ Authorization:"Bearer "+env.STUDIO_TELEMETRY_TOKEN, "Content-Type":"application/json" }, body: JSON.stringify(snapshot) })`; on non-2xx throw (pg-boss retries); on success RESET the accumulators (tokenUsageTodayInput/Output=0, requestCountToday=0, outboundSentToday/FailedToday=0, lastPushAt=now, lastPushStatus="ok"). Then `boss.schedule("telemetry-push", "0 2 * * *", {}, { tz:"UTC" } as any)` (02:00 UTC daily, idempotent schedule).
    3. `index.ts`: add `"telemetry-push"` to the `createQueue` loop and call `await registerTelemetryPush(boss)` after the other registrations (mirror the housekeeping registration line). Keep the /healthz contract unchanged.
  </action>
  <acceptance_criteria>
    - `grep -n "registerTelemetryPush\|telemetry-push" services/worker/src/index.ts` confirms queue created + registered.
    - `grep -n "Authorization.*Bearer\|STUDIO_TELEMETRY_TOKEN" services/worker/src/queues/telemetry-push.ts` confirms authed POST.
    - `grep -n "0 2 \* \* \*\|boss.schedule" services/worker/src/queues/telemetry-push.ts` confirms the daily schedule.
    - `grep -n "tokenUsageTodayInput.*0\|lastPushAt" services/worker/src/queues/telemetry-push.ts` confirms accumulator reset after success.
    - `grep -E "HQ_INGEST_URL|STUDIO_TELEMETRY_TOKEN|STUDIO_ID" services/worker/src/lib/env.ts` shows the new optional vars.
    - `pnpm --filter @gymos/worker exec tsc --noEmit` passes.
  </acceptance_criteria>
  <done>The studio worker runs a daily telemetry-push job that builds the snapshot, POSTs it with the per-studio token, and resets the accumulators; unconfigured studios boot cleanly.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @gymos/hq test` (telemetry) + tsc pass; member_email body → 422 proven.
- `/api/telemetry` is in HQ publicPaths; ingest uses the token row's studioId (no spoofing).
- studio push job mirrors housekeeping; daily 02:00 UTC; resets accumulators; tsc passes.
- No connection-string field anywhere in the ingest path (TEL-06).
</verification>

<success_criteria>
- TEL-03 studio pushes snapshot on schedule with per-studio token.
- TEL-04 strict-schema 422 on PII.
- TEL-05 last_telemetry_received_at recorded.
- TEL-06 HQ never holds/queries a studio connection string.
</success_criteria>

<output>
After completion, create `.planning/phases/BD2-telemetry-provisioning/BD2-04-SUMMARY.md`
</output>
