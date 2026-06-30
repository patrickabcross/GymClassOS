---
phase: MA2-member-booking-surface
verified: 2026-06-30T22:30:00Z
status: human_needed
score: 5/5 must-haves verified (code level); 2 operator/device gates remain (MA2-04)
human_verification:
  - test: "Stripe connected-account product + price-env config (MA2-04 Task 1)"
    expected: "Three products on the CONNECTED account whose descriptions contain drop-in / 5-pack / 10-pack keywords; STRIPE_PRICE_DROP_IN / 5_PACK / 10_PACK set to those connected-account price ids; GET /api/m/purchase (authed) returns all three with non-empty priceId"
    why_human: "Stripe dashboard + Vercel env state are external to the repo; cannot be verified from code. A missing price is PENDING (pass-holders still book), not a phase failure."
  - test: "On-device walkthrough of all 4 success criteria (MA2-04 Task 2)"
    expected: "Anonymous browse → Book wall → sign-in returns to same class → pass-holder books (credit decrements, +1 pass_debits + bookings.pass_id in Neon) → full class shows 'just filled up' → no-pass picker → Stripe Checkout → poll-for-grant → booking completes → Home shows upcoming list"
    why_human: "Requires an EAS dev build on a physical iPhone (Expo Go dead-ends at SDK 54; iOS Simulator needs a Mac) running against the live deploy; booking-transaction replay needs the real Neon DB. Build is code-complete and tsc-clean."
---

# Phase MA2: Member Booking Surface Verification Report

**Phase Goal:** Anyone can open the app and browse the schedule; a member who taps Book is walked from sign-in (if needed) through to a confirmed booking — paying inline via Stripe when they have no active pass — and can see their upcoming bookings and pass balance on a home surface.

**Verified:** 2026-06-30T22:30:00Z
**Status:** human_needed (all code-level must-haves VERIFIED; 2 operator/device gates remain — MA2-04)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Anonymous GET /api/m/schedule returns 200 with items (every isBookedByMe:false), never 401 | ✓ VERIFIED | `api.m.schedule.tsx:23` uses `getOptionalMember` (never throws); Query C guarded by `if (member)` (line 76), `mySet` defaults empty → `isBookedByMe:false` for anon |
| 2 | App entry is open (no force-redirect) AND MA3/MA4 role logic intact | ✓ VERIFIED | `_layout.tsx` AuthGate: no `router.replace("/sign-in")` line; bounce-off-sign-in kept (line 48); `AgentFabAndSheet` retains `isAdmin` Ops FAB (145–147), teacher FAB-hide `role !== "member" && !isAdmin` (105), `teacher-roster` Stack.Screen (217) |
| 3 | POST /api/m/bookings is ONE atomic transaction: lock + capacity (409) + FIFO active-pass (402) + booking with passId + +1 pass_debits, mirroring cancel-occurrence | ✓ VERIFIED | `api.m.bookings.tsx:64` single `db.transaction`; `.for("update")` lock (100); capacity count → CAPACITY_FULL (128); FIFO `expiresAt NULL-or-future` + `ASC NULLS LAST` (147–159); per-pass `COALESCE(SUM)` separate select, no chain-join (164–170); NO_PASS (216); booking insert `passId: picked.id` (191); `+1` debit `reason:'class_booking'` (198–205) — mirror of cancel-occurrence `-1` against same passId |
| 4 | Book-press gates sign-in + stores intent + resumes; optimistic with 402→picker / 409→rollback | ✓ VERIFIED | `schedule.tsx` `handleBookPress` → `getSessionToken` → `setPendingBooking` + `router.push("/sign-in")` (466–478); `useFocusEffect` resume w/ `resumedRef` guard (484–499); `onError` NO_PASS/402 → `startPurchaseFlow`, CAPACITY_FULL/409 → "just filled up" + rollback (346–362) |
| 5 | No-pass → picker → POST purchase → openBrowserAsync → pollForGrant → re-book; success_url web page; 503 degrade | ✓ VERIFIED | `ProductPickerSheet` drop-in/5-pack/10-pack (drop-in highlighted); `handleSelectProduct` POST purchase → `WebBrowser.openBrowserAsync` → `pollForGrant()` → re-POST bookings (381–446); timeout "processing" copy (408); 503 + empty-list "contact the studio" degrade (313–329, 427–432) |
| 6 | /api/m/profile returns additive upcomingBookings[]; Home renders the list | ✓ VERIFIED | `api.m.profile.tsx:75–99` `upcomingList` (member-scoped, booked, future, `limit(10)`); returned alongside preserved singular `upcomingBooking` (129–130); `index.tsx` renders `bookingList` (422), singular fallback preserved (517) |

