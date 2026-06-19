# Pitfalls Research — v2.0 Self-Serve Platform + Two-Tier Brain/Dispatcher (GymClassOS)

**Domain:** Self-serve SaaS provisioning across multiple cloud providers, cross-tenant PII isolation, WhatsApp at-scale compliance, agent-native template forking for a second product surface.
**Researched:** 2026-06-19
**Milestone:** v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher (HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD)
**Confidence:** HIGH for provisioning idempotency + PII boundary (both derived from direct PROJECT.md constraints + verified provider API behaviour); HIGH for WhatsApp compliance (existing worker code + Meta Cloud API behaviour); MEDIUM for Dispatch/Brain template adaptation (no direct code inspection of HQ templates yet — forking has not started).

> **SCOPE NOTE:** This file supersedes the v1.2 Agentic Tab Editing PITFALLS.md. It covers mistakes specific to ADDING the operator HQ layer, self-serve provisioning, PII-free telemetry, and Tier-2 gym-owner Brain/Dispatcher to this system. The two highest-blast-radius areas are provisioning idempotency/rollback and the PII-up boundary — these are treated in depth first.

---

## How to Read This Document

Each pitfall carries:

1. **Risk** — severity and which requirement category it threatens
2. **What goes wrong** — the concrete failure in this system
3. **Why it happens** — the root cause specific to this project
4. **Prevention** — specific, actionable steps (not "be careful")
5. **Warning signs** — observable signals before or after failure
6. **Phase to address** — which BD-phase must prevent this

Severity: CRITICAL / HIGH / MEDIUM
Requirement categories: HQ-FND, PROV, TEL, HQB, HQD, GOB, GOD

---

## Area 1: Multi-Provider Provisioning (PROV) — Highest Blast Radius

### Pitfall P-01: Non-Idempotent Provisioning Creates Orphaned Cloud Resources

**Risk:** CRITICAL — PROV; each orphan costs money indefinitely; not caught until billing review

**What goes wrong:**
The signup flow calls Neon → Vercel → Fly in a linear `async/await` chain. When a step returns a 5xx before the response arrives (network partition, provider timeout), a retry starts from the beginning. Neon's `POST /projects` endpoint has no idempotency key — every successful call creates a new project with a new ID. After 3 retries for one studio slug, three Neon projects exist. Only one is wired up; two leak and accrue cost forever because nothing tracks or deletes them.

Vercel and Fly have the same property: creating a project/app twice produces two resources, not an idempotent re-creation.

**Why it happens:**
Developers treat cloud provider APIs like they treat database `INSERT ... ON CONFLICT DO NOTHING` — they assume the provider handles deduplication. Providers do not. They create a new resource on every successful request, regardless of whether the caller received the response.

**Prevention:**
Model provisioning as a state machine persisted in HQ Neon `provisioning_runs` table. Before calling any provider, check whether that step is already in `completed` state for the current `run_id`. Each step records `{ step, status: 'completed', provider_resource_id }` before moving on. On retry, skip completed steps using the stored `provider_resource_id`. For Neon specifically: before `POST /projects`, call `GET /projects` filtered by the expected name — if an existing project matches, record its ID and continue rather than creating a new one. The step is idempotent because "find-or-create" replaces "create blindly."

**Warning signs:**
- Neon dashboard shows multiple projects with names following the `gymos-<slug>` pattern
- HQ logs show the same studio slug appearing in multiple provisioning start events within minutes
- Neon project count in billing grows faster than confirmed customer count

**Phase to address:** BD-PROV (the state machine schema and the find-or-create step-dispatch loop are the first deliverables, before any real provider API calls are wired)

---

### Pitfall P-02: Partial Failure Leaves Live Resources Pointed at Dead or Mismatched Resources

**Risk:** CRITICAL — PROV; studio appears provisioned but is non-functional; studio owner can never log in

**What goes wrong:**
Provisioning succeeds for Neon + Vercel but times out at the Fly deploy step. The HQ `studios` table is written as "active" (or left stuck in "provisioning"), but the Fly worker/edge-webhooks processes that the studio needs never started. Inbound WhatsApp messages for that studio hit a webhook endpoint that has no process consuming the queue.

A more dangerous variant: a retry creates a second Neon project (Pitfall P-01 not prevented), and the Vercel deploy is wired to the first project while the retry wires the worker to the second. The two halves of the studio system point at different databases.

**Why it happens:**
The happy path is coded first; compensation logic is deferred. Under solo-dev time pressure on a 2-month deadline, "we'll add rollback later" is the common rationalization. The partial state is only discovered when the first real customer can't log in.

**Prevention:**
Every state machine step must register its rollback at write time: `{ step: 'neon_created', rollback_action: 'neon_delete_project', resource_id: '<project_id>' }`. A separate `rollback_provisioning_run` job reads completed steps in reverse order and calls each rollback action. Rollback itself is a state machine — it too must be idempotent (call delete API, treat 404 as success). Never mark a run as `failed_terminal` until all rollbacks complete. Never mark a run as `provisioned` until Neon + Vercel + Fly + migrations + seed + admin user + DNS are all verified.

Build the rollback branch before the happy path. Test it by deliberately failing at each step in a staging environment.

**Warning signs:**
- HQ dashboard shows a studio in `provisioning` state for more than 10 minutes
- `fly apps list` shows no `gymos-<slug>` app for a studio that shows as "provisioned" in HQ
- Studio admin account exists in the studio Neon but the staff-web URL returns 502

**Phase to address:** BD-PROV (rollback state machine is the highest-risk part and must be built and integration-tested before the happy path ships to production)

---

### Pitfall P-03: Slug Race Condition Allows Concurrent Signups to Create Duplicate Resources

**Risk:** HIGH — PROV; two customers claim the same subdomain; one gets a broken studio

**What goes wrong:**
Two users sign up with studio name "Hustle Fitness" within milliseconds of each other. Both provisioning handlers check "does slug `hustle-fitness` exist?" and both find no existing row. Both proceed to create resources. One will fail at the Fly app name (Fly app names are globally unique), but by then both may have created Neon projects and Vercel projects. The losing race leaves orphaned resources.

**Why it happens:**
A SELECT followed by an INSERT is not atomic. In a serverless Vercel environment with multiple concurrent function instances, two handlers can execute the SELECT simultaneously, both see no row, and both proceed.

**Prevention:**
Use Postgres `INSERT INTO provisioning_runs (slug, ...) ON CONFLICT (slug) DO NOTHING RETURNING id` as the very first operation in the handler. If RETURNING returns no row, the slug is already taken — return a 409 to the signup UI immediately. This converts the race to a database-level unique constraint, which is atomic. The `slug` column on `provisioning_runs` and `studios` must have a `UNIQUE` constraint enforced in the schema, not just an application-level check.

**Warning signs:**
- Duplicate Fly app creation failures (`app with name already exists`) in provisioning logs
- HQ `studios` table has two rows for the same slug with different `created_at` timestamps
- A customer receives a success email but then cannot access their studio (the losing-race resources were cleaned up but the HQ row was written for both)

