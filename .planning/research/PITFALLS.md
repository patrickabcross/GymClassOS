# Pitfalls Research — GymClassOS

> **⚠️ PARTIALLY STALE (revised 2026-05-17):** This file was written before the major scope revision. Specifically:
> - **Stripe Connect pitfalls (#13 etc.)** no longer apply — we're using direct restricted-API-key (NOT Connect). Skip the deauth + app-fee sections; the rest of the Stripe idempotency / atomicity / raw-body / replay pitfalls still apply.
> - **BullMQ references (#20, anti-patterns table, sources)** — replaced by pg-boss on Neon. The *pattern* (at-least-once delivery → duplicate sends → must use idempotent job IDs) is identical; just s/BullMQ jobId/pg-boss singletonKey/.
> - **Vercel↔Fly Redis routing pitfalls** — moot. No Redis. Both Vercel and Fly connect directly to Neon for queue work (pg-boss).
> - **Native mobile pitfalls** — not relevant for v1 (web PWA only). Re-engage when native mobile returns post-v1.
>
> Architecture-of-record is PROJECT.md. Read this for the underlying patterns; cross-check against PROJECT.md for what's still in scope.

**Domain:** Boutique fitness studio management platform (WhatsApp Cloud API direct + Stripe Connect + Neon + React Router v7 fork of agent-native + per-customer-deploy)
**Researched:** 2026-05-17
**Confidence:** HIGH for WhatsApp/Stripe/booking-race patterns (verified against Meta, Stripe, Postgres docs and 2026 community write-ups); HIGH for fork-drift patterns (industry-wide documented pattern); MEDIUM for per-customer-deploy specifics (transferred from Microsoft 365 / multi-tenant ops literature; the underlying mechanics generalise but the exact tooling story is project-specific).

---

## How to Read This Document

Every pitfall below carries five fields:

1. **What goes wrong** — the failure mode in concrete terms
2. **Why it happens** — root cause / why a careful developer still makes the mistake
3. **How to avoid** — a specific, actionable prevention strategy (no "be careful")
4. **Warning signs** — early-detection signals
5. **Phase to address** — where in the GymClassOS roadmap (Phase 0 audit, Phase 1 foundations, Phase 2 product) this should be designed-in, or **cross-cutting** if it spans multiple phases
6. **Severity** — critical / high / medium / low

The phase numbering follows `PROJECT.md`: Phase 0 = framework audit, Phase 1 = data + integrations foundation (Neon schema, WhatsApp, Stripe, auth shell), Phase 2 = product (staff app + schedule + bookings + passes), Phase 3 = mobile, Phase 4 = analytics + KB, Phase 5 = calorie counter.

---

## Critical Pitfalls

### Pitfall 1: Sending an outbound WhatsApp message outside the 24-hour window without a template (silent suspension risk)

**Severity:** CRITICAL — Meta-level account risk, not just a bug

**What goes wrong:**
The staff app lets a coach type a free-form message to a member whose last inbound was >24h ago. The send succeeds at the wire level, the Cloud API returns 200, but Meta downgrades the number's quality rating, eventually pauses the number, and in repeat offences suspends the WABA. Recovery requires a Meta support ticket and can take days. The signed launch customer has *one* phone number — if it's suspended, the studio's WhatsApp goes dark.

**Why it happens:**
The 24-hour-window rule is policy-enforced by Meta but only loosely surfaced in the Graph API responses. A naive sender layer treats "200 OK from Meta" as success and lets non-template sends through. The UI feels like SMS/iMessage to the coach, so they don't think to check window state. Even worse, the official Meta SDK is paused (Issue #31) and `@great-detail/whatsapp` doesn't enforce this rule for you — it's still your responsibility.

**How to avoid:**
Build a single `sendMessage()` function in the worker (the *only* path to Meta's API) that enforces window state at call time:

```ts
// Pseudocode for the gate
async function sendMessage(memberId, payload) {
  const lastInbound = await getLastInbound(memberId);
  const within24h = lastInbound && (Date.now() - lastInbound.ts) < 24 * 60 * 60 * 1000;
  if (!within24h && payload.type !== "template") {
    throw new OutOfWindowError("Free-form sends require a 24h-window. Use a template.");
  }
  // ... actually send
}
```

The UI MUST query window state before showing the "send" button and gray out free-form when out-of-window, only allowing template selection. The constraint in `PROJECT.md` says "non-template sends out of window MUST be rejected at the sender layer (not just discouraged in UI)" — implement BOTH gates because UIs change but the worker is the chokepoint.

**Warning signs:**
- Quality rating drops from Green to Yellow in WhatsApp Manager
- "Pending" status persists abnormally long on outbound sends
- Receipt of `messages` webhook events with `errors[].code` in 130xx range (re-engagement policy violations)

**Phase to address:** Phase 1 — the WhatsApp sender layer is foundational; the window-state table and the gate function are part of the integration foundation, not a Phase 2 product feature.

---

### Pitfall 2: Stripe webhook handler isn't atomically idempotent (double-charging passes, duplicate refunds, ghost bookings)

**Severity:** CRITICAL — corrupts payment + pass state silently

**What goes wrong:**
Stripe retries `checkout.session.completed` after a transient 504. Your handler already processed the first delivery — granted a 10-pack to the member, credited 10 visits — but on retry it grants another 10. The member now has 20 visits from one purchase. Or the handler is split between "process" and "mark processed" — a crash between them leaves you in a state where business work is done but the dedup record isn't, so the next retry double-fulfils. Stripe's docs are explicit: handlers MUST be idempotent, and the idempotency record + business work MUST be in the same DB transaction.

**Why it happens:**
The pattern "INSERT INTO processed_webhooks; do the work" is intuitive but wrong if the two aren't transactional. Worse, many tutorials show `acknowledge 200 first, process from queue` as the recommended pattern — but if your queue processing is also not idempotent, you've moved the bug without fixing it. The "out-of-order delivery" problem compounds: `invoice.payment_succeeded` can arrive before `customer.subscription.updated`, so a handler that branches on "this customer doesn't exist yet" may take the wrong path on first arrival.

**How to avoid:**
Three-layer defence:

1. **Single transaction:** `INSERT INTO stripe_events (event_id PRIMARY KEY) VALUES (?)` + business work + COMMIT, all in one transaction. If the INSERT fails on unique-violation, the handler returns 200 without doing work.
2. **Refetch from Stripe, don't trust event payload:** treat the event as a *trigger to reconcile*, not as the source of truth. Refetch the `Customer`, `Subscription`, `PaymentIntent` from Stripe's API and apply current state — this dissolves the out-of-order problem.
3. **Always pin `apiVersion`** in the SDK constructor; Meta auto-upgrading your account's default version mid-flight is a known way for "stable" handlers to start receiving subtly different payloads.

**Warning signs:**
- Duplicate rows in `pass_grants` or `payments` tables with the same `stripe_event_id` correlation
- Members reporting "I bought 1 pack but got 20 visits"
- Stripe dashboard shows webhook retries with mixed success/failure for the same `event_id`
- Refund reconciliation diverges from Stripe's view by month-end

**Phase to address:** Phase 1 — the `stripe_events` table, the `processedEvent()` helper, and the test fixtures (via Stripe CLI) are part of the integration foundation. Phase 2 product features (passes, bookings) consume this gate; they must not implement their own dedup.

---

### Pitfall 3: Class capacity double-booking via application-level "check then insert" race

**Severity:** CRITICAL — every fitness booking system that ships fast hits this

**What goes wrong:**
Coach starts class with capacity 12. Two concurrent booking requests arrive at 18:00:00 when 11 seats are full. Both load the `class` row, both see "1 seat left", both INSERT into `bookings`. Now there are 13 bookings for 12 seats. Member shows up, no mat. Studio refunds + apologises. The bug is timing-dependent so it rarely shows in dev but bites the moment a popular class fills.

**Why it happens:**
"SELECT count FROM bookings WHERE class_id = ?; if count < capacity then INSERT" is the most natural ORM-first code path and it's wrong. ORMs don't suggest exclusion constraints by default; Drizzle is no exception. Developers reach for application-level Redis locks when Postgres already has a much better answer.

**How to avoid:**
Use Postgres at the schema layer to make double-booking *structurally impossible*. Two-pronged:

1. **Atomic capacity decrement** in a single SQL statement that asserts the precondition:
```sql
INSERT INTO bookings (class_id, member_id)
SELECT :class_id, :member_id
FROM classes
WHERE id = :class_id AND booked_count < capacity
RETURNING id;
-- 0 rows returned = no seat (precondition failed); 1 row = booked
```
Wrap in a transaction that also `UPDATE classes SET booked_count = booked_count + 1 WHERE id = :class_id AND booked_count < capacity RETURNING booked_count` — this is row-locked and atomic.

2. **Exclusion constraint** on `(class_id, member_id) WHERE status = 'booked'` as a unique index — prevents same member double-booking the same class via race.

For *time-range* clashes (a member trying to book overlapping classes), use a Postgres GiST exclusion constraint on `tsrange` columns. This is what hotel-booking systems use; it generalises to fitness perfectly.

**Warning signs:**
- Any class shows `booked_count > capacity` in the DB
- Duplicate `(class_id, member_id, booked)` rows for the same member
- Studio staff manually moving members "since the system let them book"

**Phase to address:** Phase 2 — schema for `classes` and `bookings` plus the booking transaction belong to the class-schedule slice. Write the integration test (50 concurrent bookings against a 12-seat class, assert exactly 12 succeed) before declaring the feature done.

---

### Pitfall 4: Pass-balance race condition produces negative balances or double-spend

**Severity:** CRITICAL — financial integrity, member trust

**What goes wrong:**
Member has 1 visit left on a 10-pack. They book two classes simultaneously from web + mobile. Both transactions check "balance >= 1" then debit. Result: balance = -1, two classes booked off one credit. Or: refund job runs while a debit is in flight, restoring the credit before the debit lands — balance corrupts.

**Why it happens:**
Pass balances feel like an integer column; developers write `UPDATE passes SET balance = balance - 1 WHERE id = ?` without a guard, or worse, `UPDATE passes SET balance = ?` with a value pre-computed in application code. The Drizzle ORM ergonomics encourage the second pattern (loading the row, mutating in JS, saving back).

**How to avoid:**
1. **Always debit with a precondition in SQL:**
```sql
UPDATE passes SET balance = balance - 1
WHERE id = :pass_id AND balance >= 1
RETURNING balance;
-- 0 rows = insufficient credit; 1 row = debited
```
2. **Add a CHECK constraint** at the schema level: `CHECK (balance >= 0)` — Postgres will reject any attempted negative balance unconditionally. This is the suspenders-with-belt.
3. **Track debit/credit as an immutable ledger**, not a mutable balance column. Materialise the balance as `SUM(amount) WHERE pass_id = ?`. Slightly more work to query but you can never lose a debit and you have a full audit trail for "where did my visits go?" disputes.

The ledger pattern is recommended for the launch customer; the mutable-balance + CHECK pattern is acceptable if Phase 2 timeline pressure demands it, but flag for refactor before opening to studio #2.

**Warning signs:**
- Any `passes.balance < 0` row appears
- Member complaints about "missing visits"
- Refund flow restores more credits than were debited

**Phase to address:** Phase 1 (schema decision — ledger vs balance) + Phase 2 (debit + refund flows). The decision must be made BEFORE Phase 2 implementation; flipping a balance-column design to a ledger is a non-trivial refactor.

---

### Pitfall 5: Storing recurring class schedules as `timestamptz` produces a 1-hour bug at DST boundaries

**Severity:** CRITICAL — every recurring-class system that ships in a DST-observing timezone hits this exactly twice a year

**What goes wrong:**
Studio says "Yoga every Monday 09:00". You store the rule as `timestamptz = 2026-05-19T09:00:00+02:00` and the recurring engine adds 7 days each week. October's DST shift moves Europe/Vienna to +01:00, but your stored UTC remains the same — the class now appears at 08:00 local. Members miss class, coach shows up to an empty room, studio rage-quits the product.

**Why it happens:**
`timestamptz` is the type developers reach for ("it handles timezones, right?"). It does — but only as an *instant*, not as a recurring local-wall-clock rule. Storing a local rule as a single timestamptz freezes a specific date and a specific DST state. `date-fns` (in the agent-native stack) makes this easy to get wrong; you need `date-fns-tz` and the discipline to keep recurring rules separate from concrete occurrences.

**How to avoid:**
Two-column pattern:

1. **`schedule_rule`** table: `(weekday SMALLINT, local_time TIME, timezone TEXT NOT NULL CHECK (...))` — stores the *rule* in local wall-clock terms with an IANA zone name (never an offset like `+02:00`).
2. **`class_occurrence`** table: `(scheduled_at TIMESTAMPTZ, local_start TIMESTAMP, timezone TEXT)` — materialised concrete occurrences. Generated by a worker that runs `date-fns-tz` to convert (weekday + local_time + timezone + target_date) into an instant *at occurrence-generation time*, not at rule-creation time.

When the studio edits a recurring rule, regenerate future occurrences. Never edit historical occurrences. Render all UIs in studio-local time using the stored `timezone` column.

Also: do NOT use `+02:00`-style offsets anywhere in the schema. Use `Europe/Vienna`. Add a CHECK that calls `now() AT TIME ZONE timezone` works (or validate at app layer with a Zod refinement against `Intl.supportedValuesOf('timeZone')`).

**Warning signs:**
- Test with `SET timezone = 'America/New_York'; SELECT * FROM class_occurrences WHERE date = '2026-11-02'` (US fall-back day) — any classes showing the wrong wall-clock time
- Studio staff manually editing class times "because the system is off by an hour"
- Bug reports clustered in late March and late October

**Phase to address:** Phase 1 (schema for `schedule_rule`/`class_occurrence` + the IANA constraint) + Phase 2 (recurring engine + UI rendering). Phase 1 lock-in matters because changing the schema later is painful.

---

### Pitfall 6: Modifying agent-native templates in-place destroys the upstream merge story

**Severity:** CRITICAL for the vertical-SaaS-factory thesis; HIGH for v1 maintenance

**What goes wrong:**
You fork `BuilderIO/agent-native`, copy the Mail template, and modify it directly under `templates/mail/` to become the WhatsApp client. Six months in, agent-native ships a major refactor of `@agent-native/core` and a security patch to the Mail template. Your `git merge upstream/main` produces hundreds of conflicts. You stop merging. Now you've adopted the cost of forking with none of the benefit. Worse: when vertical #2 starts, you can't tell which changes are "GymClassOS specifics" vs "framework upgrades I made by hand" — every diff is a thicket.

**Why it happens:**
The fastest way to ship is "open the file, change the thing." The investment in a clean modification layer feels like premature abstraction (especially under the 2-month deadline). Meta's WebRTC team and Preset's blog both document this exact failure pattern — "fork drift" — under different names, and it's the dominant outcome unless you discipline yourself from day 0.

**How to avoid:**
Apply Meta's friendly-fork discipline at small scale:

1. **Two git remotes from day one:** `origin = your fork`, `upstream = BuilderIO/agent-native`. `git remote add upstream ...` at clone time.
2. **Treat `templates/` as read-only.** Copy templates *out* of `templates/` into `apps/staff-web/features/{whatsapp,schedule,...}/` for GymClassOS-specific modifications. Original templates stay pristine so `git merge upstream/main` doesn't touch your modified code.
3. **Treat `packages/core` as a workspace dependency you don't edit.** If you find yourself needing to change core, fork it cleanly to a `packages/core-gymos` sibling instead.
4. **Bi-weekly merge cadence in Phase 1-2.** A scheduled "Friday afternoon: `git fetch upstream && git merge upstream/main` and resolve" prevents drift from compounding. If a merge ever takes >2 hours, that's a smell — investigate WHAT modifications are catching, those are your fork-drift hotspots.
5. **Maintain `MODIFICATIONS.md`** at repo root listing every file you've edited under `templates/` or `packages/` with a reason. If the list grows past ~5 entries, that's a re-architecture signal.
6. **Decision in Phase 0:** the audit explicitly decides "fork-clean" vs "adapt" vs "build-fresh". Don't go halfway. If Phase 0 picks "fork-clean", commit to the discipline. If it picks "adapt", delete `templates/` and `upstream` remote — pretending you'll merge later when you've stopped is the worst of both worlds.

**Warning signs:**
- `git merge upstream/main` produces conflicts in `templates/` files (you've edited them in place)
- `MODIFICATIONS.md` grows past ~5 entries
- The same bug is reported by an upstream user and you can't tell whether their fix applies to your version
- You stop merging upstream for >30 days "to focus on shipping"

**Phase to address:** Phase 0 — the audit decision (`audit/decision.md` per PROJECT.md) sets the merge strategy. Phase 1 enforces it by directory layout. Cross-cutting from there.

---

### Pitfall 7: Premature extraction into a "vertical SaaS framework" before vertical #2 exists

**Severity:** HIGH — directly kills the v1 deadline

**What goes wrong:**
The vertical-SaaS-factory thesis tempts you to build abstractions for vertical #2 *while* building GymClassOS. You introduce a "studio plugin" interface, a "vertical config" layer, a "tenant theme" indirection. Vertical #2 turns out to need none of these (or needs different ones entirely). You shipped GymClassOS slow because you were really building two products at once. Project constraint #11 in `PROJECT.md` flags this explicitly as out-of-scope, but the temptation will recur every time you write something "studio-specific".

**Why it happens:**
Smart developers spot reuse patterns and want to factor early. The second vertical is hypothetical, so its shape is whatever you imagine. You imagine wrong. The cost shows up later as "the abstraction we built for vertical #2 doesn't actually fit vertical #2, and is in the way for everything in GymClassOS."

**How to avoid:**
1. **Hard rule:** until vertical #2 has a signed customer, GymClassOS code may NOT introduce a "vertical config" / "plugin" / "theme" / "tenant-aware" abstraction. Use `git grep` periodically to check for these words; if they appear, delete them.
2. **The "two verticals before extraction" rule.** Rule of three says wait for the third repetition; the constraint in `PROJECT.md` allows two. Either way, GymClassOS-only is single-occurrence; no extraction allowed.
3. **Keep the framework/product distinction with directory structure, not abstractions.** `packages/core` (from upstream) = framework. `apps/staff-web/features/*` = product. The line is `import` direction: never let `packages/core` import from `apps/`. This is enough discipline to make extraction *easier when it's time*, without paying the cost up front.
4. **Pre-commit code review (with yourself).** If a diff includes the word "interface" or "abstract" for something that has one concrete implementation, push back on yourself.

**Warning signs:**
- Code introduces `StudioConfig`, `VerticalAdapter`, `TenantTheme`-style types
- A feature takes 2x longer than estimated because you stopped to "make it reusable"
- Documentation discusses "the framework" vs "GymClassOS" instead of just "the codebase"

**Phase to address:** Cross-cutting — every phase. The audit in Phase 0 should explicitly state "extraction deferred until vertical #2 begins" and re-affirm at each phase transition.

---

### Pitfall 8: Hosting webhooks on Vercel functions instead of Fly (cold starts + IP allowlist break Meta's retry expectations)

**Severity:** HIGH — already designed-against in STACK.md, but the temptation will recur

**What goes wrong:**
You move "just the Stripe webhook" or "just the WhatsApp webhook" to a Vercel function "because it's simpler." Cold starts on a low-traffic studio mean the first webhook after 5 minutes idle takes 3-4 seconds; Meta and Stripe both retry on 5xx and on timeout. Pile-ups occur during cold-start storms. Stripe's `event_id` retries are normally fine because your idempotency table catches them — but Meta's WhatsApp inbound events with duplicate message IDs over a long retry window (up to 7 days) start producing noisy duplicate-inbound handling.

**Why it happens:**
Vercel function deployment feels "free" (it's just an `api/` route). Fly requires a separate machine, a separate deploy, more YAML. The pull toward simplicity is real.

**How to avoid:**
1. **Architectural hard rule:** webhook receivers live on Fly, ALWAYS. Document this in `apps/edge-webhooks/README.md` so future-you doesn't argue with past-you.
2. **No `api/webhooks/*` routes in `apps/staff-web` on Vercel.** Make this a lint rule if possible; failing that, a checklist item.
3. **Meta IP allowlist (when you turn it on):** Fly machines have stable IPs; document the studio's allowlisted IP and re-validate it on every Fly machine recreation.
4. **Cold-start mitigation on Fly:** keep the `edge-webhooks` machine at `min_machines = 1` in `fly.toml`. Don't scale to zero. The cost of one always-on small machine is dwarfed by the cost of debugging missed webhooks.

**Warning signs:**
- Stripe dashboard shows webhook attempts with `Response time > 5s`
- Meta WhatsApp Manager shows "delivery failures" in the webhook diagnostics
- Inbound messages appearing in the staff app several seconds late

**Phase to address:** Phase 1 — `apps/edge-webhooks` shipped to Fly before any handler logic is written. The receiver-on-Fly architecture is foundational.

---

## High-Severity Pitfalls

### Pitfall 9: `express.json()` (or any body-parsing middleware) ahead of the Stripe/WhatsApp webhook routes destroys signature verification

**Severity:** HIGH — quick to introduce, silent failure mode (handler keeps working, just stops being secure)

**What goes wrong:**
You install a "convenient" body parser globally. Stripe's `constructEvent()` and Meta's HMAC verification both need the *raw* request body byte-for-byte. Once `express.json()` (or H3's auto-parser, or any equivalent) runs, the raw body is gone. Verification fails — and if you're not careful, you "fix" it by bypassing verification, opening the door to webhook forgery.

**Why it happens:**
Framework defaults parse JSON globally. Stripe's own docs flag this as the #1 webhook footgun. The agent-native + H3 stack auto-parses request bodies in middleware unless you opt out.

**How to avoid:**
- Use Hono on the Fly webhook receivers (`c.req.raw`) — this is in STACK.md for exactly this reason. Hono doesn't auto-parse.
- For Stripe: always use `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Never hand-roll HMAC.
- For WhatsApp: use `@great-detail/whatsapp`'s `event.verifySignature(appSecret)` which expects the raw bytes; do not pass parsed JSON.
- **Test:** write an integration test that POSTs to your webhook with a deliberately tampered body and assert it returns 401. If it doesn't, your verification is broken.

**Warning signs:**
- Stripe CLI replay fixtures pass verification locally but production webhooks fail
- Any reference to `JSON.stringify(req.body)` inside a verification path (this is the smell — it means raw bytes were lost and someone re-stringified them, which fails on whitespace differences)

**Phase to address:** Phase 1 — write the verification + raw-body discipline into the `edge-webhooks` Hono app at scaffolding time.

---

### Pitfall 10: Connection pool exhaustion on Neon because of long-running queries on the HTTP driver

**Severity:** HIGH — manifests as intermittent 500s under modest load

**What goes wrong:**
You use Neon's HTTP driver (`@neondatabase/serverless`) everywhere because it's "the modern choice" for serverless. But the HTTP driver is *single-shot* — no transactions, no multi-statement sessions. You try to do a transaction inside a Vercel function and the second statement opens a NEW HTTP connection, breaking transactional semantics. Or you use the WebSocket driver on Fly worker but forget to `client.end()` after each job — connections accumulate, Postgres connection limit hits, all jobs start failing.

**Why it happens:**
The HTTP-vs-WebSocket distinction is subtle and the Neon docs don't slap you in the face with it. Drizzle's API hides which driver is in use. Connection lifecycle on Fly long-running workers feels obvious but bites under retry-storm load.

**How to avoid:**
1. **Use `neon-http` for stateless single-statement reads/writes** on Vercel. Document this explicitly: "If you need a transaction, use the worker."
2. **Use `neon-serverless` (WebSocket) on Fly workers** for anything transactional. Open the pool *once* at process start (`drizzle(pool)`), share it across jobs. Never create a pool per-request.
3. **Use the POOLED Neon endpoint string** (`-pooler` suffix on the host) for application queries. Use the DIRECT endpoint only for Drizzle migrations, because PgBouncer (which Neon's pooler uses) doesn't support all DDL operations transactionally.
4. **Set `min_machines = 1`** on Fly so the worker stays warm — eliminates the "new pool per cold start" problem.

**Warning signs:**
- Postgres `pg_stat_activity` shows hundreds of idle connections from your Fly machine
- Migrations fail with "prepared statement does not exist" (PgBouncer mode mismatch)
- Transactional logic silently doesn't roll back on error (HTTP driver isolates statements)

**Phase to address:** Phase 1 — the database connection convention belongs in the integration foundation. A `db.ts` module per app exporting the right driver for the runtime.

---

### Pitfall 11: WhatsApp message-status webhook duplicates corrupt the conversation log

**Severity:** HIGH — corrupts the inbox UX, double-counts read/delivery stats

**What goes wrong:**
WhatsApp delivers webhooks at-least-once. The same `messages[].id` arrives twice (or three times) during retry storms. Your handler appends to a `messages` table and increments a `delivered_count` on the conversation. Duplicate inserts produce duplicate inbox entries; double-counts skew quality-rating dashboards. Status webhooks (sent → delivered → read) are emitted as separate events per message, multiplying the dedup surface.

**Why it happens:**
WhatsApp's at-least-once delivery semantics are documented but easy to miss. Status updates aren't `messages[].id`-keyed in the same way as inbound — they're `statuses[].id` with a separate dedup key.

**How to avoid:**
1. **`whatsapp_events` table with `(event_type, external_id) UNIQUE`** as the dedup boundary. `event_type IN ('inbound_message', 'status_update')`, `external_id = messages[].id OR statuses[].id`. Insert-or-ignore on every webhook hit.
2. **Status state machine, not append-only.** Conversation messages have a single `status` column (`sent | delivered | read | failed`) — status webhooks UPDATE the row (with `WHERE new_status > current_status` ordinal guard), they don't insert.
3. **Store the raw webhook payload** in a `whatsapp_events.raw_payload JSONB` column so debugging duplicate semantics later is possible without log archaeology.

**Warning signs:**
- Members appear twice in the inbox
- `delivered_count > sent_count` on a conversation
- Read receipts arriving "before" delivery confirmations

**Phase to address:** Phase 1 — schema + ingestion dedup belong with the WhatsApp integration foundation.

---

### Pitfall 12: WhatsApp template categorisation mistakes (utility submitted as marketing or vice versa) → cost spike or rejection

**Severity:** HIGH — financial impact + customer-trust impact

**What goes wrong:**
You submit a class-reminder template categorised as MARKETING. Meta approves it. Every reminder you send now bills at marketing rates (significantly higher per message). Or: you submit a promotional offer as UTILITY, Meta auto-recategorises mid-campaign, your messages start failing or you get a quality warning. Meta no longer bills per conversation window; they bill per template message at category-tier rates, so misclassification has direct unit-economics impact.

**Why it happens:**
The categories overlap intuitively. A "reminder" feels utility but if it nudges toward an upsell it's marketing. Meta's classifier is opinionated and inconsistent. The Cloud API doesn't surface category in a way that's obvious during send.

**How to avoid:**
1. **Maintain a template catalog in code** (`apps/staff-web/features/whatsapp/templates.ts`) with the submitted category as a literal field. Reviews this list quarterly against current sends.
2. **Submit templates one at a time and verify the approved category** in WhatsApp Manager before using. If Meta auto-recategorised, update the catalog and the cost model.
3. **Template pacing awareness:** Meta tests new templates on ~1,000 recipients first; plan for slow ramp on new templates and don't launch a campaign assuming full throughput on day 1.
4. **Send via a typed function** that requires `templateName` (not a string literal sprinkled everywhere) so the catalog stays the source of truth.

**Warning signs:**
- Monthly WhatsApp bill grows out of proportion to message volume
- Templates change category from UTILITY to MARKETING in WhatsApp Manager
- Template status goes from Active → Paused or Active → Disabled

**Phase to address:** Phase 1 (template catalog pattern + send-via-name discipline) + Phase 2 (specific templates as needed). Cross-cutting for ongoing template hygiene.

---

### Pitfall 13: Stripe Connect application fee not refunded when refunding the underlying charge

**Severity:** HIGH — silent revenue leak from the platform to the connected studio

**What goes wrong:**
Studio refunds a customer. Stripe refunds the underlying charge but does NOT automatically refund the application fee. The connected studio loses that money (which they may not notice for months); GymClassOS keeps the application fee on a refunded transaction (which the studio absolutely will notice when they audit). Worse: when refunds get tangled with disputes, the lack of clarity about whose money is whose creates a billing nightmare.

**Why it happens:**
Stripe's refund API has an explicit `refund_application_fee: true` parameter that defaults to `false`. The default does the wrong thing for almost every platform.

**How to avoid:**
1. **Default refund flow in the worker:** `stripe.refunds.create({ payment_intent, refund_application_fee: true })`. Never default to leaving the fee.
2. **Two flows, explicit:**
   - "Refund customer + return platform fee" (the normal path; 99% case)
   - "Refund customer + KEEP platform fee" (charge studio for the work; manual path with a justification field)
3. **Reconciliation report** in Phase 4 analytics: surface any refunded charges where `application_fee.refunded = false`.

Also handle `account.application.deauthorized` properly — when a studio disconnects their Stripe account, you should: (a) mark the account inactive in the local DB, (b) stop attempting outbound API calls, (c) preserve historical data for reconciliation, (d) NOT delete the historical records.

**Warning signs:**
- Studio asks "why is my Stripe statement different from your dashboard?"
- `application_fee` rows for refunded `payment_intent`s with no corresponding `application_fee_refund`
- Disconnected studio's API calls returning 401 in logs

**Phase to address:** Phase 1 — refund flow + deauth handling are integration concerns. Phase 4 reconciliation surfaces residual mismatches.

---

### Pitfall 14: Configuration drift between per-studio deploys (one studio gets a fix, others silently don't)

**Severity:** HIGH — grows with every new studio; not yet a problem at N=1 but architecturally guaranteed at N=3+

**What goes wrong:**
Launch customer reports a bug. You fix it on their Fly app + Vercel deploy + Neon migration. Two weeks later, studio #2 onboards and you forget to apply the migration there. Studio #2 sees the bug, you don't know why "it was fixed". Or: you set an env var in production for studio #1 to debug something, never set it for studio #2. Per-customer deploys multiply the "did I do this everywhere?" problem by N. The Microsoft 365 tenant-management literature documents this pattern extensively — "version drift, inconsistent experiences, heavy operational overhead" is the canonical outcome.

**Why it happens:**
The freedom of per-customer deploy is the absence of any forcing function. There's no "deploy to all tenants" button by default — you have to build one.

**How to avoid:**
1. **One deploy script, no manual deploys.** From day one: `scripts/deploy.sh <studio>` that runs migrations + deploys all 3 apps (Vercel, Fly edge, Fly worker) deterministically. Manual `fly deploy` / `vercel deploy` calls are forbidden.
2. **Env var inventory in version control.** A `studios/<studio>/env.yml` (encrypted with sops or age) lists every var. Setting a var by `fly secrets set` directly is forbidden — change the yml, redeploy.
3. **A "all-studios" deploy command** that loops over `studios/*/` and deploys each. Run it on every release. From day one with N=1 this seems silly; do it anyway, because by N=3 it's the only thing saving you.
4. **A daily/weekly drift-check script** that reads each studio's deployed git SHA, env var hashes, and migration state into a single dashboard. Anything mismatched is a flag.
5. **Migrations are immutable + ordered.** Never modify a generated `drizzle-kit` migration file — generate a new one. The migration filename has the timestamp prefix that orders them; trust it.

**Warning signs:**
- A studio reports a bug you "already fixed" and you can't immediately verify their git SHA
- Different studios have different env var sets
- You catch yourself typing `fly deploy` directly in a terminal

**Phase to address:** Phase 1 — the deploy script + env layout BEFORE the first deploy. Cross-cutting maintenance after that.

---

### Pitfall 15: Using `drizzle-kit push` instead of `generate + migrate` silently drops data

**Severity:** HIGH — destructive, irreversible

**What goes wrong:**
You change a column type in `schema.ts` and run `drizzle-kit push` to sync the DB. The tool happily DROPs the old column (with its data) and ADDs a new one. In dev this is fine; in production this is catastrophic. agent-native ships a `guard:no-drizzle-push` script for exactly this reason.

**Why it happens:**
`push` is the fast, ergonomic command. `generate + migrate` requires two steps and review of a SQL file. Under deadline pressure, "just push" is tempting.

**How to avoid:**
1. **Preserve agent-native's `guard:no-drizzle-push` guard.** Don't delete it. Extend it: a pre-commit hook that fails if `drizzle-kit push` appears anywhere in any script.
2. **Migration workflow is `pnpm db:generate` → review SQL file → `pnpm db:migrate`.** Never deviate, including in dev (so the muscle memory is the right muscle memory).
3. **Always review generated SQL for DROP statements.** Any `DROP COLUMN` or `DROP TABLE` in a generated migration needs an explicit data-migration step first.

**Warning signs:**
- `drizzle-kit push` appears in any script
- Migration files in `drizzle/migrations/` are inconsistent with the schema
- A team member says "let me just push the schema"

**Phase to address:** Phase 1 — the migration discipline is foundational. Cross-cutting maintenance.

---

### Pitfall 16: React Router v7 framework mode on Vercel — middleware + env var pitfalls

**Severity:** MEDIUM-HIGH — known issues with workarounds; surface area to validate at Phase 0

**What goes wrong:**
React Router v7's middleware feature has documented edge cases on Vercel (community thread "React Router v7 with middleware fails on Vercel"). And Vercel's auto-injected env vars (`VERCEL_URL`, `VERCEL_ENV`) may not appear in `import.meta.env` even though they're in `process.env` inside loaders. You write your auth middleware once locally, ship it, and it fails on Vercel with `Invalid context value provided to handleRequest`.

**Why it happens:**
React Router v7 is moving fast; Vercel's adapter is keeping up; the seams between them shift. Better-auth integrations with React Router v7 middleware (which agent-native uses) sit right at this seam.

**How to avoid:**
1. **Phase 0 validation:** deploy a hello-world React Router v7 + Better-auth app to Vercel BEFORE committing to the architecture. This is in STACK.md as a MEDIUM confidence flag; the validation is mandatory.
2. **Use `process.env` in loaders/actions, not `import.meta.env`,** for Vercel-injected vars. Use `import.meta.env` only for build-time `VITE_*` prefixed values.
3. **Use the `@vercel/react-router` preset's `handleRequest`** if customising `entry.server.tsx`. Don't roll your own.
4. **Pin the React Router patch version** to whatever agent-native ships. Don't chase 7.x updates mid-build.

**Warning signs:**
- "Invalid context value" errors in Vercel deploy logs
- Env vars work in dev but `undefined` in production
- Auth middleware works locally, fails on Vercel

**Phase to address:** Phase 0 — validation deploy must happen before commitment. Phase 1 — codify the conventions.

---

### Pitfall 17: Sending WhatsApp messages without explicit opt-in violates Meta policy (suspension risk)

**Severity:** HIGH — Meta-level account risk

**What goes wrong:**
Studio uploads its existing member list, you start sending class-reminder templates. Members report "I never asked for this" → quality rating crashes → number suspended. Meta requires demonstrable opt-in for any business-initiated message. "They're already a member of the studio" is not opt-in in Meta's view.

**Why it happens:**
The studio's contract with members may include opt-in clauses, but Meta wants channel-specific opt-in — usually a "you'll receive class updates via WhatsApp" disclosure with explicit consent capture. Studios often don't have this; the temptation is to skip the friction.

**How to avoid:**
1. **`whatsapp_opt_in` table:** `(member_id, opted_in_at TIMESTAMPTZ NOT NULL, source TEXT, raw_consent_text TEXT)`. The `sendMessage()` gate (from Pitfall 1) ALSO checks opt-in for any non-utility template + any free-form send.
2. **Opt-in capture flow:** during member onboarding (in the existing customer mobile app, Phase 3) or via a WhatsApp double-opt-in (member texts a keyword, gets a confirmation back). Studio admin UI surfaces opt-in status per member.
3. **Audit log of opt-in changes** for the inevitable "they're complaining, we have proof" scenario.
4. **Default to UTILITY templates** for transactional reminders; only MARKETING templates require the stronger opt-in posture.

**Warning signs:**
- WhatsApp Manager shows user blocks > median
- Quality rating drops after a bulk send
- Member complaints surface in the studio's other channels

**Phase to address:** Phase 1 (schema + sender gate) + Phase 3 (mobile opt-in capture). Cross-cutting policy concern.

---

### Pitfall 18: Waitlist auto-promotion race conditions create double-bookings or stuck waitlists

**Severity:** HIGH — failure mode is "members on waitlist, seat goes unfilled" or "two people promoted to one seat"

**What goes wrong:**
Class is full, three members on waitlist. Two members cancel simultaneously. Auto-promotion runs twice, promotes the same waitlist member twice (or skips one). Or: cancellation completes but promotion job doesn't fire (Redis transient hiccup), waitlist person never gets in. The race is the same family as Pitfall 3 but with extra moving parts (the promotion is async).

**Why it happens:**
Waitlist promotion is usually an async job triggered by cancellation. Async + race-prone shared state + at-least-once delivery from BullMQ = bugs.

**How to avoid:**
1. **Cancellation + promotion in one transaction** (synchronous, not queued) for the common case: `UPDATE bookings SET status = 'cancelled' WHERE id = ?; INSERT INTO bookings SELECT ... FROM waitlist WHERE class_id = ? ORDER BY position LIMIT 1 ON CONFLICT DO NOTHING; UPDATE waitlist SET status = 'promoted' WHERE ...`. All inside one tx, leveraging the same atomic capacity decrement from Pitfall 3.
2. **If promotion must be async** (e.g., needs to send WhatsApp before confirming), use a BullMQ job with `jobId = "promote-{classId}-{waitlistPosition}"` so duplicate enqueues collapse to one. The job itself must be idempotent.
3. **Background reconciliation cron:** every 5 minutes, find classes with `booked_count < capacity AND waitlist_size > 0` and trigger promotion. Self-healing against missed events.
4. **Test:** 50 simultaneous cancellations against a class with 50 waitlist; assert exactly the right number of promotions.

**Warning signs:**
- `booked_count + cancelled_count` doesn't match expectations
- Members on waitlist who report "I never got promoted even though spots opened"
- Same waitlist member shown as promoted to multiple classes

**Phase to address:** Phase 2 — paired with the booking transaction work.

---

### Pitfall 19: `@great-detail/whatsapp` package goes stale or breaks (single-maintainer risk)

**Severity:** MEDIUM-HIGH — known supply-chain risk flagged in STACK.md

**What goes wrong:**
The maintained fork of Meta's WhatsApp SDK is a single-maintainer project. Maintainer's life happens, package stops updating. Meta ships Cloud API v24 with a breaking change, your sends start failing, you can't get a fix upstream.

**Why it happens:**
Meta's official SDK is paused. The fork is the best option, but it's structurally fragile. You're depending on one person's continued effort for a critical integration.

**How to avoid:**
1. **Mirror the package** to your own GitHub org at Phase 0. `gh repo fork great-detail/whatsapp --org your-org`. Pin your `package.json` to that mirror's git SHA.
2. **Wrap the SDK in a thin adapter** (`apps/worker/whatsapp/client.ts`) so swapping to hand-rolled `fetch` calls against the Graph API is a one-file change. The Graph API itself is simple — the value of the SDK is mostly `verifySignature()` and TS types.
3. **Pin `apiVersion`** to a specific Cloud API version (e.g., `v23.0`) explicitly in every request. Don't let it float; Meta's "latest" version can change behaviour underneath you.
4. **Quarterly dependency review** — check the package's commit cadence and ecosystem health. If it goes silent for a quarter, start preparing the hand-rolled replacement.

**Warning signs:**
- No package release in 90+ days
- GitHub issues piling up unanswered
- Cloud API version your code uses approaches deprecation

**Phase to address:** Phase 0 (mirror + adapter pattern) + cross-cutting monitoring.

---

### Pitfall 20: Worker queue at-least-once delivery causes duplicate outbound WhatsApp sends (pg-boss specifics)

**Severity:** HIGH — member receives the same message twice, looks unprofessional, hits Meta quality rating

**What goes wrong:**
A class-reminder job is enqueued. Worker picks it up, sends the WhatsApp template successfully, but crashes/times-out BEFORE marking the job complete. pg-boss retries the job (default `retryLimit` + `retryBackoff: true`). Member gets two reminders. Multiply by 100 members across all daily reminders; quality rating tanks.

**Why it happens:**
pg-boss (like every durable queue, including BullMQ) guarantees "at least once" delivery — if a worker fails to complete the job within `expireInSeconds` (or crashes), the job re-runs. Without explicit idempotency, every send-side effect can repeat.

**How to avoid:**
1. **Use pg-boss `singletonKey` at enqueue time:** `singletonKey = "send-reminder-{classOccurrenceId}-{memberId}"`. pg-boss deduplicates on this key (returns `null` from `send()` if a job with that key already exists in the queue), so duplicate enqueues collapse.
2. **Idempotent execution:** even with unique `singletonKey`, the job *body* can re-run if it crashes mid-processing. Before sending, check `whatsapp_sent_log` for `(class_occurrence_id, member_id, template_name)`. If a row exists, skip. After sending, INSERT the row in the same transaction as marking the message ID in the outbound log.
3. **`expireInSeconds` tuned to actual processing time.** Default expiry is 15min for fetched jobs; tune lower for fast jobs to surface crashes faster, or higher for slow sends. Set explicitly in the job options.
4. **Idempotency table for outbound sends:** `outbound_messages` with `(idempotency_key UNIQUE)` derived from job context. Worker checks before send.

**Warning signs:**
- Members report receiving the same reminder twice
- `outbound_messages` table has multiple rows for the same `(member, template, scheduled_at)` triple
- pg-boss `pgboss.job` table shows jobs with `state='retry'` or `state='failed'` for the same `singletonKey` — visible via `SELECT name, state, count(*) FROM pgboss.job GROUP BY name, state`

**Phase to address:** Phase 1 — outbound message infrastructure. Reused across Phase 2 reminders + Phase 3 mobile push.

---

## Medium-Severity Pitfalls

### Pitfall 21: Pass expiry handling forgets timezone, charges members for "expired" passes that just haven't expired yet locally

**Severity:** MEDIUM — financial fairness + member trust

**What goes wrong:**
Pass expires at "30 days from purchase". Stored as `expires_at = purchase_at + INTERVAL '30 days'` in UTC. Member in Europe/Vienna purchases at 23:30 local. The pass expires 30 days later at 23:30 UTC — which is *the next day* in local time. Member thinks they have until end of day, system says expired, member rages.

**Why it happens:**
"30 days" feels like a clean interval. It isn't — at minute granularity it includes the wall-clock time of purchase.

**How to avoid:**
1. **Expiry granularity is end-of-day in studio timezone:** `expires_at = (purchase_at::date + INTERVAL '30 days') AT TIME ZONE studio_timezone + INTERVAL '1 day' - INTERVAL '1 second'`. Member gets the full last day.
2. **Surface expiry in member-visible UI as a date, not a datetime** — eliminates the ambiguity.
3. **Pause-aware expiry:** if the customer adopts the "freeze membership" feature, pause the expiry clock. Track as `expires_at_effective = base_expiry + frozen_duration` so it survives recompute.

**Warning signs:**
- Support tickets clustered around expiry-day complaints
- Members in non-UTC timezones disproportionately affected

**Phase to address:** Phase 2 — pass schema + expiry computation.

---

### Pitfall 22: Logging secrets / member PII to Pino / Better Stack inadvertently

**Severity:** MEDIUM-HIGH — GDPR + customer trust

**What goes wrong:**
Default Pino config logs the full request body. Member sends a WhatsApp message that contains their phone number or address. It gets logged. Better Stack ingests it. Now you have PII in third-party log storage that wasn't supposed to be there.

**Why it happens:**
Structured logging defaults are verbose. Webhook payloads contain PII by nature. Developers add fields to logs without filtering.

**How to avoid:**
1. **Pino redaction config:** `redact: { paths: ['*.phone_number', '*.email', 'req.headers.authorization', 'req.body.text', '*.stripe.payment_method'], remove: true }`. Set globally in the logger initialiser.
2. **No raw webhook bodies in logs** — log the event ID + type + outcome, not the body.
3. **Log review checklist** — at every phase transition, sample 100 production logs and assert no PII / secrets present.

**Warning signs:**
- Searching log storage for `+43` (phone-number prefix) returns matches
- Any `Authorization: Bearer ...` strings in logs
- WhatsApp message content visible in logs

**Phase to address:** Phase 1 (logger config) + cross-cutting log hygiene.

---

### Pitfall 23: Re-using a phone number for WhatsApp Business that's still on personal WhatsApp

**Severity:** MEDIUM — onboarding-time blocker, not a runtime bug

**What goes wrong:**
Studio gives you their existing business phone number to register on WhatsApp Cloud API. Two-step verification is enabled (or the number is still on personal WhatsApp). Registration fails. Or the studio deletes their personal WhatsApp on that number, loses chat history, panics.

**Why it happens:**
The studio doesn't know the registration constraints. You don't ask the right questions during onboarding.

**How to avoid:**
1. **Onboarding checklist:** before requesting the number, confirm: (a) two-step verification is OFF on that number's personal WhatsApp, (b) studio has backed up any chat history they want to keep, (c) studio acknowledges the personal account will be deleted on that number, (d) Meta Business Manager exists and the number is owned by the right business.
2. **Display name pre-approval:** the WhatsApp display name needs Facebook Business Manager approval; submit early. This is decoupled from API registration but blocks production sends.
3. **Document in `studios/<studio>/onboarding.md`** for repeatable per-studio onboarding.

**Warning signs:**
- Registration API returns errors about 2FA or number-in-use
- Display name shows as "Pending" for >24h

**Phase to address:** Phase 1 — onboarding workflow for the launch customer is part of integration foundation. Cross-cutting for future studios.

---

### Pitfall 24: Polling patterns prevent Neon scale-to-zero, surprise bill

**Severity:** LOW-MEDIUM — financial, not correctness

**What goes wrong:**
You add a TanStack Query interval that polls every 30s for new WhatsApp messages in the inbox. Every poll hits Neon. Neon never scales to zero. The "serverless Postgres" stays running 24/7, costing what a regular Postgres costs. Per-customer-deploy multiplies the bill by N studios.

**Why it happens:**
Polling is the easiest pattern for "show new messages without refresh". It works. The cost shows up on the next invoice.

**How to avoid:**
1. **Webhook-driven UI invalidation:** the worker that processes an inbound WhatsApp event publishes an update via Better-auth session channel / SSE / Vercel KV pub-sub to the staff app, which invalidates the relevant TanStack Query keys.
2. **If polling, poll at the API gateway (Vercel) not the DB.** Cache the inbox response for 5s in Vercel Edge Cache; client polls Vercel, only cache misses hit Neon.
3. **Monitor Neon compute hours per studio** weekly; investigate any studio sitting >50% of wallclock.

**Warning signs:**
- Neon compute hours significantly more than wallclock-with-activity would predict
- Multiple long-lived intervals visible in browser devtools network tab

**Phase to address:** Phase 2 — the inbox UX decisions. Cross-cutting cost monitoring.

---

### Pitfall 25: H3 middleware reads request body before webhook signature verification

**Severity:** MEDIUM (same family as Pitfall 9, specific to the staff-web app's H3 stack)

**What goes wrong:**
If, against STACK.md's advice, any webhook handler is mounted in the React Router app on Vercel instead of the Fly Hono app, H3's auto-body-parsing destroys signature verification before the handler runs.

**Why it happens:**
H3 is opinionated about body parsing; React Router v7 framework mode plus agent-native's middleware layer plus Better-auth's request handling means there are multiple opportunities to slurp the body early.

**How to avoid:**
This is mitigated by the "webhooks on Fly only" architectural rule (Pitfall 8). Defence in depth: add a lint / runtime guard that fails any route file with a path matching `/webhooks/**` in `apps/staff-web/`.

**Warning signs:**
- Any file named `webhook` or `hook` appears under `apps/staff-web/`

**Phase to address:** Phase 1 — architectural guardrail.

---

### Pitfall 26: Vitest browser mode bug with React Router v7 components

**Severity:** LOW-MEDIUM — flagged in STACK.md as test-infrastructure pitfall

**What goes wrong:**
You write a component test using Vitest's browser mode. Hits a known preamble-detection bug specific to React Router v7. Test fails for reasons unrelated to your component.

**Why it happens:**
The browser-mode integration with the new React Router v7 framework mode is incomplete.

**How to avoid:**
- Use Vitest for non-UI code: Zod schemas, idempotency logic, window-state enforcer, Stripe event reducer
- Use Playwright for UI / E2E tests
- Don't fight the Vitest browser-mode bug; route around it

**Phase to address:** Phase 0 — testing strategy decision. Cross-cutting.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Mutable `passes.balance` column instead of ledger | Half the schema, faster to ship | Refund/dispute audits become detective work; race conditions multiply | ONLY for the launch customer, MUST refactor before studio #2 |
| Hand-modifying `templates/` files for GymClassOS specifics | Fastest path to a working WhatsApp client | Upstream merges become unfixable; framework value evaporates | NEVER — copy out to `apps/staff-web/features/` even when slower |
| Single env vars file shared across studios | One config to maintain | First per-studio override leaks across all studios; security blast radius | NEVER once N > 1 |
| Inline Stripe webhook handler in React Router action | Skip the Fly deploy | Cold-start retries, signature-verification fragility | NEVER — webhooks belong on Fly |
| `drizzle-kit push` "just this once" | Skip the migration review step | Data loss | NEVER in any environment (Drizzle + Neon makes branching painless; use a branch) |
| Skipping opt-in capture "studio knows their members" | Faster onboarding | Account suspension risk | NEVER — Meta enforces |
| Default `apiVersion` (floating) on Stripe SDK | Less config | Stripe ships API change, your handlers break overnight | NEVER — always pin |
| `setTimeout` for class reminders instead of BullMQ | Skip the queue infrastructure | Reminders silently fail on process restart, no retry, no observability | Only for prototyping in Phase 0 |
| Logging full webhook payloads "for debugging" | Trivial debugging | PII in log storage, GDPR exposure | NEVER in production; OK gated to dev environment |
| Manual `fly deploy` to one studio "while I'm fixing something" | Faster fix | Config drift; you forget which studio has what | NEVER — always through the deploy script |
| Vercel function for WhatsApp inbound "while Fly is being set up" | One less moving part initially | Cold-start retries, missed messages | Only acceptable IF Fly is genuinely not yet provisioned in Phase 1 (then immediately migrate) |
| Free-form `sendWhatsApp(text)` API in the worker | Quick to test | Coaches send out-of-window messages, account suspended | NEVER — always template-aware send function |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Stripe webhooks** | Trusting event payload as source of truth | Treat event as trigger; refetch resource from Stripe API |
| **Stripe webhooks** | `processed_webhooks` insert + business work in separate transactions | Single DB transaction wrapping both |
| **Stripe webhooks** | `express.json()` ahead of webhook route | Hono `c.req.raw` on Fly receiver |
| **Stripe Connect refunds** | Not refunding application fee | `refund_application_fee: true` by default |
| **Stripe Connect** | Ignoring `account.application.deauthorized` | Mark account inactive, halt API calls, preserve history |
| **Stripe SDK** | Floating `apiVersion` | Explicit pin in SDK constructor |
| **WhatsApp Cloud API** | Sending free-form out of 24h window | Sender layer gate that checks last-inbound timestamp |
| **WhatsApp Cloud API** | Not deduplicating inbound webhooks | `(event_type, external_id) UNIQUE` table |
| **WhatsApp Cloud API** | Treating status webhooks as inserts | UPDATE conversation message with ordinal status guard |
| **WhatsApp templates** | Wrong category at submission | Maintain in-code catalog, verify approved category before use |
| **WhatsApp templates** | Assuming day-1 full throughput on new template | Plan for pacing; new templates ramp on ~1k recipients first |
| **WhatsApp opt-in** | "Member of the studio = consent" | Explicit channel-opt-in capture, audit table |
| **WhatsApp phone number** | Migrating from personal WhatsApp without disabling 2FA | Onboarding checklist confirms 2FA off + backup chats |
| **Neon Postgres** | Using HTTP driver for transactions | HTTP for single-shot, WebSocket (or pooled pg) for transactional |
| **Neon Postgres** | Migrations through pooled endpoint | Use DIRECT endpoint for `drizzle-kit migrate` |
| **Neon Postgres** | `drizzle-kit push` to sync schema | `generate` + review SQL + `migrate` only |
| **BullMQ** | Job body not idempotent | Idempotency table keyed on job context; check before side effect |
| **BullMQ** | Default lock duration on slow jobs | Tune `lockDuration` to 2x worst-case processing time |
| **React Router v7 on Vercel** | `import.meta.env` for Vercel system vars | Use `process.env` inside loaders/actions |
| **React Router v7 on Vercel** | Custom `entry.server.tsx` without Vercel preset | Use `@vercel/react-router/entry.server` |
| **Fly.io webhooks** | `min_machines = 0` (scale to zero) | `min_machines = 1` for webhook receivers |
| **Better-auth** | Rolling your own JWT handling alongside it | Trust Better-auth's session model; don't dual-stack |
| **OpenFoodFacts** (Phase 5) | Treating API as authoritative on missing items | Fall back to LLM for natural-language; cache OpenFoodFacts results |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| TanStack Query polling for inbox | Neon compute hours track wallclock | Push updates via SSE / webhook → query invalidation | First studio with >50 active conversations |
| Loading full conversation history into staff inbox | Inbox page slow, memory growth | Paginate; load last 30 messages, lazy-load older | 200+ messages per conversation |
| N+1 queries on member listings (member → last_message → balance) | Member list page > 1s | Drizzle `with` joins; or a single SQL with LATERAL | 500+ members per studio |
| Per-message INSERT to `whatsapp_events` log | Webhook handler latency creeps up | Batch in worker (BullMQ aggregation); INSERT … SELECT FROM jsonb_array_elements | High-volume studio (>10k inbound/day) |
| Computing pass balance as `SUM(amount)` at every read | Bookings page slow | Materialised view refreshed on ledger insert; or hybrid (cached + ledger) | >100 ledger entries per member |
| Recurring class occurrence generation in request path | First request after schedule edit slow | Generate occurrences in worker on rule change, not on read | First time a studio has 50+ recurring classes |
| Single Fly machine for `edge-webhooks` | Webhook processing blocks during high-throughput events | Scale Fly machines on CPU; webhooks should enqueue fast and return | First viral period or campaign send |
| Pinging Neon to keep warm via cron | Compute hours = wallclock | Use scale-to-zero correctly; accept cold-start latency for low-traffic studios | Always — anti-pattern |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Stripe API keys in env vars unencrypted | Compromise = total payment access | Per-studio Fly secrets + sops-encrypted yml; rotate quarterly |
| Logging WhatsApp message content / member phone numbers | GDPR violation, member-data leak | Pino redaction config; review log samples |
| Card data anywhere outside Stripe (even "just the last 4") | PCI DSS scope creep | Tokenised IDs only; if you need last-4, fetch from Stripe on-demand |
| Webhook signature verification bypassed in dev "for convenience" | Forged webhooks granting passes | Verification ALWAYS on; use Stripe CLI for legitimate test events |
| Missing rate limit on staff login | Credential stuffing | Better-auth has rate limit primitives; enable + tune |
| Studio admin's access leaking to other studios | Cross-studio data exposure | Per-customer deploy makes this structurally impossible — DO NOT cross-link |
| Cloud API webhook callback URL guessable + signature optional | Forged inbound messages | Set webhook verify token + verify `X-Hub-Signature-256` on every request |
| Mobile push notification tokens stored unscoped | Token theft → impersonation | Scope tokens per-member; rotate on logout |
| Service account for Fly with overprivileged scope | Blast radius on compromise | Least-privilege Fly tokens per studio |
| Stripe Connect `client_secret` shipped to client | Account hijack | Never — only `publishable_key` reaches client; OAuth handled server-side |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Sender UI doesn't show 24h-window state | Coach types message, gets unexplained "blocked" error | Window-state indicator next to send button; pre-select template when out-of-window |
| Booking confirmation arrives only after payment webhook (delay) | Member confused — did it work? | Optimistic UI: show "booked" immediately; reconcile on webhook |
| Class capacity displayed cached / stale | Member books "available" class, gets waitlisted | Real-time capacity in booking UI; recheck at confirm |
| Pass expiry shown as full ISO timestamp | Confusing; ambiguous timezone | Show as date in studio-local timezone; surface countdown for last 7 days |
| Waitlist position not shown | Members spam "where am I in line?" | Show position; notify on movement |
| Reminder sent at studio-server time, not member-local | Member receives 4am alert | Render reminders in studio timezone always (studio = member in scope) |
| No "test mode" toggle for studio admin testing Stripe flows | Real card needed to QA | Stripe test mode + dedicated test studio config |
| WhatsApp inbox treats template-sends and free-form-sends visually identically | Coach forgets which mode they were in | Visual distinction in message bubble |
| No "this conversation is in 24h-window" indicator in inbox | Coach replies thinking it's free-form, hits gate | Window-state pill on every conversation header |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **WhatsApp sender:** Often missing 24h-window enforcement at the function boundary — verify by writing a test that sends free-form out-of-window and asserts rejection
- [ ] **WhatsApp inbound:** Often missing webhook signature verification — verify by POSTing a tampered body and asserting 401
- [ ] **WhatsApp opt-in:** Often missing — verify `whatsapp_opt_in` table exists + sender checks it
- [ ] **Stripe webhook:** Often missing idempotency atomicity — verify by replaying same event twice via Stripe CLI, asserting one effect
- [ ] **Stripe webhook:** Often missing out-of-order tolerance — verify by replaying `customer.subscription.updated` before `customer.created`
- [ ] **Stripe refund:** Often missing `refund_application_fee: true` — verify default refund path
- [ ] **Stripe Connect deauth:** Often missing handler — verify `account.application.deauthorized` is in the registered event list
- [ ] **Booking transaction:** Often missing CHECK constraint or atomic decrement — verify with 50-concurrent-booking integration test
- [ ] **Pass balance:** Often missing CHECK >= 0 — verify by attempting to debit beyond balance
- [ ] **Recurring class:** Often missing IANA timezone column — verify schema, run DST-boundary test
- [ ] **Fly webhook receiver:** Often missing `min_machines = 1` — verify `fly.toml`
- [ ] **Deploy script:** Often missing — verify `scripts/deploy.sh <studio>` exists and runs migrations
- [ ] **Drizzle migrations:** Often missing review of generated SQL — verify every migration in `drizzle/migrations/` has been visually inspected
- [ ] **Env vars:** Often inconsistent across studios — verify `studios/*/env.yml` exists and is the only source
- [ ] **Better-auth + React Router v7:** Often only tested locally — verify it deploys + works on Vercel (Phase 0 validation)
- [ ] **Logger:** Often missing redaction — verify Pino `redact` config + sample log audit
- [ ] **agent-native fork:** Often `templates/` modified in place — verify `git diff upstream/main -- templates/` is empty (only added files OK, no modifications)
- [ ] **Mobile push (Phase 3):** Often missing certificate/key per-environment — verify APNS + FCM certs exist for the customer's app's environments
- [ ] **Mobile push (Phase 3):** Often missing duplicate-prevention on opaque IDs — verify push tokens are dedup'd on insert

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WhatsApp number quality drop | MEDIUM | Pause outbound; reduce send volume; submit fewer/cleaner templates; wait 7-14 days for rating recovery |
| WhatsApp number suspension | HIGH | Open Meta support ticket; document opt-in evidence; expect 5-14 day resolution; consider backup number in same business portfolio |
| Stripe webhook double-processed | LOW (if detected fast) | Reconciliation SQL: find duplicate effect rows by `stripe_event_id`, reverse the extras; refund/credit if needed |
| Capacity over-booking | LOW per incident | Manual: contact member, offer alternative slot or refund; long-term: add the missing constraint |
| Pass balance negative | LOW (if rare) | Audit ledger / balance; credit member back to zero or correct value; add the CHECK constraint |
| DST schedule bug | MEDIUM | Find affected classes (compare scheduled_at to studio-local rule); regenerate occurrences; notify members of corrections |
| Fork drift unfixable | HIGH | Either commit to "adapt" (stop pretending to merge) OR rebase your modifications cleanly atop a fresh upstream — multi-week effort |
| Config drift across studios | MEDIUM-HIGH | Build the drift-detection script you didn't build earlier; reconcile env vars + SHAs; redeploy mismatched studios |
| Stripe refund forgot app fee | LOW per case | Refund the app fee retroactively via Stripe API; fix the default in code |
| Stripe deauthorization unhandled | MEDIUM | Studio's outbound calls error 401; data preserved; re-onboard via Connect OAuth (new account id, link to existing studio record) |
| Neon scale-to-zero broken by polling | LOW (financial only) | Remove the polling; bill is recoverable conversation with Neon if it's egregious |
| BullMQ duplicate sends | LOW if caught fast | Add the idempotency check; apologise to affected members; review send logs for impact |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls. (Phase numbering per PROJECT.md: Phase 0 audit, Phase 1 foundations, Phase 2 product, Phase 3 mobile, Phase 4 analytics+KB, Phase 5 calorie.)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| #1 24h-window enforcement | Phase 1 | Integration test sends free-form out-of-window, asserts rejection |
| #2 Stripe webhook idempotency | Phase 1 | Stripe CLI replays same event; assert single effect |
| #3 Class capacity race | Phase 2 | 50-concurrent-booking test against 12-seat class asserts exactly 12 |
| #4 Pass balance race | Phase 1 (schema decision) + Phase 2 (flows) | Concurrent-debit test; CHECK constraint present |
| #5 DST timezone bug | Phase 1 schema + Phase 2 engine | DST-boundary test (set TZ, run recurring generation across DST date) |
| #6 Fork drift | Phase 0 audit + Phase 1 layout | `git diff upstream/main -- templates/` is empty of modifications |
| #7 Premature framework extraction | Cross-cutting | Periodic grep for `Tenant`/`Vertical`/`StudioConfig`/`Plugin` types |
| #8 Webhooks on Vercel | Phase 1 architecture | No `api/webhooks/*` routes in staff-web; only Fly Hono app handles them |
| #9 Body parser before verification | Phase 1 | Tampered-body test → 401 |
| #10 Neon driver / pool misuse | Phase 1 | Connection convention in `db.ts`; PgBouncer migration test |
| #11 WhatsApp webhook dedup | Phase 1 | Replay same webhook → single inbox entry |
| #12 Template categorisation | Phase 1 catalog + cross-cutting | Catalog file is source of truth; quarterly cost review |
| #13 Stripe app-fee refund + deauth | Phase 1 | Refund flow defaults; deauth handler in registered events |
| #14 Per-studio config drift | Phase 1 deploy script | Deploy script + `studios/*/env.yml`; drift-check cron |
| #15 `drizzle-kit push` | Phase 1 | `guard:no-drizzle-push` preserved + lint rule |
| #16 React Router v7 / Vercel | Phase 0 validation deploy | Hello-world with Better-auth deployed before commit |
| #17 WhatsApp opt-in | Phase 1 schema + Phase 3 capture UI | Opt-in table exists; sender gate checks it |
| #18 Waitlist race | Phase 2 | Concurrent-cancel test; reconciliation cron exists |
| #19 `@great-detail/whatsapp` risk | Phase 0 mirror + cross-cutting | Mirror exists; adapter wraps SDK |
| #20 BullMQ duplicate sends | Phase 1 | Idempotency table; lock duration tuned; replay test |
| #21 Pass expiry / timezone | Phase 2 | Expiry shown end-of-day local |
| #22 PII in logs | Phase 1 logger + cross-cutting | Redact config; log sample audit |
| #23 Number registration friction | Phase 1 onboarding | `studios/<studio>/onboarding.md` exists with checklist |
| #24 Polling keeps Neon warm | Phase 2 | Inbox uses push-based invalidation; Neon compute hours monitored |
| #25 H3 body parsing for webhooks | Phase 1 | No webhook routes in staff-web (lint rule) |
| #26 Vitest browser-mode bug | Phase 0 test strategy | UI tested via Playwright, not Vitest browser mode |

---

## Sources

**Stripe webhooks and Connect:**
- [Stripe Webhooks End-to-End: Signature Verification, Idempotency, Replay, Dead-Letter (Appycodes, 2026)](https://appycodes.dev/blog/stripe-webhooks-end-to-end-2026/)
- [Why Your Stripe Webhooks Are Silently Failing (DEV Community)](https://dev.to/jordan_sterchele/why-your-stripe-webhooks-are-silently-failing-and-how-to-fix-all-of-it-aio)
- [Stripe Webhook Best Practices: Raw Body, Signatures & Retries (HookRay 2026)](https://hookray.com/blog/stripe-webhook-best-practices-2026)
- [Stripe Connect Webhooks Docs](https://docs.stripe.com/connect/webhooks)
- [Stripe Connect Refunds and Disputes Docs](https://docs.stripe.com/connect/saas/tasks/refunds-disputes)
- [Stripe Connect Application Deauthorized (Stripe Groups Discussion)](https://groups.google.com/a/lists.stripe.com/g/api-discuss/c/yegH1pyNWY0)
- [Idempotency in Payment APIs (Simplico 2026)](https://simplico.net/2026/04/04/idempotency-in-payment-apis-prevent-double-charges-with-stripe-omise-and-2c2p/)
- [Handling Payment Webhooks Reliably (Medium, Sohail x Codes)](https://medium.com/@sohail_saifii/handling-payment-webhooks-reliably-idempotency-retries-validation-69b762720bf5)

**WhatsApp Cloud API:**
- [WhatsApp Business Messaging: Template Compliance (Infobip)](https://www.infobip.com/docs/whatsapp/compliance/template-compliance)
- [WhatsApp Business API Integration 2026 Guide (Chatarmin)](https://chatarmin.com/en/blog/whats-app-business-api-integration)
- [WhatsApp API Message Templates Complete Guide 2026 (Gurusup)](https://gurusup.com/blog/whatsapp-api-message-templates)
- [WhatsApp Business API Compliance 2026 (GMCSCO)](https://gmcsco.com/your-simple-guide-to-whatsapp-api-compliance-2026/)
- [WhatsApp Messaging Limits 2026 (Chatarmin)](https://chatarmin.com/en/blog/whats-app-messaging-limits)
- [Meta — Messaging Limits Documentation](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [WhatsApp 2026 Updates: Pacing, Limits & Usernames (Sanuker)](https://sanuker.com/whatsapp-api-2026_updates-pacing-limits-usernames/)
- [Guide to WhatsApp Webhooks (Hookdeck)](https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices)
- [Building a Scalable Webhook Architecture for Custom WhatsApp Solutions (ChatArchitect)](https://www.chatarchitect.com/news/building-a-scalable-webhook-architecture-for-custom-whatsapp-solutions)
- [Migrating a Phone Number to WhatsApp Cloud API (Respond.io)](https://respond.io/help/whatsapp/phone-number-migration-to-whatsapp-cloud-api)

**Booking systems and concurrency:**
- [PostgreSQL's GiST Exclusion Constraint: The Database-Level Answer to Double Bookings (Amitav Roy)](https://amitavroy.com/articles/postgresql-gist-exclusion-constraintthe-database-evel-answer-to-double-bookings)
- [How to Solve Race Conditions in a Booking System (HackerNoon)](https://hackernoon.com/how-to-solve-race-conditions-in-a-booking-system)
- [Handling the Double-Booking Problem in Databases (Adam Djellouli)](https://adamdjellouli.com/articles/databases_notes/07_concurrency_control/04_double_booking_problem)
- [Concurrency Conundrum in Booking Systems (Medium, Abhishek Ranjan)](https://medium.com/@abhishekranjandev/concurrency-conundrum-in-booking-systems-2e53dc717e8c)
- [Race Conditions in Hotel Booking Systems (Amitav Roy)](https://amitavroy.com/articles/race-conditions-in-hotel-booking-systems-why-your-technology-choice-matters-more-than-you-think)

**Timezones and DST:**
- [PostgreSQL Recurring Schedules and Time Zones (AppMaster)](https://appmaster.io/blog/postgresql-recurring-schedules-time-zones)
- [Handling DST Switch in Java App using Postgres DB (Medium, Vinodhini C)](https://vinodhinic.medium.com/handling-dst-switch-in-java-application-using-postgres-db-c434e3859272)
- [PostgreSQL Documentation: Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)

**Neon and Drizzle:**
- [Neon Serverless Postgres Guide for TypeScript (Encore)](https://encore.dev/articles/neon-serverless-postgres)
- [Drizzle ORM with Neon Postgres Practical Guide (Raxxo)](https://raxxo.shop/blogs/lab/drizzle-orm-with-neon-postgres-a-practical-guide)
- [Schema migration with Neon + Drizzle (Neon Docs)](https://neon.com/docs/guides/drizzle-migrations)
- [Drizzle with Local and Serverless Postgres (Neon Guides)](https://neon.com/guides/drizzle-local-vercel)
- [Neon Database Review 2026 (BuildPilot)](https://trybuildpilot.com/452-neon-database-review-2026)
- [Is Neon Database Safe? (Vibe-eval, 2026)](https://vibe-eval.com/safety/neon/)

**Forking and config drift:**
- [Stop Forking Around — The Hidden Dangers of Fork Drift (Preset)](https://preset.io/blog/stop-forking-around-the-hidden-dangers-of-fork-drift-in-open-source-adoption/)
- [Escaping the Fork: How Meta Modernized WebRTC (Meta Engineering, April 2026)](https://engineering.fb.com/2026/04/09/developer-tools/escaping-the-fork-how-meta-modernized-webrtc-across-50-use-cases/)
- [Friendly Fork Management Strategies (GitHub Blog)](https://github.blog/developer-skills/github/friend-zone-strategies-friendly-fork-management/)
- [Risks of Forking Open-Source Projects (DEV Community)](https://dev.to/bobcars/understanding-and-navigating-the-risks-of-forking-open-source-projects-strategies-for-sustainable-4hnp)
- [Multi-Tenant Deployment Guide 2026 (Qrvey)](https://qrvey.com/blog/multi-tenant-deployment/)
- [Detection and Management of Config Drift & Secrets Exposure (Entro)](https://entro.security/blog/detection-management-configuration-drifts/)

**BullMQ and queues:**
- [BullMQ Delivery Guarantees Discussion (#2223, GitHub)](https://github.com/taskforcesh/bullmq/discussions/2223)
- [BullMQ Idempotent Jobs Documentation](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Background Job Processing in Node.js: BullMQ, Queues, Worker Patterns 2026 (DEV)](https://dev.to/young_gao/background-job-processing-in-nodejs-bullmq-queues-and-worker-patterns-31d4)

**React Router v7 and Vercel:**
- [React Router v7 with Middleware Fails on Vercel (Vercel Community Thread)](https://community.vercel.com/t/react-router-v7-with-middleware-fails-on-vercel/25840)
- [React Router on Vercel (Vercel Docs)](https://vercel.com/docs/frameworks/frontend/react-router)
- [Support for React Router v7 (Vercel Changelog)](https://vercel.com/changelog/support-for-react-router-v7)
- [Vercel Does Not Inject System Variables in React Router (Vercel Community)](https://community.vercel.com/t/vercel-does-not-inject-system-variables-in-react-router/27791)

**Gym/fitness domain accounting:**
- [Revenue Recognition for Gyms: Prepaid & Deferred (CloudGymManager)](https://www.cloudgymmanager.com/revenue-recognition-for-gyms-prepaid-memberships-class-packs-and-deferred-revenue/)
- [How to Handle Chargebacks in Your Fitness Studio (Limitless Studio)](https://www.yourlimitlessstudio.com/articles/chargebacks)
- [Membership Fee Refund Class Actions (Seyfarth Shaw)](https://www.seyfarth.com/news-insights/membership-fee-refund-class-actions-hitting-the-office-the-gym-the-club-and-the-park.html)
- [ClassPass Terms of Use](https://classpass.com/terms/bra)

**Solo / deadline shipping:**
- [Stop Overengineering Your SaaS MVP (DEV, Muhammad Tanveer Abbas)](https://dev.to/muhammadtanveerabbas/stop-overengineering-your-saas-mvp-heres-what-actually-ships-2g9e)
- [The Solo SaaS Execution: Why You Feel Busy but Never Ship (Medium, Eddie Larsen, Feb 2026)](https://medium.com/@e2larsen/the-solo-saas-execution-why-you-feel-busy-but-never-ship-01ab8b05d139)
- [I Shipped a Productivity SaaS in 30 Days as a Solo Dev (Indie Hackers)](https://www.indiehackers.com/post/i-shipped-a-productivity-saas-in-30-days-as-a-solo-dev-heres-what-ai-actually-changed-and-what-it-didn-t-15c8876106)

**React Native existing-app integration (Phase 3):**
- [Overview of Using Expo with Existing React Native Apps (Expo Docs)](https://docs.expo.dev/bare/overview/)
- [Expo Push Notifications Guide 2026 (RN Relay)](https://reactnativerelay.com/article/react-native-push-notifications-expo-complete-guide-2026)
- [Migrating a React Native App to Expo (Headway)](https://www.headway.io/blog/migrating-a-react-native-app-to-expo)

**Project context (read at start):**
- `C:\Users\dimet\hustle\.planning\PROJECT.md` — GymClassOS v1 scope, constraints, key decisions
- `C:\Users\dimet\hustle\.planning\research\STACK.md` — stack research (already complete) — anchored several pitfalls (Vercel-vs-Fly webhook decision; `@great-detail/whatsapp` fork risk; `drizzle-kit push` guard; Vitest browser-mode bug; React Router v7 + Vercel validation gate)

---

*Pitfalls research for: GymClassOS — boutique fitness studio management platform*
*Researched: 2026-05-17*
*Confidence: HIGH (integration-specific pitfalls have direct vendor-doc support and 2026 community write-ups); MEDIUM for per-customer-deploy specifics (extrapolated from multi-tenant ops literature; the abstract pattern is well-documented, the specific tooling for Fly+Vercel+Neon-per-studio is fresh ground)*
