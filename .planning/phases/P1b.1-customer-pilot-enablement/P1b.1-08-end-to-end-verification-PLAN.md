---
phase: P1b.1-customer-pilot-enablement
plan: 08
type: execute
wave: 3
depends_on: [P1b.1-01, P1b.1-02, P1b.1-03, P1b.1-04, P1b.1-05, P1b.1-06, P1b.1-07]
files_modified: []
autonomous: false
requirements: [AUTH-01, INBX-01, INBX-02, WA-05, WA-06, WA-07, AGENT-04, AGENT-05]
must_haves:
  truths:
    - "All six ROADMAP success criteria for Phase P1b.1 are verified PASS by the user"
    - "Any failure surfaces a clear gap document (which criterion, what happened, which plan needs revision)"
  artifacts:
    - path: ".planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md"
      provides: "Pass/fail record per success criterion + any open issues for follow-up"
  key_links:
    - from: "User running the checklist"
      to: "Deployed staff-web (gym-class-os.vercel.app or local dev)"
      via: "Manual browser interaction following the verification script"
      pattern: "gymos OR access-denied"
---

<objective>
Walk the user through the 6 ROADMAP success criteria for Phase P1b.1 end-to-end. This is the final gate before the customer pilot launches — every criterion must pass before declaring the phase complete.

Purpose: All preceding plans land individual artifacts. This plan integrates them and verifies the customer experience matches what was promised. Includes the cross-cutting check that the worker chokepoint guarantees (opt-in, 24h-window, template-approved) still hold from the new UI surfaces.

Output:
- `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md` — pass/fail record + any gaps
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-CONTEXT.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md
@.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-RESEARCH.md
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: End-to-end pilot verification — walk the 6 success criteria</name>
  <files>.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md</files>
  <read_first>
    - .planning/ROADMAP.md §"Phase P1b.1: Customer Pilot Enablement" §"Success criteria" — the 6 numbered criteria are the verification script
    - .planning/phases/P1b.1-customer-pilot-enablement/P1b.1-UI-SPEC.md §"Surface Specifications" — visual contract per surface (for what "looks right" means)
    - All prior plan SUMMARYs in .planning/phases/P1b.1-customer-pilot-enablement/ (P1b.1-01-SUMMARY.md through P1b.1-07-SUMMARY.md) — confirms what each plan actually shipped, so deviations from plan can be cross-checked
  </read_first>
  <action>
Create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md` and walk every criterion. Then prompt the user to execute the manual verification script below and record PASS/FAIL for each criterion plus the negative auth test in the file.

The executor's job in this checkpoint is: (a) confirm prerequisites are met, (b) PROMPT the user to walk the script, (c) RECORD results in VERIFICATION.md as they report each PASS/FAIL.
  </action>
  <what-built>
The full P1b.1 phase: bare gymos layout (plan 01), auth allowlist + access-denied page (plan 02), 5 new gym actions (plans 03 + 04), whatsapp_templates seed (plan 04), Templates dialog (plan 05), Analytics route (plan 06), gym agent surface (plan 07).

Together these deliver the customer pilot experience: customer signs in with their nominated Google account, lands on a clean gym product with no email chrome, can send approved WhatsApp templates, has working analytics, and gets gym-aware answers from the right-rail Chat.
  </what-built>
  <how-to-verify>
Set environment first:
- Set `CUSTOMER_ALLOWED_EMAILS` env var in the deployment (Vercel project env or local `.env.local`) to include at least the user's Google email AND one test email not associated with a Google account in your possession (for the negative test). Example: `CUSTOMER_ALLOWED_EMAILS=patrickalexanderross@outlook.com`.
- Confirm the worker is running (Fly app `gymos-worker` or local `pnpm --filter @gymos/worker dev`).
- Confirm `whatsapp_templates` has 5 rows: `SELECT name, status FROM whatsapp_templates;` via Neon.
- For criterion 3 (real WhatsApp send): be ready with a test WhatsApp number that has opted-in to the studio's WABA AND has messaged in within the last 24h (so opt-in row exists).

Then walk this exact script in the browser:

***

**Criterion 1 — Customer sign-in lands on /gymos with no redirect to /inbox or email surface**
1. Open an incognito browser. Navigate to the deployed URL (or `http://localhost:8081`).
2. You should be redirected to the Google sign-in page.
3. Sign in with the allowlisted Google account.
4. **PASS** if the post-sign-in URL is `/gymos` (or any `/gymos/*` route) and you see the gymos top-nav.
5. **FAIL** if you land on `/inbox`, `/email`, `/draft-queue`, `/team`, or `/settings` (Mail).