**Phase to address:** BD-PROV (the INSERT...ON CONFLICT must be the first line of the provisioning handler — non-negotiable)

---

### Pitfall P-04: Secrets Leak Through Provisioning Logs or State Rows

**Risk:** CRITICAL — PROV + security; a HQ Neon breach or log access exposes every studio's credentials simultaneously

**What goes wrong:**
The provisioning flow generates secrets (Better-auth secret, pg-boss connection string, Anthropic key, per-studio telemetry token, WhatsApp App Secret, Stripe restricted key). Common failure modes:
- (a) The pg-boss job payload contains the secrets as plain strings; Pino logs the full job payload on every retry.
- (b) The secrets are stored in `provisioning_runs.details` JSONB column in plain text.
- (c) The Fly CLI `fly secrets set SECRET=value` invocation is logged by the shell wrapper that calls it, and the log ships to Better Stack.
- (d) The Vercel environment variable creation API call body is logged by the HTTP client before the `Authorization` header check.

A single HQ Neon credential breach then exposes every studio's Stripe key, WhatsApp App Secret, and Better-auth secret simultaneously.

**Why it happens:**
Secret-handling discipline degrades when focus is on making the happy path work. Pino's default serializer logs the entire job payload object. The developer has not added a redacting serializer.

**Prevention:**
Never put raw secrets in pg-boss job payloads. The provisioning job receives only `run_id`. It derives/reads secrets from secure storage at execution time. Any generated secrets are stored into HQ Neon `secrets` table (encrypted via pgcrypto symmetric encryption using a key stored in HQ Vercel env, not in Neon itself) before the job starts. The job reads them back by name. When calling Fly `secrets set` or Vercel `env` APIs, wrap the HTTP call in a function that redacts values before passing to Pino: `logger.info({ call: 'fly_secrets_set', keys: Object.keys(secrets) })` — never `{ ...secrets }`. Add a Pino serializer that scrubs any field whose name matches `/secret|password|token|key|url|connection/i` to `[REDACTED]`.

**Warning signs:**
- Provisioning job logs in Better Stack contain JSONB blobs with postgres connection strings
- HQ Neon `provisioning_runs` table has a `connection_string` or `secrets` column with plain text values
- `fly secrets list --app gymos-<slug>` shows secrets "last set by provisioning-job" — check the associated deploy log for values

**Phase to address:** BD-PROV (secret handling discipline must be audited in the same sprint as provider API wiring — not deferred to a hardening phase)

---

### Pitfall P-05: DNS/Subdomain Propagation Failure Triggers False Rollback

**Risk:** HIGH — PROV; a correctly-provisioned studio gets rolled back because the healthcheck fires too soon

**What goes wrong:**
The provisioning flow creates the subdomain record (`hustle.gymclassos.com → Vercel CNAME`) and then immediately calls `GET https://hustle.gymclassos.com/healthz` to verify the deploy is live. This call fails (connection refused, NXDOMAIN) for 30 seconds to several minutes while DNS propagates. The provisioning state machine interprets the failure as a deploy problem and triggers rollback, destroying correctly-provisioned resources.

A related variant: the Vercel deployment itself succeeds but is still warming up (cold start) when the healthcheck fires, returning a 502 that is mistaken for a failed deploy.

**Why it happens:**
DNS TTLs and propagation are not instant — even with Vercel's DNS API, global resolvers see changes 30-120 seconds after the record is written. Vercel cold starts on the first request to a new deployment can take 5-15 seconds. The provisioning flow is written without accounting for these latencies.

**Prevention:**
Separate provisioning completion verification from DNS propagation. Verify the Vercel deploy is live by calling the Vercel deployment URL directly (e.g. `gymos-hustle-xxxxxxx.vercel.app/healthz`) rather than the subdomain. The subdomain reachability check runs as a deferred background job with exponential backoff (5s, 15s, 45s, 2m, 5m, 10m) and does not block studio activation. Activate the studio using the direct Vercel URL immediately after deploy verification; update the `studios.canonical_url` to the subdomain URL once the deferred check passes.

**Warning signs:**
- Provisioning logs show "subdomain healthcheck failed" within 5 seconds of DNS record creation
- Studios appearing in `rolled_back` state but all three providers show healthy resources
- Customer receives a "provisioning failed" email but their resources exist in all three providers

**Phase to address:** BD-PROV (the deferred healthcheck architecture must be designed upfront — discovering this on the first real signup is too late)

---

### Pitfall P-06: Abandoned or Abusive Signups Cause Cost Blowout

**Risk:** MEDIUM — PROV; at low signup volume this is invisible; at scale it is a $500+ surprise Neon/Fly bill

**What goes wrong:**
A bot or curious developer triggers 50 signups in an hour. Each triggers provisioning of a Neon project, Vercel project, and Fly app. At Neon's free tier, each project counts against the project limit. On Fly, each app incurs compute cost even when idle. Abandoned signups that never pass email verification accumulate provisioned resources indefinitely.

**Why it happens:**
The provisioning trigger is the signup form submission, not a verified intent signal. No rate limit, no cost gate, no TTL on unverified runs.

**Prevention:**
Gate provisioning start on email verification: the provisioning pg-boss job is enqueued only after the customer clicks the confirmation link, not at form submission. Add a TTL on unverified runs: a recurring cleanup job deletes `provisioning_runs` rows stuck in `awaiting_email_verification` for more than 24 hours without ever enqueuing a provisioning job. Add IP-level rate limiting at the HQ signup route: maximum 3 signups per IP per hour using a counter in HQ Neon `rate_limit_buckets` (no Redis needed at HQ scale). For v2.0 with anticipated very low signup volume, these controls are sufficient — revisit if signups become high-frequency.

**Warning signs:**
- Neon project count climbs faster than confirmed customer count
- Multiple `provisioning_runs` rows with the same email in different states
- Fly apps with zero traffic for more than 48 hours after creation

**Phase to address:** BD-PROV (the email-verification gate is a prerequisite, not an enhancement — never trigger provisioning on an unverified signup)

---

## Area 2: Cross-Tenant Data Isolation / PII Boundary (TEL) — Highest Blast Radius

### Pitfall T-01: Telemetry Payload Contains PII via Insufficiently Scoped Queries

**Risk:** CRITICAL — TEL; violates the hard constraint "no member/lead PII ever flows up to HQ"; triggers GDPR liability if EU members are involved

**What goes wrong:**
The telemetry push job in the studio worker runs a query that looks aggregate but returns individual-level data. Examples: `GROUP BY coach_id` returning one row per coach (exposing identifiable performance data); a `LIMIT 1` that returns a specific member's row; a `debug: true` code path that embeds raw query results in the payload. The HQ ingest endpoint accepts a loose `object` type, so a malformed payload with extra PII fields passes validation and gets stored in HQ Neon.

A subtler variant: the telemetry payload includes `member_ids_churned: string[]` (an array of opaque IDs) which seem non-PII. HQ then joins those IDs against... nothing, because HQ has no member table. But a developer adds a "for debugging" join against a cached studio member list that was synced earlier, re-materialising member identity at HQ.

