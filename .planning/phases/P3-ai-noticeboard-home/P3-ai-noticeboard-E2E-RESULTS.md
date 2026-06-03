# P3 AI Noticeboard — E2E Smoke Test Results

**Phase:** P3-ai-noticeboard-home  
**Plan:** 07-e2e-smoke  
**Date:** 2026-06-03  
**Live deploy:** https://gym-class-os.vercel.app  
**Neon project:** gymos-demo (id `billowing-sun-51091059`)  
**Status:** PARTIAL — autonomous pre-checks done; live walkthrough PENDING push+deploy

---

## Success Criteria Results

| SC | Description | Status | Evidence |
|----|-------------|--------|----------|
| SC-1 | Noticeboard renders 4 cards + AI-today strip + Tasks section on live deploy | PENDING | Requires push→deploy→human walk |
| SC-2 | Real computed metric subheadings on cards (not placeholders) | PENDING | Requires push→deploy→human walk |
| SC-3 | Agent-authored section note persists in dashboard_notes (survives reload) | PENDING | Requires push→deploy→human walk |
| SC-4 | Agent-created task appears in dashboard_tasks; complete toggle flips status | PENDING | Requires push→deploy→human walk |
| SC-5 | Propose→approve→execute round-trip works AND out-of-window/no-opt-in send lands status='failed' in messages table | PENDING | Requires push→deploy→human walk |
| SC-6 | Agent never claims to have sent autonomously — proposes, coach approves | PENDING | Requires push→deploy→human walk |

---

## Autonomous Pre-Checks (done before deploy)

### 1. Commits present on local master (NOT yet pushed)

All P3 commits confirmed on local master, 39 commits ahead of origin/master:

| Commit | Description |
|--------|-------------|
| `1e687c11` | feat(P3-02): add list-inbox-summary GET action |
| `a474c71d` | feat(P3-02): add upsert-section-note POST action |
| `2e4ae4b2` | feat(P3-02): add create-task and complete-task POST actions |
| `f6074d24` | feat(P3-03): add propose-action |
| `e3bcd0a7` | feat(P3-03): add approve-proposal |
| `c64518f4` | feat(P3-03): add reject-proposal |
| `af8bc7fe` | feat(P3-04): add gymos.inbox.tsx — inbox at /gymos/inbox |
| `04c233a4` | feat(P3-04): replace gymos._index.tsx with noticeboard route |
| `72e0ae98` | feat(P3-04): update GymosTopNav — Home tab, Inbox repointed |
| `81d7944c` | feat(P3-05): add AiTodayStrip + TasksSection components |
| `b823f407` | feat(P3-05): add BoardCard component |
| `b2d78dcd` | feat(P3-05): wire components into noticeboard route |
| `ebd94a6a` | feat(P3-06): rewrite agent system prompt to suggest-and-act posture |
| `974d5bc7` | docs(P3-06): rewrite AGENTS.md to suggest-and-act three-tier posture |
| `b4be291d` | feat(P3-06): update navigate action vocabulary |

**Result: PASS** — all Plans 01–06 implementation commits present.  
**BLOCKER:** master is 39 commits ahead of origin/master. `git push origin master` required before Vercel deploys P3 code.

---

### 2. Neon migration-0005 tables

Queried `information_schema.tables` against gymos-demo (`billowing-sun-51091059`) directly via `@neondatabase/serverless`.

```
Tables found: ['dashboard_notes', 'dashboard_proposals', 'dashboard_tasks']

Constraints on dashboard_notes:
  - dashboard_notes_section_unique (UNIQUE) ✓

Constraints on dashboard_tasks:
  - dashboard_tasks_status_check (CHECK) ✓

Constraints on dashboard_proposals:
  - dashboard_proposals_action_name_check (CHECK) ✓
  - dashboard_proposals_status_check (CHECK) ✓

Current row counts:
  dashboard_notes:     0 rows
  dashboard_tasks:     0 rows
  dashboard_proposals: 0 rows
```

**Result: PASS** — All three migration-0005 tables exist with correct constraints. Tables are empty (expected — no agent has run yet against the live deploy).

---

### 3. No @gymos/whatsapp import in apps/staff-web

Guard script confirmed:

```
[guard] OK: apps/staff-web does not import @gymos/whatsapp
```

Content search on `apps/staff-web/` for `from.*@gymos/whatsapp` found zero actual import statements. Occurrences found are all comments/documentation only:
- `actions/send-template-to-members.ts` — comment: `//     NEVER import @gymos/whatsapp here`
- `app/lib/queue-client.ts` — comment: `// staff-web NEVER imports @gymos/whatsapp`
- `app/routes/gymos.inbox.tsx` — comment: `// ... @gymos/whatsapp`

**Result: PASS** — No actual @gymos/whatsapp import in staff-web.

---

### 4. tsc --noEmit clean

```
cd apps/staff-web && npx tsc --noEmit
(no output — exit 0)
```

**Result: PASS** — TypeScript compilation clean.

---

### 5. Security invariant — gate chain code trace

The propose→approve→execute path was traced through the code:

```
propose-action (staff-web/actions/propose-action.ts)
  -> INSERT dashboard_proposals (status='pending')

approve-proposal (staff-web/actions/approve-proposal.ts)
  -> SELECT WHERE id=? AND status='pending'
  -> ACTION_ALLOWLIST check: ['send-template-to-members', 'create-checkout-link']
  -> JSON.parse(paramsJson)
  -> dynamic import of target action module
  -> mod.default.schema.safeParse(rawParams)   ← re-validation
  -> mod.default.run(parsed.data)              ← calls send-template-to-members

send-template-to-members (staff-web/actions/send-template-to-members.ts)
  -> template pre-gate: check whatsapp_templates.status='approved' (returns error if not)
  -> per member: INSERT messages (status='queued')
  -> enqueueOutboundWhatsApp (pg-boss job)
  *** NO @gymos/whatsapp call here ***

outbound-whatsapp queue handler (services/worker/src/queues/outbound-whatsapp.ts)
  -> calls sendMessage()

sendMessage() (services/worker/src/domain/sendMessage.ts)
  -> Gate 1: hasOptIn(memberId) — throws NoOptInError if NOT opted in
             → errorCode = 'NO_OPT_IN' written to messages.status='failed'
  -> Gate 2: isInWindow(lastInboundAt) — throws WindowExpiredError for free-text >24h
             → errorCode = 'WINDOW_EXPIRED' written to messages.status='failed'
  -> Gate 3: isTemplateApproved(name) — throws TemplateNotApprovedError if pending/rejected
             → errorCode = 'TEMPLATE_NOT_APPROVED' written to messages.status='failed'
  -> Only if all gates pass: calls @gymos/whatsapp sendText/sendTemplate
```

**Gate-proof state in gymos-demo Neon:**

```
whatsapp_opt_in rows: 0 (no members are opted in)
gym_members rows: 1 (Patrick Ross, +447848795221)
members with NO opt-in row: 1

conversations with last_inbound_at set: 0
conversations older than 24h: 0 (no conversations have last_inbound_at at all)
```

**Implication:** The existing member (Patrick Ross) has NO opt-in row. Any proposal targeting him would go through approve-proposal → send-template-to-members → enqueueOutboundWhatsApp → worker sendMessage() → Gate 1 (hasOptIn) → throw NoOptInError → messages.status='failed' / errorCode='NO_OPT_IN'. The gate holds.

**Result: PASS (code-level)** — The security invariant is proven by construction:
1. No @gymos/whatsapp in staff-web (guard confirmed above)
2. approve-proposal only calls two allowlisted actions, both of which route through pg-boss/worker
3. worker sendMessage() enforces opt-in BEFORE any Meta call (Gate 1 throws before Meta is called)
4. The outbound-whatsapp handler catches gate errors and writes status='failed' with typed errorCode

Runtime verification against the live deploy (confirming messages.error_code='NO_OPT_IN' in Neon after an approve) is the SC-5 live check — awaiting push→deploy.

---

### 6. whatsapp_templates state

```
hello_world:       status='approved' (the only approved template)
class_reminder:    status='pending'
waitlist_offer:    status='pending'
payment_failed:    status='pending'
pass_expiring:     status='pending'
```

The live walkthrough should use `hello_world` as the template for the propose→approve→execute test (SC-5 step 1).

---

## Live Walkthrough Results (PENDING)

### Task 1 — Board render + agent authoring (SC-1..SC-4)

| Check | Result | Notes |
|-------|--------|-------|
| /gymos renders noticeboard layout | PENDING | |
| AI-today strip visible at top | PENDING | |
| 4-card grid renders (Inbox/Schedule/Members/Revenue) | PENDING | |
| Tasks section renders at bottom | PENDING | |
| GymosTopNav shows Home + Inbox tabs | PENDING | |
| Inbox card metric shows real unread/open numbers | PENDING | |
| Members card subheading shows real count | PENDING | |
| Revenue card shows MRR | PENDING | |
| Agent call: upsert-section-note (section=members) | PENDING | |
| Note appears on Members card | PENDING | |
| Note persists after reload | PENDING | |
| dashboard_notes Neon row confirmed | PENDING | |
| Agent call: create-task (high priority) | PENDING | |
| Task appears in Tasks section with red strip | PENDING | |
| Complete toggle marks task done + disappears on reload | PENDING | |
| dashboard_tasks Neon row status='completed' confirmed | PENDING | |

**Resume signal:** `board-verified`

---

### Task 2 — Propose→approve→execute + gate proof (SC-5, SC-6)

| Check | Result | Notes |
|-------|--------|-------|
| Agent calls propose-action (actionName=send-template-to-members, hello_world) | PENDING | |
| Pending proposal appears in noticeboard proposal zone | PENDING | |
| AlertDialog opens on Approve click | PENDING | |
| AlertDialog title: "Send [N] WhatsApp messages?" | PENDING | |
| AlertDialog body mentions template name + worker gate caveat | PENDING | |
| "Send messages" click → proposal zone loading then disappears | PENDING | |
| Toast "Sent to [N] members." appears | PENDING | |
| dashboard_proposals.status='executed' in Neon | PENDING | |
| messages rows enqueued (status='queued') in Neon | PENDING | |
| GATE PROOF: Patrick Ross (no opt-in) message lands status='failed' / errorCode='NO_OPT_IN' | PENDING | |
| Dismiss test: second proposal → Dismiss → status='rejected' in Neon | PENDING | |
| SC-6: agent never claims to have sent itself (chat transcript) | PENDING | |

**Resume signal:** `e2e-passed`

---

## Cleanup Tracker

Test rows to clean up after the live walkthrough:
- Any `dashboard_notes` rows inserted during smoke (section='members' note used for SC-3)
- Any `dashboard_tasks` rows inserted during smoke (task used for SC-4)
- Any `dashboard_proposals` rows inserted during smoke (test proposals for SC-5 + dismiss test)
- Any `messages` rows inserted during smoke (the queued/failed messages for SC-5 gate proof)
- Any `conversations` rows created by send-template-to-members during smoke

**Note:** Per Task 2 instructions, leave smoke-only test rows cleaned up. Real productive notes/tasks that persist are fine.

---

## Known Pre-Deploy Issues

None. All autonomous checks passed.