**Criterion 2 — /gymos/* shows only gymos top-nav + content + right-rail Chat — no email chrome**
1. On `/gymos`, visually inspect the page.
2. **PASS** if you see ONLY: GymosTopNav (Inbox · Schedule · Members · Payments · Analytics · Settings), main content area, right-rail AgentSidebar (open by default on desktop).
3. **FAIL** if you see ANY of: hamburger menu button, "Important" / "Other 25" tabs, email-style sidebar (left panel with folders), Compose pen button, refresh icon, bell icon.
4. Visit `/gymos/schedule`, `/gymos/members`, `/gymos/payments`, `/gymos/analytics`, `/gymos/settings/integrations` — same check on each.

**Criterion 3 — Clicking Templates opens dialog of approved templates; selecting + filling + Send enqueues an outbound that arrives via Meta**
1. On `/gymos`, open any conversation.
2. Click the "Templates" button beside Send in the reply form.
3. Dialog opens; you see 5 templates in the left list:
   - `hello_world` with green "Approved" badge (enabled)
   - `class_reminder`, `waitlist_offer`, `payment_failed`, `pass_expiring` each with muted "Awaiting approval" badge (disabled, opacity-50)
4. Hover one of the pending templates — tooltip shows "Awaiting Meta approval — submit templates via your Meta Business Manager".
5. Click `hello_world`. Right pane shows: template name, "This template has no variables.", preview block reading "Hello World", Send template button enabled.
6. Click Send template. Dialog closes. Sonner toast "Template queued" fires. A new message row appears in the thread with status='queued' (optimistic).
7. **PASS** if within ~10 seconds, the message status moves to `sent` (worker successfully POSTed to Meta) AND the test WhatsApp number receives "Hello World".
8. **FAIL** if the message stays `queued` indefinitely, OR status moves to `failed`, OR the test number doesn't receive the message.

**Criterion 4 — /gymos/analytics loads with at least 3 metrics showing real values**
1. Click the Analytics tab in GymosTopNav.
2. Page loads with title "Analytics" + subtitle "Last 7 days · Last 30 days".
3. Three metric cards visible in a row (desktop) or stacked (mobile): Fill Rate, Cancellation Rate, Pass Utilisation.
4. Each card shows TWO values — primary (7d) and secondary (30d).
5. **PASS** if at least one card shows a non-"–" value (real data from seeded May 18-22 occurrences should give Fill Rate or Pass Utilisation real numbers).
6. **PASS** if cards with no data show "–" + "No data yet" (not a crash, not a hidden card).
7. **FAIL** if the page 404s, crashes, or shows email-themed analytics.

**Criterion 5 — Right-rail Chat answers the three chip prompts with real gym data**
1. On any /gymos/* route, click the first suggestion chip "Provide renewal numbers".
2. **PASS** if the agent's response references active subscriptions count AND expiring passes counts (real numbers from list-renewals).
3. **FAIL** if the agent says it can't help, refers to email, or fabricates numbers.
4. Repeat with "Which classes haven't been filled in the last week?".
5. **PASS** if the response cites specific class names + fill percentages (real data from list-fill-rate).
6. Repeat with "Which customers should I reach out to?".
7. **PASS** if the response cites specific member names + reasons (e.g., "no bookings in 30 days", "pass expiring next week").
8. **CROSS-CHECK** — ask "archive my emails". **PASS** if the agent refuses / says it's gym-only. **FAIL** if it tries to use archive-email or list-emails.

**Criterion 6 — Free-text send to a number with expired 24h window is rejected by the worker (typed WindowExpiredError)**
1. Find or create a conversation where `last_inbound_at` is > 24 hours ago. Either use a known-stale test member or manually update one row in `conversations`: `UPDATE conversations SET last_inbound_at = NOW() - INTERVAL '25 hours' WHERE id = '<some-id>';`.
2. Open that conversation.
3. Send a free-text message via the Send button (NOT Templates).
4. The optimistic message inserts with status='queued'.
5. **PASS** if within ~10 seconds, the status moves to `failed` AND the failed-bubble copy reads something like "24h window closed" (per the existing `failedCopy(errorCode)` mapping for WINDOW_EXPIRED).
6. **PASS CROSS-CHECK** if the worker logs show the typed `WindowExpiredError` was raised BEFORE any Meta API call (confirms gate held).
7. **FAIL** if the message reached Meta (worker logs show a Meta POST attempt), OR if status never updates from `queued`.

**Negative auth test (extension of Criterion 1)**
1. Open another incognito session.
2. Sign in with a Google account whose email is NOT in CUSTOMER_ALLOWED_EMAILS.
3. **PASS** if you land on `/access-denied` with the branded page (GymClassOS wordmark, IconLock, "Access not permitted" heading, body about studio admin, "Sign in with a different account" button).
4. **FAIL** if you land on `/gymos`, on a 401/403 error page, or anywhere else.

***

Record results in `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md` using this structure (executor writes the file as the user reports each result):

```
# P1b.1 — End-to-End Verification

Verified: <date>
Verifier: <name>
Deployment: <URL or local>

## Success Criteria Results

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Sign-in lands on /gymos with no email redirect | PASS or FAIL | ... |
| 2 | /gymos/* shows only gymos top-nav + content + right-rail Chat | PASS or FAIL | ... |
| 3 | Templates dialog selecting hello_world real Meta send | PASS or FAIL | ... |
| 4 | /gymos/analytics shows at least 3 real metrics | PASS or FAIL | ... |
| 5 | Right-rail Chat answers all 3 chip prompts with gym data | PASS or FAIL | ... |
| 6 | Free-text out-of-window send rejected by worker chokepoint | PASS or FAIL | ... |
| AUTH-neg | Non-allowlisted Google account lands on /access-denied | PASS or FAIL | ... |

## Open Issues

List any FAILs with: which criterion, what happened, which plan needs revision, suggested fix.

## Sign-off

- [ ] All criteria PASS — phase complete, ready to update ROADMAP
- [ ] Some FAILs — gap closure required via `/gsd:plan-phase P1b.1 --gaps`
```

If any criterion FAILS, do NOT mark the phase complete. The user should run `/gsd:plan-phase P1b.1 --gaps` to create gap-closure plans for the failed criteria.
  </how-to-verify>
  <verify>
Manual verification only — this task is a checkpoint:human-verify gate. Automated verification reduces to: VERIFICATION.md file exists in the phase directory after the user runs through the script.
  </verify>
  <acceptance_criteria>
    - File `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-VERIFICATION.md` exists after the checkpoint
    - VERIFICATION.md contains a row for each of the 6 criteria + the negative auth test (7 rows total)
    - Each row has either PASS or FAIL recorded (not blank)
    - If any FAIL exists: the Open Issues section lists which criterion failed and what happened
    - If all PASS: the Sign-off section's "phase complete" checkbox is marked
  </acceptance_criteria>
  <done>
The user has walked the full verification script with the deployment available, every criterion has a recorded PASS or FAIL, and VERIFICATION.md exists in the phase directory with the results. If gaps exist, the next step is clear (run `/gsd:plan-phase P1b.1 --gaps`).
  </done>
  <resume-signal>Type "verified" if all 7 checks PASS, or describe specific failures by criterion number</resume-signal>
</task>

</tasks>

<verification>
- All 6 ROADMAP success criteria + the negative auth test recorded as PASS/FAIL in VERIFICATION.md
- Worker chokepoint behavior (criterion 6) confirms WA-05/06/07 contracts hold
- Agent chip prompts produce real gym answers (criterion 5) confirms AGENT-04 surface
- The "(P2)" debug suffix is gone from out-of-window placeholder (UI-SPEC copywriting)
</verification>

<success_criteria>
1. VERIFICATION.md exists with results for all 6 criteria
2. User has either confirmed phase is complete OR identified specific failures with criterion numbers
3. If failures: clear path forward (gap-closure plans) is identified, not silent acceptance
</success_criteria>

<output>
After completion, create `.planning/phases/P1b.1-customer-pilot-enablement/P1b.1-08-end-to-end-verification-SUMMARY.md` documenting:
- Final PASS/FAIL count
- Whether the phase is complete or has open gaps
- If gaps exist: which plans need revision and how
- Any operational notes uncovered during verification (e.g., env vars to set, worker restart needed, etc.)
</output>