**Why it happens:**
Aggregation queries are written correctly but the payload schema is under-specified. The ingest endpoint accepts `any`. Over time, "just add one more field for debugging" erodes the boundary.

**Prevention:**
Define the telemetry payload schema as a strict Zod object at the HQ ingest endpoint — use `.strict()` so any extra fields cause a 422 rejection, not silent acceptance. The allowed schema: `{ studio_id: string, period: string, metrics: { active_members_count: number, retention_rate_pct: number, avg_sessions_per_member: number, total_bookings: number, churn_count: number, ai_tokens_used: number, ai_tokens_by_model: Record<string, number> } }`. No names, emails, phones, member IDs, free-text, or arrays of any kind. Write a Vitest test that constructs a payload with a `member_email` field and asserts the HQ ingest endpoint returns 422. The studio's telemetry aggregator query must live in a dedicated `telemetry-aggregator.ts` file with a code review checklist item: "Does this return any individual-level data?"

**Warning signs:**
- HQ telemetry table schema gains a JSONB column ("for debugging context")
- HQ ingest Pino logs include full payload bodies
- Telemetry payload size per studio exceeds ~1KB (aggregate metrics for a boutique gym should be under 500 bytes)
- HQ Brain document ingestion pipeline is given access to the telemetry raw payloads

**Phase to address:** BD-TEL (the Zod `.strict()` schema at the ingest endpoint and the telemetry-aggregator file structure are the first two deliverables of TEL, before any metric queries are written)

---

### Pitfall T-02: Error Messages and Logs Carry PII Upward

**Risk:** HIGH — TEL + operability; a shared Better Stack workspace lets HQ engineers see member data from any studio while debugging

**What goes wrong:**
A studio worker job throws `Error: member 'jane.doe@gmail.com' has no opt-in record`. pg-boss serializes the error including the message into `pgboss.job`. The studio's telemetry ping includes a `last_worker_error` field. HQ now stores a member's email address.

A related variant: studio worker Pino logs ship to a shared Better Stack workspace (cost efficiency — one workspace for all studios). A HQ engineer searching logs for one studio can see another studio's member data in the logs.

**Why it happens:**
Error messages are written for debuggability without considering where those messages end up. Log aggregation into a shared workspace is the obvious operational choice but creates cross-tenant and cross-boundary visibility.

**Prevention:**
In all studio-side code (worker, edge-webhooks, staff-web), error messages that reference member data must use the internal member ID (an opaque UUID), never name/email/phone. Pattern: `Error: member ${memberId} has no opt-in record` — not `Error: member ${member.email}...`. Enforce with an ESLint rule that flags string interpolation of `email`, `phone`, `firstName`, `lastName` inside `new Error(...)` calls. The HQ telemetry ingest endpoint must not accept any `error` or `log` field — the Zod `.strict()` schema (Pitfall T-01) catches this. For Better Stack: provision a separate log space per studio slug as a PROV step. Better Stack charges by volume, not space count — the cost is negligible.

**Warning signs:**
- Better Stack search for a member name returns results from a studio worker log
- pg-boss `pgboss.job` table in a studio Neon has serialized errors containing `email@` substrings
- HQ telemetry rows have a `last_error` or `debug` column

**Phase to address:** BD-TEL (Zod schema controls); BD-PROV (per-studio Better Stack log space as a provisioning step)

---

### Pitfall T-03: HQ Accidentally Receives Studio DB Credentials

**Risk:** CRITICAL — HQ-FND + security; HQ then has the ability to query any studio's member data directly, nullifying the PII boundary

**What goes wrong:**
The provisioning flow generates the studio's Neon connection string and a developer adds it to HQ's `studios` table "for easy health checks." Later, a HQ Brain agent action is given full access to HQ Neon and inadvertently includes the connection string in its tool context. The Brain generates a response that quotes the connection string. Or more directly: a developer writes a HQ admin action that runs `SELECT COUNT(*) FROM gym_members` against a studio Neon to "check studio health" — HQ can now read member data.

**Why it happens:**
The operational convenience of being able to "just check" a studio's DB from HQ is tempting during debugging. The constraint is easy to state but hard to enforce technically — there is no firewall between HQ Neon and studio Neon, only policy.

**Prevention:**
The HQ `studios` table must never store a studio's Neon connection string, not even encrypted. The studio's Neon URL is stored only in the studio's own Fly worker environment (via `fly secrets set`) and the studio's own Vercel environment. HQ `studios` records contain only provider resource identifiers: `{ neon_project_id, neon_project_name, vercel_project_id, fly_app_name }` — enough to call management APIs, not enough to connect to the database. Health data flows inward (studio pushes telemetry) not outward (HQ pulls from studio DB). Add a Drizzle schema comment on the `studios` table: `// HQ NEVER stores studio DB connection strings — store provider resource IDs only`. Add a CI guard that scans `apps/hq/server/db/schema.ts` for columns named `*connection*`, `*database_url*`, `*pg_url*`, `*neon_url*`, `*dsn*` and fails the build if found.

**Warning signs:**
- HQ schema migration adds a column with "url", "connection", or "dsn" in the name to any studio-related table
- HQ codebase contains an import of `@neondatabase/serverless` outside of the HQ-specific DB module
- A HQ Brain knowledge document contains a Postgres connection string

**Phase to address:** BD-HQ-FND (the HQ schema design must explicitly exclude studio credentials; the CI guard ships with the HQ schema, before PROV work begins)

---

### Pitfall T-04: AI Token Usage Records Carry Prompt Content to HQ

**Risk:** HIGH — TEL; prompt content may include member names, health notes, or class details that constitute PII

**What goes wrong:**
The studio's token usage instrumentation adds `prompt_preview: prompt.slice(0, 200)` to the `ai_token_usage` row "to help debug agent responses." This 200-character slice may include a member's name ("Tell me about John Smith's attendance..."). The telemetry payload originally excludes prompt content, but a developer adds `recent_prompts: string[]` to the payload "so HQ Brain can understand how studios use the AI." HQ now stores member-contextual prompts.

A subtler version: the token usage record stores `agent_session_id`. HQ telemetry later adds a `session_summary` field. The studio worker summarizes recent sessions to send... and the summary contains member context.

**Why it happens:**
Token cost debugging is genuinely useful. The impulse to add "just a little context" to help understand costs is reasonable but each addition erodes the boundary.

**Prevention:**
The studio `ai_token_usage` table schema: `{ id, model, input_tokens, output_tokens, created_at }` — no session reference, no prompt text, no prompt hash, no summary field. Enforced in the Drizzle schema with a column-level comment: `// PII BOUNDARY: no prompt content, no session reference`. The telemetry payload to HQ contains only the aggregated sum: `{ ai_tokens_used: number, ai_tokens_by_model: Record<string, number> }`. The Zod `.strict()` at the HQ ingest endpoint (Pitfall T-01) blocks any additional fields. HQ Brain that models AI cost trends operates only on these aggregate counts, never on session-level data.