**Score:** 5/5 must-have truths verified at code level (MEM-01..05)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/staff-web/server/lib/member-session.ts` | getOptionalMember — session-only, no 401, no lazy claim | ✓ VERIFIED | Exported (168); reuses `sessionFromRequest` shim; fast-path claim only, returns null otherwise, never throws |
| `apps/staff-web/app/routes/api.m.bookings.tsx` | Atomic capacity + pass-pick + debit + passId | ✓ VERIFIED | One transaction, all branches present; tsc-clean |
| `apps/staff-web/app/routes/api.m.schedule.tsx` | Anonymous read via getOptionalMember | ✓ VERIFIED | Optional member; member-scoped Query C guarded |
| `apps/staff-web/app/routes/api.m.profile.tsx` | additive upcomingBookings[] | ✓ VERIFIED | Plural list additive; singular preserved |
| `packages/mobile-app/lib/pending-booking.ts` | in-session intent store | ✓ VERIFIED | set/get/clear exported (module var) |
| `packages/mobile-app/lib/purchase-poll.ts` | pollForGrant (2s/30s, baseline-rise) | ✓ VERIFIED | Defaults 2000/30000; baseline clamp; sentinel-safe |
| `packages/mobile-app/components/ProductPickerSheet.tsx` | drop-in/5-pack/10-pack picker | ✓ VERIFIED | Presentational, Feather icons, onSelect/products props |
| `packages/mobile-app/app/(tabs)/schedule.tsx` | gate + optimistic + purchase flow | ✓ VERIFIED | All MEM-02/03/04 branches wired |
| `packages/mobile-app/app/_layout.tsx` | no force-redirect; role logic intact | ✓ VERIFIED | See Truth 2 |
| `packages/mobile-app/app/sign-in.tsx` | return-to-class on pending intent | ✓ VERIFIED | `getPendingBooking()` → `/(tabs)/schedule` in BOTH email + phone-claim success branches (168, 204); PHONE_REQUIRED preserved |
| `packages/mobile-app/app/(tabs)/index.tsx` | Home upcomingBookings[] list | ✓ VERIFIED | List render + singular fallback; Feather only (no Tabler) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| api.m.bookings | passDebits | tx.insert amount:1 reason:'class_booking' passId bookingId | ✓ WIRED |
| api.m.bookings | bookings.passId | insert booking with picked active pass | ✓ WIRED |
| api.m.schedule | getOptionalMember | import + optional resolution | ✓ WIRED |
| schedule.tsx | pending-booking + getSessionToken | no token → setPendingBooking + push('/sign-in') | ✓ WIRED |
| schedule.tsx | pollForGrant | after WebBrowser return, poll then re-POST bookings | ✓ WIRED |
| schedule.tsx onError | ProductPickerSheet / purchase | NO_PASS→picker, CAPACITY→rollback | ✓ WIRED |
| sign-in.tsx | getPendingBooking | route to /(tabs)/schedule on pending | ✓ WIRED |
| index.tsx | profile.upcomingBookings[] | render list | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| schedule.tsx | data.items | GET /api/m/schedule (real Drizzle queries on class_occurrences + bookings) | Yes (DB-backed) | ✓ FLOWING |
| schedule.tsx | products | GET /api/m/purchase — filters PILOT_PRODUCTS by STRIPE_PRICE_* env | Yes when env set; empty→degrade path | ✓ FLOWING (config-gated) |
| index.tsx | upcomingBookings | GET /api/m/profile (DB joins, member-scoped) | Yes (DB-backed) | ✓ FLOWING |
| schedule.tsx pill | passBalance | GET /api/m/profile two-aggregation balance | Yes (DB-backed) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| mobile-app typechecks | `npx tsc --noEmit` (packages/mobile-app) | EXIT 0 — fully clean | ✓ PASS |
| staff-web MA2 files typecheck | `npx tsc --noEmit` filtered | 0 errors in any MA2 file | ✓ PASS |
| /api/m/purchase contract exists | grep loader/action/503/STRIPE_PRICE | GET filters by env, POST returns 503 unconfigured | ✓ PASS |
| Booking transaction replay (real Neon) | n/a | Requires live DB | ? SKIP → MA2-04 device gate |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MEM-01 | 01, 02 | Browse schedule without login | ✓ SATISFIED | getOptionalMember anon branch + AuthGate wall removed |
| MEM-02 | 02, 03 | Book while signed out prompts sign-in (wall at action) | ✓ SATISFIED | handleBookPress gate + pending-booking store + sign-in return |
| MEM-03 | 01, 03 | Member with active pass books via /api/m/bookings | ✓ SATISFIED | Atomic transaction + optimistic client mutation |
| MEM-04 | 03, 04 | No-pass → inline Stripe → grant → booking completes | ✓ SATISFIED (code) / PENDING-on-config (e2e) | Picker → purchase → poll → re-book wired; Stripe operator config is MA2-04 gate |
| MEM-05 | 01, 02 | Home shows upcoming bookings + pass balance | ✓ SATISFIED | upcomingBookings[] additive + Home list + balance pill |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| api.m.bookings.tsx | 100 | `(occQuery as any).for("update")` narrow cast | ℹ️ Info | Intentional + documented — getDb() typed LibSQL at compile time, runtime Neon Postgres; in-txn capacity count is the correctness floor. Not a stub. |
| member-session.ts | 125 | `TODO(MA2+)` ghost-lead row | ℹ️ Info | Pre-existing in requireMember (not MA2-touched logic); out of scope |
| (none) | — | No stub returns, empty handlers, or hardcoded empty data in any MA2 artifact | — | All data flows from real DB queries / real props |

### Human Verification Required

Both items are MA2-04 (the explicitly checkpoint-only, `autonomous: false` plan). They are operator-config and EAS/device-gated, NOT code gaps:

1. **Stripe connected-account config (MA2-04 Task 1)** — Confirm three products with keyword descriptions (drop-in / 5-pack / 10-pack) on the CONNECTED account and STRIPE_PRICE_DROP_IN / 5_PACK / 10_PACK env set to connected-account price ids. `GET /api/m/purchase` should return all three with non-empty priceId. A missing price is PENDING (pass-holders still book) — record "configured" / "partial".

2. **On-device walkthrough (MA2-04 Task 2)** — On an EAS dev build / physical device against the live deploy, exercise: MEM-01 anonymous browse + Book wall; MEM-02 sign-in returns to same class and resumes; MEM-03 pass-holder optimistic book + credit decrement + verify `+1 pass_debits` & `bookings.pass_id` in Neon + full-class "just filled up"; MEM-04 no-pass picker → Stripe Checkout → poll → auto-book (or verify 503/degrade path if Stripe is "partial"); MEM-05 Home upcoming list scoped to the member. Any FAIL feeds `/gsd:plan-phase MA2 --gaps`.

### Gaps Summary

No code gaps. All five must-have truths are verified at the code level: the server booking endpoint is one atomic transaction that mirrors the production-proven cancel-occurrence refund (same passId reconciliation, debit-on-booking not on-purchase); anonymous browse is enabled server-side (getOptionalMember) and client-side (AuthGate wall removed) without disturbing MA3/MA4 role gating; the schedule screen wires the full gate → optimistic → 402-picker → Stripe → poll-for-grant → re-book flow with timeout and 503 graceful degrade; and the additive upcomingBookings[] flows from a member-scoped DB query to the Home list. Constraints honored: zero schema migration, zero new dependency, zero new agent tool (verified against the full diff of all 8 MA2 commits). tsc is fully clean on mobile-app and clean for every MA2 staff-web file (the only 2 remaining staff-web errors are pre-existing in the unmodified MA3 file `actions/mark-booking-attended.ts`, already logged in MA3 deferred-items.md — not MA2 gaps).

The remaining work is exactly MA2-04's two human checkpoints: Stripe operator configuration on the connected account and the on-device walkthrough against the live deploy with real-DB transaction replay. These are external-state and EAS/device gated by design, not buildable code, so the phase status is human_needed rather than gaps_found.

---

_Verified: 2026-06-30T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
