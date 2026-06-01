---
phase: P1c-public-site-integrations
plan: 07
type: execute
wave: 4
depends_on: ["P1c-02", "P1c-03", "P1c-04", "P1c-05", "P1c-06"]
files_modified:
  - .planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md
autonomous: false
requirements: [EMBED-06]
must_haves:
  truths:
    - "From a clean browser on a throwaway host page, submitting an embedded form creates a status='lead' conversation visible in /gymos"
    - "From the same host page, clicking the embedded schedule widget's enquiry CTA creates a status='lead' conversation"
    - "A Stripe Checkout link created via create-checkout-link, paid in Stripe test mode, results in a pass bound to the member (P1b-07 reducer) — closing the lead→booking loop"
    - "The full GHL-replacement path is demonstrated end-to-end and recorded"
  artifacts:
    - path: ".planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md"
      provides: "Recorded end-to-end smoke-test results for the public-site integration"
      contains: "lead:submitted"
  key_links:
    - from: "embedded form/schedule on host page"
      to: "/gymos leads"
      via: "embed.js iframe → /api/submit → status='lead' conversation"
      pattern: "lead"
    - from: "create-checkout-link → Stripe test Checkout"
      to: "passes bound to member"
      via: "checkout.session.completed → P1b-07 reducer"
      pattern: "metadata.memberId"
---

<objective>
End-to-end smoke test (EMBED-06) of the whole P1c public-site integration on real running
services: embed the form + schedule on a throwaway host page, submit from a clean browser,
verify leads land in `/gymos`, then close the loop by sending a Stripe test-mode Checkout link
and confirming the P1b-07 reducer binds the pass. Record everything in P1c-E2E-RESULTS.md.

Purpose: This is the acceptance gate for the phase — it proves the GoHighLevel replacement
works as a unit, not just per-plan. It depends on every other P1c plan.

Output: `.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md
@.planning/phases/P1c-public-site-integrations/P1c-public-site-RESEARCH.md

<interfaces>
<!-- All P1c surfaces under test:
     /embed.js (P1c-06) → injects /f/<slug> (P1c-02) + /embed/schedule (P1c-05) iframes
     /api/submit/:id (P1c-02) → status='lead' conversation + gym_members upsert + form_submissions
     /gymos?filter=leads (P1c-04) → leads visible
     create-checkout-link action (P1c-03) → Stripe test Checkout w/ metadata.memberId
     P1b-07 reducer (already shipped) → grants + binds pass on checkout.session.completed
   Stripe test mode: use the Stripe CLI (`stripe listen --forward-to ...`) + a test restricted key
   configured at /gymos/settings/integrations, and Stripe's test card 4242 4242 4242 4242. -->

<!-- Worker + edge-webhooks run as the Fly app gymos-edge-webhooks; for local E2E the executor may
     run the worker locally OR use `stripe listen` to forward checkout.session.completed to the
     local/Fly Stripe webhook receiver. The Stripe Product/Price under test MUST have a description
     containing a recognised keyword (10-pack / 5-pack / drop-in) for the pass to be granted
     (P1c-03 Pitfall 7 / Open Question 4). -->
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 0: Full visitor→lead→Checkout→pass walkthrough</name>
  <what-built>
The complete P1c public-site integration across all running services (staff-web + worker +
Stripe webhooks). This checkpoint walks the full visitor→lead→Checkout→pass loop from a clean
browser and records the results.
  </what-built>
  <how-to-verify>
**Setup**
1. Ensure the 0003 migration is applied to Neon (P1c-01) and the enquiry form is seeded
   (`pnpm --filter @gymos/staff-web db:seed-enquiry-form`, P1c-05).
2. Boot staff-web: `$env:STAFF_WEB_URL="http://localhost:8081"; pnpm --filter @gymos/staff-web dev`.
3. In `/gymos/forms`, create + publish a "Trial Signup" form (name+email+phone). Note its slug.

**Part A — embedded form lead (FORMS-01..04)**
4. Create a throwaway host page `embed-test.html` (served via `npx serve -p 5500` to simulate a
   real cross-origin site like doyouhustle.co.uk):
   ```html
   <div data-gymos-form="trial-signup"></div>
   <div data-gymos-schedule></div>
   <script>
     document.addEventListener("lead:submitted", e => console.log("lead:submitted", e.detail));
     document.addEventListener("enquiry:created", e => console.log("enquiry:created", e.detail));
   </script>
   <script src="http://localhost:8081/embed.js" async></script>
   ```
5. Open `http://localhost:5500/embed-test.html` in a CLEAN browser/profile (not signed into
   staff-web). Confirm both iframes render and auto-size.
6. Submit the form (name + UK phone `07700 900123` + email). Console logs `lead:submitted`.
7. Sign into staff-web, open `/gymos?filter=leads` → the lead appears with status='lead' and the
   phone stored as `+447700900123`.