**Warning signs:**
- Studio DB schema migration adds `prompt_preview`, `prompt_hash`, `session_id`, or `summary` to the token usage table
- The telemetry payload for any studio exceeds a few hundred bytes (a meaningful prompt preview would push it to kilobytes)
- HQ Brain returns member names when asked "which studios use AI most?"

**Phase to address:** BD-TEL (the token usage schema is the first thing designed in TEL, with an explicit PII checklist item signed off before coding begins)

---

## Area 3: WhatsApp Compliance at Scale (GOD, HQD)

### Pitfall W-01: Heartbeat Reactivation Sends Templates to Opted-Out Members

**Risk:** CRITICAL — GOD; Meta will flag or suspend the WABA; one flagged number can block the entire studio's WhatsApp communications

**What goes wrong:**
The daily heartbeat reactivation campaign enqueues sends for all "dormant" members. The campaign query checks `whatsapp_opt_in` for an opt-in record — but a member who opted out two hours ago may not have their opt-out processed yet (the opt-out webhook arrived, enqueued a processing job, but the pg-boss worker is behind on the queue). The campaign enqueues a send for that member. The worker processes the opt-out job and the send job in the wrong order (pg-boss does not guarantee order across job types). The member who said STOP receives a template message.

**Why it happens:**
The existing worker chokepoint checks opt-in status at job processing time — correct. But the campaign enqueues hundreds of jobs at once. The opt-out event and the heartbeat send are racing. pg-boss does not serialize them unless they are in the same queue with explicit ordering.

**Prevention:**
Ensure the worker's send chokepoint checks the opt-in table at actual send time (not just at enqueue time — confirm this is already the case in the existing worker code). Add a second check: an `whatsapp_opt_out_immediate` table written synchronously inside the opt-out webhook handler (before returning 200 to Meta), separate from the async processing job. The send chokepoint checks this table first — it acts as a fast-path veto with zero processing lag. Additionally: the heartbeat campaign query must filter out members who have sent any inbound message in the last 24 hours (they already have an open conversation window — sending them a reactivation template looks like bot behavior to Meta and wastes template sends).

**Warning signs:**
- Member complains of receiving a WhatsApp message after replying STOP
- Worker logs show template sends to members with inbound messages timestamped in the last 24 hours
- Meta flags the studio's phone number in the Business Manager for policy violations

**Phase to address:** BD-GOD (the `whatsapp_opt_out_immediate` synchronous write is a prerequisite for the heartbeat campaign; the "has recent inbound" filter is part of the campaign query design, not a later optimization)

---

### Pitfall W-02: Concurrent Studio Heartbeat Campaigns Create a Sending Storm

**Risk:** HIGH — GOD; Meta Cloud API rate limits per WABA; a storm triggers 429 errors and delays all studio WhatsApp sends

**What goes wrong:**
The daily heartbeat cron fires at 9:00am for all studios simultaneously. At 10 studios with 200 dormant members each, 2,000 template sends are enqueued in the first minute. Meta's per-WABA rate limits for Cloud API (practically ~1,000 messages per second for throughput-tier accounts, but with per-template and per-recipient sublimits) are hit. The worker receives 429 responses, exponentially backs off, and the sends spread across the next 30 minutes — but so do class-related messages and inbound reply processing, creating priority inversion.

**Why it happens:**
Each studio's worker operates independently (correct for the single-tenant model). But all workers share the same 9:00am cron trigger from HQ. At small scale (1-3 studios) this is invisible; at 10+ it creates a spike.

**Prevention:**
Stagger heartbeat start times across studios. When HQ sends the daily "start heartbeat" signal to studio workers (via a HQ → studio API call or by writing to a per-studio pg-boss job with a `startAfter` timestamp), assign each studio an offset: `startAfter = 9am + hash(studio_id) % 60 minutes`. This distributes sends across a 60-minute window. At 10 studios with 200 members each and a 60-minute window, average send rate is ~33 messages/minute — well within Meta limits. Also add a per-recipient per-template deduplication check: before enqueuing a heartbeat send, query `SELECT id FROM messages WHERE phone_number = ? AND template_name = ? AND created_at > NOW() - INTERVAL '24h'` — skip if a send already went out in the last 24 hours.

**Warning signs:**
- Meta API returning 429 errors in studio worker logs during the 9am window
- Messages stuck in `queued` pg-boss state for more than 10 minutes during campaign time
- Multiple template send records for the same member on the same day

**Phase to address:** BD-GOD (the staggered start-time design must be in the initial heartbeat scheduler architecture, not added after the first 429 incident)

---

### Pitfall W-03: HQ Dispatcher Routes Owner Messages Through Studio WABAs

**Risk:** CRITICAL — HQD + compliance; B2B owner messages sent from a member-communication WABA have no legal opt-in basis; Meta's anti-spam policies treat this as misuse of the WABA

**What goes wrong:**
The HQ Dispatcher needs to send owners messages about system/product features (daily digests, new feature announcements). A developer reuses the studio's existing send infrastructure — which routes through the studio's own WABA phone number, set up for member messaging. The studio's `whatsapp_opt_in` table records member opt-ins, not owner opt-ins. Sending an owner a message from the studio's WABA using a member opt-in basis is a compliance violation: the opt-in was not for B2B communications from GymClassOS.

**Why it happens:**
The path of least resistance is to reuse the existing send path. The studio worker and edge-webhooks are already running; calling them from HQ seems simpler than standing up a separate HQ WABA. The distinction between "studio WABA for member comms" and "HQ WABA for owner comms" is easy to blur during implementation.

**Prevention:**
HQ Dispatcher uses a completely separate WABA registered to the GymClassOS business account, not any studio's account. The HQ `apps/hq` app holds its own WhatsApp credentials in HQ Neon `secrets`. Owner opt-in is captured at signup (PROV step: the signup form includes explicit WhatsApp opt-in for GymClassOS system communications, using the HQ WABA phone number). Owner opt-in records live in HQ Neon `hq_whatsapp_opt_in`, never in any studio DB. The HQ WABA must be fully approved and the owner-comms templates approved by Meta before HQD ships. No HQD code may reference the studio's `services/worker` or `services/edge-webhooks` to send an owner message.

**Warning signs:**
- HQD code contains an import from `apps/staff-web/services/worker` or references `services/edge-webhooks`
- An owner receives a HQ system message from their studio's own WhatsApp number (instead of GymClassOS's number)
- Owner communication logs appear in a studio's `messages` table

**Phase to address:** BD-HQD (WABA separation is an architectural constraint that must be documented before any HQD send code is written; the HQ WABA credentials and `hq_whatsapp_opt_in` table must be established in BD-HQ-FND)

---

### Pitfall W-04: Templates Not Actually Approved by Meta Before Campaigns Run

**Risk:** HIGH — GOD + PROV; campaigns silently send zero messages; repeated failed template sends can flag the WABA as suspicious

