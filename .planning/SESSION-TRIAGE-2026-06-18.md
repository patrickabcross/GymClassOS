# Session Triage — 2026-06-18

Demo went well (form + WhatsApp; mobile not needed). Snapshot for post-context-clear triage.

## ✅ Shipped & live (on `master`, pushed to origin, deployed on Vercel `gym-class-os`)

1. **`/preview/{slug}` public form route** — alias of the existing `/f/{slug}` SSR renderer (whitelisted in CORS + auth). Demo URL: `https://gym-class-os.vercel.app/preview/schedule-enquiry`. _(quick 260618-ezc)_
2. **Form → WhatsApp auto-reply** — on submit (with a phone), the handler creates a `whatsapp_opt_in` (source `form_submission`), AI-fills the approved **`form_response`** template's vars from the form submission + active class catalog (`features/forms/lib/lead-ack.ts`), and enqueues the send through the worker chokepoint. Env **`LEAD_ACK_TEMPLATE_NAME=form_response` set on Vercel prod**. Self-skips if no phone / template not approved. _(quick 260618-ezc + 260618-fqg)_
3. **HOTFIX — lead upsert no longer 500s** on phone/email cross-key collision (`92cd3b6a`). Was: single `ON CONFLICT (email)` upsert that also wrote `phone_e164`, violating the separate phone unique index when the phone already belonged to another member → unhandled 500. Now: explicit lookups on both keys, reconcile to one member. Verified live (collision case → 200).

## 🗺️ v1.2 milestone planned — NOT started

- **"Agentic Tab Editing"** — agent can EDIT each tab, not just read. 3 phases: **AE1 Forms · AE2 Schedule · AE3 Members**. 18 reqs (AEF/AES/AEM/AEX). Research + REQUIREMENTS + ROADMAP committed (`5186a54e`, `50b90c74`, `de9a1491`). Fully additive, zero new deps, `gym_members.notes` confirmed present.
- **Next:** `/gsd:plan-phase AE1`.

## 🔧 Half-done — NEEDS FINISHING

- **New Class (quick 260618-j8z):** the two `defineAction`s **`create-class-definition` + `create-class-occurrence` ARE committed** (`95e1f0da`), BUT:
  - ❌ no UI (New Class button + dialog on `/gymos/schedule`)
  - ❌ not documented in `apps/staff-web/AGENTS.md`
  - ⚠️ `.generated` actions registry needs a rebuild (deploy) for them to resolve
  - PLAN at `.planning/quick/260618-j8z-.../260618-j8z-PLAN.md`
  - **Decide:** finish the UI as this quick task, OR fold the UI into v1.2 AE2 (the actions are the single source of truth either way).

## 🧭 Candidate / not yet scoped

- **Campaigns custom segment builder** — filter members by # classes attended / recency of last attendance / inquiry date. Today campaigns have ONE fixed "at-risk" segment ("Custom segment builder: DEFERRED" in `gymos.campaigns.tsx`). The data already exists. Candidate **v1.2 AE4 (Campaigns)** or a follow-up.
- **Live mobile demo** — not possible today: `/api/m/*` hard-401s in prod (`requireDemoMember` blocks on `NODE_ENV==='production'`), Expo Go SDK mismatch (app SDK 55 vs store 56), local API can't boot (Nitro/Vite bug). To enable: a **non-prod demo deploy** with the member demo-gate relaxed (honor explicit `DEMO_MODE` off-prod) + an EAS or web build pointed at it via `EXPO_PUBLIC_API_BASE`. Captured screens live in `.planning/ui-reviews/baseline/mobile/` (pre-redesign).

## ✔️ Verify / loose ends

- Confirm a real form submission delivered a WhatsApp end-to-end during normal use (pipeline verified via synthetic test; confirm with one real lead to your own number — works with any email/phone combo now).
- Untracked planning docs (260618-ezc PLAN, 260618-j8z PLAN) committed this session for preservation.