**Part B — embedded schedule enquiry (EMBED-01..04)**
8. Back on the host page, click a class slot in the schedule iframe → enquire (name+email+phone).
   Console logs `enquiry:created` with the `occurrenceId`.
9. `/gymos?filter=leads` shows the enquiry lead; its form_submissions `data` includes the
   `occurrenceId`.

**Part C — close the loop: Checkout → pass (EMBED-05)**
10. In Stripe test mode, ensure a test Price exists whose product description contains `10-pack`.
    Configure the test restricted key at `/gymos/settings/integrations` if not already.
11. Run `stripe listen --forward-to <stripe webhook receiver URL>` (local worker or Fly).
12. Call the action for the lead from Part A:
    `curl -X POST http://localhost:8081/_agent-native/actions/create-checkout-link -H "Content-Type: application/json" -d '{"memberId":"<lead member id>","priceId":"<test price id>","productName":"10-pack"}'`
    → returns `{ url }`.
13. Open the Checkout URL, pay with test card `4242 4242 4242 4242`.
14. Confirm `checkout.session.completed` fires, the P1b-07 reducer runs, and in Neon:
    ```sql
    SELECT id, member_id, granted, product_name FROM passes WHERE member_id = '<lead member id>' ORDER BY created_at DESC LIMIT 1;
    ```
    Expect a pass row bound to the member with `granted = 10`.
15. Confirm `/gymos/members/<id>` shows the new pass balance.

**Record**
16. The executor writes `.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md` with a
    pass/fail line for each of Parts A, B, C, the member id + conversation ids observed, the
    Stripe test session id, the final pass row, and any deviations.

Confirm Parts A, B, and C all pass, or describe which step failed.
  </how-to-verify>
  <resume-signal>Type "e2e passed" once the embedded form lead, the schedule enquiry lead, and the Checkout→pass loop all succeed, or describe the failing step.</resume-signal>
</task>

<task type="auto">
  <name>Task 1: Record the E2E results document</name>
  <files>.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md</files>
  <read_first>
    - The checkpoint observations above (the executor records what was actually seen during the human-verify walk)
    - .planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md — to frame the results against the GHL-replacement goal
  </read_first>
  <action>
Write `.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md` capturing the
checkpoint walk. Include:
- A header with date + the services-under-test (staff-web build, worker, Stripe mode).
- **Part A — embedded form lead:** PASS/FAIL, the form slug, the created member id + conversation
  id, confirmation the phone normalised to E.164, confirmation the `lead:submitted` CustomEvent
  fired on the host page.
- **Part B — schedule enquiry lead:** PASS/FAIL, the occurrenceId carried in form_submissions.data,
  confirmation `enquiry:created` fired.
- **Part C — Checkout → pass:** PASS/FAIL, the Stripe test session id, the granted pass row
  (id, member_id, granted, product_name), confirmation the reducer bound it via metadata.memberId.
- A "GHL replacement" summary line: does the studio now have (1) embeddable lead forms and
  (2) a public schedule + enquiry that both feed /gymos, plus a staff Checkout link that grants
  passes? Yes/No + caveats.
- Any deviations/known-issues for follow-up (e.g. in-memory rate-limit not yet added,
  Turnstile not wired, capacity check deferred to P2).
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md','utf8'); for(const m of ['Part A','Part B','Part C','lead:submitted','enquiry:created']){if(!s.includes(m)){console.error('MISSING '+m);process.exit(1)}} console.log('OK')"</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/P1c-public-site-integrations/P1c-E2E-RESULTS.md` exists
    - Contains Part A, Part B, Part C sections each with a PASS/FAIL marker
    - Contains the strings `lead:submitted` and `enquiry:created`
    - Contains the Stripe test session id and the granted pass row observed in Part C
    - Contains a "GHL replacement" yes/no summary line
    - The verify node script prints `OK`
  </acceptance_criteria>
  <done>
The end-to-end behaviour is recorded with pass/fail per part and concrete ids, closing the phase.
  </done>
</task>

</tasks>

<verification>
- Embedded form submission from a clean cross-origin browser creates a lead in /gymos
- Embedded schedule enquiry creates a lead carrying the occurrenceId
- A test-mode Checkout link → paid → pass granted + bound to the member (P1b-07)
- Results recorded in P1c-E2E-RESULTS.md
</verification>

<success_criteria>
1. The full visitor → lead → Checkout → pass loop works on running services (EMBED-06)
2. Both embed surfaces (form + schedule) feed /gymos leads
3. The GHL-replacement claim is demonstrated and recorded
</success_criteria>

<output>
P1c-E2E-RESULTS.md is the output. After it is written, create
`.planning/phases/P1c-public-site-integrations/P1c-07-e2e-smoke-test-SUMMARY.md` noting the
overall pass/fail, the requirement IDs verified (FORMS-01..04, EMBED-01..06), and any deferred
follow-ups.
</output>