**What goes wrong:**
The heartbeat reactivation and studio digest templates are seeded into the studio's `whatsapp_templates` table as `is_active = true` and `meta_approval_status = 'approved'` during provisioning. But Meta template approval takes 24-72 hours per template per WABA. The GOD dispatcher runs campaigns before the actual approval arrives. All sends fail with `template_not_approved` errors from the Meta Graph API. No campaigns run, no error is surfaced to the owner, and the studio is silently non-functional for its first 72 hours.

**Why it happens:**
The seed file uses `approved` as the default status to make local development work. This status is not validated against Meta's actual API at provisioning time.

**Prevention:**
Add a `meta_approval_status` column to `whatsapp_templates`: enum `pending | approved | rejected`. The provisioning flow submits templates to Meta for approval immediately after WABA setup, and sets status to `pending`. A recurring check job polls `GET /{template_id}?fields=status` and updates `meta_approval_status` on transition. The GOD campaign runner checks `meta_approval_status = 'approved'` before queuing any sends and returns a clear, logged error if templates are not approved. The PROV state machine adds an `awaiting_template_approval` step after WABA provisioning — the studio is "live" for staff-web access but the campaign system is disabled until templates are approved. Notify the owner via email when templates are approved.

**Warning signs:**
- Campaign runs log zero messages sent with no error
- Studio `whatsapp_templates` rows have `meta_approval_status` null or seeded as `approved` with no corresponding Meta template ID
- Worker logs contain `template_not_approved` errors from the Meta Graph API

**Phase to address:** BD-PROV (template submission on provision) + BD-GOD (the `meta_approval_status` check in the campaign runner is a hard prerequisite — campaigns must not run without it)

---

## Area 4: agent-native Template Adaptation (HQ-FND)

### Pitfall F-01: Forking Dispatch/Brain Templates Into apps/hq Violates the Fork Boundary

**Risk:** HIGH — HQ-FND; damages the upstream merge story permanently; creates diff conflicts in every `git fetch upstream && git merge upstream/main`

**What goes wrong:**
Under time pressure, the developer copies the Dispatch and Brain templates by modifying files under `templates/dispatch/` and `templates/brain/` in place, then moving them to `apps/hq/`. The `templates/` directory is modified. Future upstream merges produce conflicts in every modified file. MODIFICATIONS.md is not updated. The agent-native fork boundary — one of the project's locked architectural constraints — is violated.

**Why it happens:**
Editing the source location and then moving feels identical to copying to a new location and editing. The difference is that `git diff upstream/main HEAD -- templates/` shows nothing for a true copy-then-modify; it shows everything for an in-place edit. Under time pressure, the correct sequence (copy first, then edit, never touch templates/) is easy to invert.

**Prevention:**
The fork-boundary copy is a two-commit sequence: Commit 1 copies `templates/dispatch/` → `apps/hq/features/dispatch/` and `templates/brain/` → `apps/hq/features/brain/` with zero modifications. Commit 2 modifies only the copies. Run `git diff upstream/main HEAD -- templates/` after Commit 1 and Commit 2 — both must return empty output. Add this check to CI as a guard: `git diff upstream/main HEAD -- templates/ | wc -l` must be 0. Update MODIFICATIONS.md in Commit 2 listing every file modified relative to the upstream template.

**Warning signs:**
- `git diff upstream/main HEAD -- templates/` returns non-empty output
- `git log --all -- templates/dispatch/` shows commits dated after the fork
- MODIFICATIONS.md does not list HQ feature directories under "adapted templates"

**Phase to address:** BD-HQ-FND (the fork-boundary copy is the very first action of the HQ setup phase, before any HQ-specific code is written — non-negotiable)

---

### Pitfall F-02: Dispatch/Brain Templates Assume a Multi-Org User Model; HQ Has One Super-Admin

**Risk:** HIGH — HQ-FND; all HQ Brain documents and Dispatch content return empty because `accessFilter` finds no org scope

**What goes wrong:**
The Dispatch and Brain templates use `ownableColumns()` and `accessFilter(table, sharesTable)` which scope queries to the signed-in user's `orgId`. In the multi-user multi-org model these templates were built for, this is correct. In `apps/hq` with a single super-admin and no org concept, the `accessFilter` call either returns zero results (if the super-admin's session has no `orgId`) or requires creating a fake org. The HQ agent tools return empty lists. HQ Brain appears to contain no documents. HQD shows no content.

**Why it happens:**
The templates are copied without auditing their auth/tenancy assumptions. The `accessFilter` code looks correct in isolation but silently returns nothing when `orgId` is null or absent.

**Prevention:**
Before copying the templates, audit every action and API route for `accessFilter`, `resolveAccess`, `assertAccess`, and `runWithRequestContext` calls. For `apps/hq`, create a dedicated HQ org during `runMigrations` startup (seeded with the super-admin email and a fixed org ID), ensuring all ownable resources are scoped to that org. This makes the standard `accessFilter` work correctly and enables adding more HQ users later without restructuring. Do not replace `accessFilter` with `// guard:allow-unscoped` — that disables the security model and blocks future multi-user HQ without a rewrite.

**Warning signs:**
- HQ Brain document list returns empty after documents are created
- HQ Dispatch workspace shows no content
- Any HQ action that calls `accessFilter` returns zero rows when the super-admin is logged in

**Phase to address:** BD-HQ-FND (the org + super-admin seed is part of HQ Neon migrations, blocking all template functionality if absent)

---

### Pitfall F-03: HQ Brain Ingests Studio-Facing or Member-Contextual Content

**Risk:** HIGH — HQB + PII boundary; the Brain's vector store in HQ Neon becomes a PII accumulation point

**What goes wrong:**
The Brain template's ingestion pipeline accepts document uploads and URL crawls. An HQ admin uploads a studio's member list CSV "to give the Brain context." The Brain now contains member PII in its vector store. Or the Brain crawler is configured to crawl a studio's staff-web URL, which accidentally hits an auth-bypass route and returns member data in the HTML.

A more insidious variant: HQ Brain is connected to the HQ telemetry table as a "live data source." A developer extends the telemetry payload (violating T-01) to include member IDs. HQ Brain then vectorizes and stores those IDs as part of its studio health model.

**Why it happens:**
The Brain template has no concept of a PII firewall in its ingestion pipeline. It ingests whatever is given to it. The HQ operator is a technical user who may not recognize that "helpful context" crosses the PII boundary.

**Prevention:**
Define an explicit source allowlist for HQ Brain in its configuration: only GymClassOS internal documentation, HQ telemetry aggregate tables, and `gymclassos.com` domain. Disable the URL crawler for HQ v2.0 or restrict it to a `gymclassos.com` allowlist. Add a validation step in the Brain document ingestion action that rejects CSV/spreadsheet uploads containing columns named `email`, `phone`, `name`, `member` (case-insensitive header scan). This is a guardrail, not a perfect filter, but it prevents the obvious accident. The HQ telemetry ingest schema (Pitfall T-01) already prevents telemetry from carrying PII to the table that Brain reads.

**Warning signs:**
- HQ Brain vector search returns member names or email addresses in results
- Brain ingestion logs show documents from a `*.gymclassos.com` subdomain (a studio URL)
- Brain knowledge base contains spreadsheet files

**Phase to address:** BD-HQB (the source allowlist and CSV-rejection filter are day-one configuration for HQ Brain, before any documents are ingested)

---

## Area 5: Solo-Dev Operability of Unattended Systems (Cross-Cutting)

### Pitfall O-01: Stuck Provisioning Jobs Have No Alert — Customer Waits Days

**Risk:** HIGH — PROV + operability; the first signal is a customer support email, not a developer alert

**What goes wrong:**
A provisioning job gets stuck in `active` state in pg-boss because the Fly deploy step hangs waiting for an image build that will never complete (OOM on the Fly build machine). pg-boss has job expiry but only if `expireInSeconds` is configured — the default is indefinite. The job does not expire; it does not retry. The customer's signup email says "your studio is being set up." The developer discovers this 3 days later when the customer emails.

**Why it happens:**
pg-boss's defaults are generous. `expireInSeconds` and `retryLimit` are opt-in. Without explicit configuration, a job stays `active` forever. There is no external alerting on job state transitions — pg-boss is a DB queue, not an alerting system.

**Prevention:**
Configure the provisioning pg-boss job with `expireInSeconds: 600` (10 minutes max per step attempt) and `retryLimit: 3`. The state machine's timeout at each step is separate from pg-boss's retry — the step itself has a 5-minute timeout enforced via `Promise.race([stepFn(), timeout(300_000)])`. Add a HQ-level watchdog recurring job (every 5 minutes) that queries `SELECT * FROM pgboss.job WHERE name = 'provision-studio' AND state IN ('failed', 'expired') AND createdon > NOW() - INTERVAL '2 hours'`. On any result, send a HQ operator alert via email (Postmark — simpler than WhatsApp for dev ops alerts at v2.0). Also add a "provisioning health" panel to the HQ dashboard showing counts by state, visible on first login.

**Warning signs:**
- pg-boss `pgboss.job` table shows `state = 'failed'` or `state = 'expired'` for provisioning jobs
- HQ `studios` table shows a studio in `provisioning` state for more than 15 minutes
- No provisioning completions in logs for 24+ hours despite signup activity

**Phase to address:** BD-PROV (the watchdog job and the HQ alert email ship with the provisioning system, not as a follow-up)

---

### Pitfall O-02: Telemetry Push Failures Cause False "At-Risk" Classifications by HQ Brain

**Risk:** HIGH — TEL + HQB; the HQ Dispatcher sends a "we miss you" message to a studio that is perfectly healthy, damaging trust

**What goes wrong:**
The studio worker's daily telemetry push job fails (network error, HQ ingest endpoint returns 503, HQ telemetry token rotated without updating the studio Fly secret). The job fails silently. The studio's telemetry row in HQ stops updating. HQ Brain classifies the studio as dormant (zero AI tokens, zero bookings, zero active members for 48 hours) and the HQD sends the gym owner a reactivation message. The gym owner, whose studio is running perfectly, is confused and calls.

**Why it happens:**
HQ Brain's at-risk model uses telemetry data as a proxy for studio health without distinguishing "telemetry not received" from "studio actually inactive."

**Prevention:**
The HQ `studios` table must track `last_telemetry_received_at`. HQB's at-risk classification must exclude studios where `last_telemetry_received_at < NOW() - INTERVAL '48 hours'` — these are classified as "telemetry gap" (a technical issue) not "dormant" (a customer health issue). The watchdog job (Pitfall O-01) also checks for studios with no telemetry in 25+ hours and flags them as "telemetry interrupted" — generating an operator alert, not a customer-facing message. The studio telemetry push job uses pg-boss retry with exponential backoff so transient failures self-heal within hours without ever producing a false dormancy signal.

**Warning signs:**
- HQB at-risk cohort includes a studio the developer knows is actively used
- `last_telemetry_received_at` on multiple studio rows is stale by more than 24 hours
- HQD sends owner messages to healthy studios

**Phase to address:** BD-TEL (the `last_telemetry_received_at` column and the exclusion logic in HQB's at-risk query must be designed together — not independently)

---

### Pitfall O-03: Per-Studio Fly App Compute Cost Scales Linearly With No Budget Alert

**Risk:** MEDIUM — PROV + operability; invisible until a surprise $300+ Fly bill at 50 studios

**What goes wrong:**
Each studio gets one Fly app (edge-webhooks + worker). Even at `shared-cpu-1x` with 256MB, each idle machine costs ~$2-5/month in compute. At 20 studios this is $40-100/month in Fly compute alone — affordable but unmonitored. At 100 studios it is $200-500/month. There is no cost alert and no mechanism to scale idle studios down during off-hours.

**Why it happens:**
During development with 1-2 studios, Fly costs are negligible and invisible. The per-studio cost model's scaling implications are not modelled until a billing cycle surfaces them.

**Prevention:**
Configure Fly's `auto_stop_machines = "stop"` and `min_machines_running = 0` for the edge-webhooks process group (request-driven, can tolerate cold start). The worker process group that runs the pg-boss subscriber must stay alive — evaluate whether `auto_stop_machines` is safe for a pg-boss subscriber (a stopped machine does not process queued jobs). If pg-boss requires a persistent process, the worker stays always-on and the edge-webhooks machine stops when idle. Set a Fly org-level budget alert at $50/month and $100/month via the Fly dashboard. Model expected cost at 5, 10, 20, 50 studios before PROV ships and document the break-even and margin thresholds.

**Warning signs:**
- Monthly Fly bill is not tracked against a per-studio expected cost
- `fly apps list` shows more apps than the confirmed active customer count
- Fly machines running 24/7 for studios with zero WhatsApp activity in 30 days

**Phase to address:** BD-PROV (the Fly process group configuration and budget alert setup are provisioning-time decisions — the `fly.toml` template used for every studio deploy must include the auto_stop configuration)

---

### Pitfall O-04: Studio Worker Crashes Without Recovery — WhatsApp Inbox Goes Silent

**Risk:** HIGH — operability (cross-cutting GOD + PROV); a studio's staff can't see or respond to WhatsApp messages

**What goes wrong:**
A studio's Fly worker crashes (OOM on a large send queue, unhandled promise rejection in pg-boss subscriber, corrupted Neon connection after a Neon maintenance event). Fly restarts it, but the restart also fails (e.g. the Neon connection string secret was rotated but Fly secrets were not updated). The worker process is stuck in a restart loop. The studio's edge-webhooks Hono receiver is still running and accepting inbound WhatsApp messages — but no worker is consuming the pg-boss queue. Messages pile up. Staff see incoming messages but the agent never processes them. No alert fires.

**Why it happens:**
The worker crash recovery depends on Fly's built-in restart logic. If the restart also fails, Fly stops retrying after a configurable number of attempts and leaves the process `stopped`. There is no external monitor for this state.

**Prevention:**
Deploy edge-webhooks and worker as separate process groups in the Fly app so a worker crash does not take down the webhook receiver. Add a liveness HTTP endpoint to the worker's internal Hono admin surface: `GET /healthz` that returns 200 if the pg-boss subscriber is connected and active subscriptions are registered. Configure Fly to health-check this endpoint. The studio worker writes a heartbeat row to the studio Neon `worker_heartbeats` table every 5 minutes. The studio's telemetry push includes the last heartbeat timestamp. HQ's watchdog job (Pitfall O-01) alerts if any studio's last heartbeat is more than 15 minutes stale.

**Warning signs:**
- Studio's WhatsApp inbox shows incoming messages with no agent processing for more than 10 minutes during business hours
- `fly status --app gymos-<slug>` shows the worker process as `stopped` or `failed`
- HQ telemetry dashboard shows a studio with `last_heartbeat` more than 15 minutes ago

**Phase to address:** BD-PROV (the Fly process group configuration, healthcheck endpoint, and heartbeat table are provisioning-template components — every studio must get them, not just studios that experienced a crash)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Linear provisioning without state machine | 2-3 days faster to write | First partial failure requires manual cleanup; no safe retry path | Never — state machine must be built before any real signup |
| Shared Better Stack workspace for all studios | One fewer config step per studio | Cross-tenant log visibility; support engineers see PII from other studios while debugging | Never; per-studio log space is a PROV provisioning step |
| `meta_approval_status = 'approved'` as seed default | Templates "work" in local dev immediately | First real campaign silently sends zero messages | Acceptable in local dev only; a real-studio provisioning seed must set `pending` |
| HQ sending owner messages via studio WABA | Reuses existing send infrastructure | B2B opt-in violation; Meta policy breach | Never — WABA separation is a compliance hard requirement |
| Storing studio Neon URL in HQ for "convenient health checks" | Enables direct DB queries during debugging | Violates PII boundary; HQ can now read all member data | Never — the boundary is the product |
| Fixed 9:00am cron for all studio heartbeat campaigns | Simple to implement | Rate limit spikes; poor send quality at 10+ studios | Acceptable until >5 studios; must stagger before going beyond |
| Telemetry push without `last_telemetry_received_at` tracking | Simpler telemetry schema | False at-risk signals from HQB lead to unwanted owner outreach | Never — this field is a first-class column, not a later addition |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| Neon Management API | `POST /projects` is not idempotent — retrying creates a duplicate project | Check `GET /projects` for existing project by name before creating; record the project ID at first successful creation |
| Vercel Projects API | Project creation and env var setup are separate API calls; if env var step fails, project exists with no config | Model as two state machine steps; retry env var step independently using the stored Vercel project ID |
| Fly Apps / `fly deploy` | CLI exit 0 does not mean the app is serving — the deploy is async | Poll `GET /v1/apps/{app_name}/releases/latest` for `status: "complete"` before marking the Fly step done |
| Meta Graph API (template status) | Template approval is not pushed — you must poll | Schedule a recurring check job every 30 minutes; emit an internal event when `status → APPROVED` |
| WhatsApp 24h window at campaign scale | Checking window at enqueue time misses opt-outs and new sessions between enqueue and send | Always check window, opt-in status, and `whatsapp_opt_out_immediate` at actual send time in the worker |
| pg-boss across multiple Neon databases | Running a single pg-boss instance against multiple databases is not supported | Each studio worker's pg-boss instance connects only to its own studio Neon; HQ's pg-boss connects only to HQ Neon; never cross-connect |
| Drizzle migrations on fresh Neon projects | Running `drizzle-kit generate` at provision time produces different SQL if schema has drifted | Check pre-generated migration files into the repo; the provisioning flow runs `drizzle-kit migrate` using the checked-in files, not freshly generated SQL |
| Better-auth on HQ vs on studio apps | HQ Better-auth and studio Better-auth use the same library but different `BETTER_AUTH_SECRET` values and different Neon databases — sessions are not shared | HQ session: HQ Neon + HQ BETTER_AUTH_SECRET. Studio session: studio Neon + studio BETTER_AUTH_SECRET. Never share secrets or Neon URLs between HQ and studios |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Telemetry endpoint using a shared static token | Any party knowing the token can inject false telemetry; a compromised studio can poison HQ Brain | Per-studio telemetry token (generated at PROV, stored in studio Fly secrets), validated at HQ ingest by HMAC against a HQ master secret; rotate on request |
| HQ provisioning webhook (`POST /provision`) without auth | Anyone can trigger provisioning of arbitrary cloud resources | Require the GymClassOS platform master key (HQ Vercel env) in the `Authorization` header; rate-limit to 10 requests/min/IP at the Vercel edge |
| Studio secrets stored decrypted in HQ Neon | HQ Neon breach exposes every studio's Stripe key and WhatsApp App Secret simultaneously | Never store studio secrets in HQ Neon at all; credentials live only in the studio's own Fly secrets and Vercel env |
| Admin seed user for new studio uses a predictable password | First-login takeover if provisioning emails are intercepted | Generate a 32-char random password; force-change on first login; deliver as a time-limited signed URL, not a visible password |
| HQ super-admin session lacks CSRF protection | CSRF attack against HQ provisioning endpoint triggers unauthorized provisioning | Better-auth's built-in CSRF protection is on by default; verify it is not disabled in HQ auth config |
| HQ Brain given access to raw telemetry payloads | If a future telemetry payload contains PII (Pitfall T-01 regression), Brain vectorizes and stores it permanently | HQ Brain reads from a separate `studio_metrics` aggregate view, not from the raw `telemetry_events` table |

---

## "Looks Done But Isn't" Checklist

- [ ] **Provisioning idempotency:** Re-run the provisioning job for an already-provisioned studio and confirm zero new Neon/Vercel/Fly resources are created.
- [ ] **Rollback completeness:** Deliberately fail at each step (Neon created, Vercel created, Fly deploy) and confirm rollback leaves zero orphaned resources in all three providers.
- [ ] **Slug uniqueness:** Concurrent signup test for the same slug — confirm exactly one provisioning run proceeds, the other receives a 409.
- [ ] **PII boundary (Zod strict):** POST a telemetry payload containing `member_email: "test@test.com"` to the HQ ingest endpoint — confirm 422.
- [ ] **PII in logs:** Trigger a WhatsApp opt-in error in the studio worker and confirm the error log contains a member UUID, not an email address.
- [ ] **HQ schema guard:** Add a `database_url` column to the HQ `studios` table in a test migration and confirm the CI guard fails.
- [ ] **WhatsApp opt-out race:** Enqueue a heartbeat campaign and simultaneously process an opt-out webhook for a member in the campaign — confirm the opted-out member receives no send.
- [ ] **Template approval gate:** Run the GOD campaign runner with a template in `meta_approval_status = 'pending'` — confirm a clear error is logged and no sends are enqueued.
- [ ] **Fork boundary:** `git diff upstream/main HEAD -- templates/` returns empty output after all HQ template copies are made.
- [ ] **HQ org seed:** Log in as the HQ super-admin immediately after `runMigrations` and confirm HQ Brain and Dispatch show content (not empty) when documents are created.
- [ ] **Stuck-job alert:** Force a provisioning pg-boss job to `failed` state — confirm the HQ watchdog fires an operator alert within 5 minutes.
- [ ] **DNS propagation timing:** Complete a real provisioning run and confirm the provisioning state machine uses the Vercel deploy URL (not subdomain) for the healthcheck.
- [ ] **Worker heartbeat alert:** Stop the studio worker process — confirm HQ watchdog alerts within 15 minutes.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| Duplicate Neon projects from non-idempotent retry | MEDIUM | Identify orphan via Neon dashboard (`GET /projects`); delete orphan via `DELETE /projects/{project_id}`; update `provisioning_runs` with correct project ID |
| Partial-failure + Fly app pointed at wrong Neon | HIGH | Manual: `fly secrets set DATABASE_URL=<correct_url> --app gymos-<slug>`; `fly deploy --app gymos-<slug>`; run migrations; verify worker health check |
| PII in HQ telemetry table | HIGH | Identify the offending rows; delete them with a WHERE clause (audit-logged); fix the telemetry payload code and the Zod schema; re-run affected telemetry periods from aggregate queries only; log the incident |
| Studio secrets leaked to HQ Neon in plain text | CRITICAL | Rotate all affected secrets immediately (Stripe key, WhatsApp App Secret, Better-auth secret per studio); update Fly secrets + Vercel env for each affected studio; audit HQ Neon access logs for reads of the compromised rows |
| Templates not approved blocking campaigns | LOW | Resubmit templates via Meta Graph API; set `meta_approval_status = 'pending'` in studio DB; campaigns auto-resume when the recurring check job detects `APPROVED` status from Meta |
| Stuck provisioning job | LOW | Query `pgboss.job` for the stuck step; manually invoke the step's idempotent handler via HQ admin action; or mark the run `failed_terminal` to trigger rollback and restart |
| Studio worker crashed and not restarting | MEDIUM | `fly logs --app gymos-<slug>` to identify crash cause; `fly secrets set` any missing secrets; `fly deploy --app gymos-<slug>` to force restart; verify `/healthz` returns 200 |
| HQD owner message sent from wrong WABA | MEDIUM | Identify sent messages via Meta Business Manager for the studio WABA; notify affected owners that the message was sent in error; document as compliance incident; fix HQD send path to use HQ WABA before next run |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| P-01: Non-idempotent provisioning | BD-PROV | Re-run provisioning; confirm no new resources |
| P-02: Partial failure + no rollback | BD-PROV | Injected failures at each step; zero orphans after rollback |
| P-03: Slug race condition | BD-PROV | Concurrent signup test; one succeeds, one 409 |
| P-04: Secret leakage via logs | BD-PROV | Pino log audit; HQ Neon provisioning_runs schema inspection |
| P-05: DNS propagation false rollback | BD-PROV | Observe first real provisioning run; healthcheck uses Vercel deploy URL |
| P-06: Abusive signups + cost blowout | BD-PROV | 50 rapid signups; confirm rate limiter fires; zero provisioning jobs enqueued |
| T-01: Telemetry PII payload | BD-TEL | PII payload → HQ ingest → 422 confirmed |
| T-02: Error messages carry PII upward | BD-TEL | ESLint rule; Better Stack search for email patterns in worker logs |
| T-03: HQ receives studio DB credentials | BD-HQ-FND | CI guard on HQ schema; studios table inspection |
| T-04: Token records carry prompt content | BD-TEL | `ai_token_usage` schema audit; no session or prompt columns |
| W-01: Heartbeat ignores opt-out | BD-GOD | Opt-out webhook → campaign enqueue → no send confirmed |
| W-02: Sending storm from concurrent studios | BD-GOD | 3+ studio concurrent campaign; confirms staggered start times in logs |
| W-03: Owner messages via wrong WABA | BD-HQD | HQD send code inspection; no studio WABA references |
| W-04: Templates not approved before campaigns | BD-PROV + BD-GOD | Campaign runner with `meta_approval_status = 'pending'` → clear error |
| F-01: Fork boundary violation | BD-HQ-FND | `git diff upstream/main HEAD -- templates/` is empty |
| F-02: Dispatch/Brain org model mismatch | BD-HQ-FND | Super-admin login; Brain and Dispatch return content |
| F-03: HQ Brain ingests member PII | BD-HQB | CSV upload with email column → rejection confirmed |
| O-01: Stuck provisioning + no alert | BD-PROV | Force job to `failed`; operator alert within 5 minutes |
| O-02: Telemetry failure → false at-risk | BD-TEL | Set `last_telemetry_received_at` to 49h ago; studio excluded from at-risk cohort |
| O-03: Fly cost scaling unmonitored | BD-PROV | Fly budget alerts configured; auto_stop in fly.toml template |
| O-04: Worker crash + no recovery path | BD-PROV | Kill worker; Fly auto-restarts; HQ watchdog fires heartbeat alert within 15 min |

---

## Sources

- `.planning/PROJECT.md` (2026-06-19): fork boundary, no-breaking-DB-changes, PII hard rule ("no member/lead PII ever flows up to HQ"), WhatsApp sender-layer enforcement, pg-boss queue model, single-tenant/multi-tenant deploy, provisioning automation as "key risk"
- `AGENTS.md` conventions: no-unscoped-queries guard, no-drizzle-push guard, integration-webhooks queue pattern, no breaking DB changes (real incident: PR #252, nine templates, framework tables dropped in prod 2026-04-21), no unscoped queries (real incident: slides decks bug 2026-04-28), `accessFilter` + `ownableColumns()` model
- Neon Management API reference: `POST /projects` has no idempotency key parameter; create always produces a new project; verified by API reference structure
- Meta WhatsApp Cloud API documentation: template approval is asynchronous (24-72 hours per template per WABA); per-recipient template rate limits; opt-in requirements for template sends outside the 24-hour conversation window; `template_not_approved` error code
- Fly.io documentation: `auto_stop_machines`, `min_machines_running`, process groups in `fly.toml`, health check configuration; machine compute cost model (always-on minimum cost per machine)
- pg-boss documentation: `expireInSeconds` and `retryLimit` job options; `pgboss.job` state machine (created → active → completed / failed / expired); lack of cross-job-type ordering guarantees
- Vercel Projects API documentation: project creation and environment variable management are separate API operations
- GymClassOS v1 post-mortems (from memory in PROJECT.md and AGENTS.md): member upsert dual-unique-key gotcha (92cd3b6a), migration drift requiring manual apply to Neon, WhatsApp pipeline MYÜTIK relay and credential-scope issues

---

*Pitfalls research for: GymClassOS v2.0 — Self-Serve Platform + Two-Tier Brain/Dispatcher*
*Researched: 2026-06-19*
*Supersedes: v1.2 Agentic Tab Editing PITFALLS.md (archived in git history)*
