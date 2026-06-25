# Spec — Wearable Health & Sleep Integration (Apple Watch + Garmin)

**Status:** Draft spec (not started) · **Author:** session 2026-06-25 · **Owner:** Patrick

Integrate member wearable health + sleep data into RunStudio/Hustle. Two providers
with **fundamentally different architectures**: Apple Watch via on-device HealthKit
(client-side, in the member app) and Garmin via the Garmin Health API (server-side
push to our webhook). Apple Watch ships first; Garmin is a fast-follow gated on a
partnership approval.

## 1. Scope (decided 2026-06-25)

- **Consumers (all four):**
  1. **Members** see their own sleep / recovery / activity in the member app.
  2. **Coaches** see member sleep / recovery / training load in the staff app (member profile) to program training and spot overtraining / disengagement.
  3. **Calorie counter** uses active-energy burn to adjust daily calorie/macro targets.
  4. **Outreach triggers** — poor sleep / low recovery / inactivity streak flags a coach WhatsApp check-in via the existing proposal → worker pipeline.
- **Providers:** **Apple Watch / Apple Health first**, **Garmin fast-follow**.
- **Data scope:** everything each platform exposes (sleep stages, HR, HRV, resting HR, steps, active energy, workouts, stress, body battery/readiness, SpO2, respiration, VO2max).
- **Out of scope (v1):** Android (Google Health Connect) — note as fast-follow #2; Fitbit/Whoop/Oura — later if demand.

## 2. Architecture — two paths, one normalized store

```
APPLE WATCH (client-side)                 GARMIN (server-side push)
 Apple Watch → iPhone HealthKit            Garmin device → Garmin Connect cloud
        │ (member app reads via                     │ (Garmin POSTs full payload
        │  HealthKit, needs dev client)             │  per data type on each sync)
        ▼                                           ▼
 POST /api/m/health/ingest  ──┐         apps/edge-webhooks (Fly)  /webhooks/garmin/*
                              │                     │ verify sig + enqueue (pg-boss)
                              │                     ▼
                              │            apps/worker (Fly) — normalize reducer
                              ▼                     ▼
            ┌──────────────────────────────────────────────┐
            │  Unified health tables (Neon, single-tenant)  │
            │  health_connections / _sleep / _activities /  │
            │  _daily / _samples                            │
            └──────────────────────────────────────────────┘
                              │
        ┌─────────────┬───────┴────────┬──────────────────┐
        ▼             ▼                ▼                  ▼
  Member app     Coach view       Calorie targets    Outreach triggers
  (own data)   (staff-web)        (TDEE adjust)      (propose-action → worker)
```

Key reuse: **Garmin's push model is the existing integration-webhook queue pattern** — `edge-webhooks` verifies + enqueues, returns 200 fast, worker reduces idempotently (same discipline as Stripe webhooks). Apple ingests through a new member API route. Both write the **same** normalized tables so every consumer is provider-agnostic.

## 3. Phasing

### Phase H1 — Apple Watch / HealthKit (member-readable) — *ships first*
**Depends on:** the EAS **dev-client build** (HealthKit is a custom native module; not Expo Go) — i.e. the iOS account work in `packages/mobile-app/IOS-EAS-RUNBOOK.md`. This phase cannot ship until that build path exists.
- Library: **`@kingstinct/react-native-healthkit`** (TS-first, maintained) or `react-native-health` (agencyenterprise). Decide at plan time; both need the dev client + an Expo config plugin.
- `app.json`: add the HealthKit entitlement + `NSHealthShareUsageDescription` (and `NSHealthUpdateUsageDescription` if we ever write back) via the config plugin.
- **Permissions:** request read for sleep, HR, HRV, resting HR, steps, active/basal energy, workouts, VO2max, respiratory rate, SpO2.
- **Sync:** `HKObserverQuery` + HealthKit **background delivery** so data syncs without the app open; on change, batch-POST deltas to `POST /api/m/health/ingest`.
- **Member surface:** a "Health" tab in `packages/mobile-app` — connect prompt → sleep last night (stages), recovery (HRV/resting HR trend), today's activity.

### Phase H2 — Garmin Health API (server-side) — *fast-follow, START APPLICATION NOW*
**Long pole = approval.** The Garmin Health API needs a **partnership application** (vetted: use case, retention, security); access begins at an **Evaluation Tier (~15 test users)** before production. **Submit this application at the start of H1** — it gates H2 and is outside our control.
- **Auth:** Garmin OAuth — member authorizes from the member app (deep link out / web view), tokens stored in `health_connections`.
- **Ingest:** register callback URLs per summary type. Garmin **POSTs the full payload** to `apps/edge-webhooks` (`/webhooks/garmin/<type>`); verify signature, enqueue to pg-boss, return 200. Worker normalizes into the unified tables. **Idempotent** (dedupe on Garmin summary id + member) — same care as Stripe.
- Summary types: dailies, sleep, epochs, activities, stress, HRV, body composition, pulse-ox, respiration, user metrics (VO2max).

### Phase H3 — Consumers (built incrementally, can overlap H1/H2)
- **Coach view:** member health context card in the staff-web member profile (sleep trend, recovery, 7-day load). Gated behind member consent + coach role.
- **Calorie counter:** map Apple "active energy burned" / Garmin "active kilocalories" into a daily TDEE adjustment that nudges the member's calorie/macro targets (extends the existing `/api/m/profile` targets model).
- **Outreach triggers:** a worker job evaluates rules (e.g. recovery < X for N days, sleep debt, inactivity streak) → `propose-action` a coach WhatsApp check-in. **Sends still route through the existing worker chokepoint** (opt-in + 24h window + approved template gates unchanged).

## 4. Data model (additive, single-tenant gym tables — `// guard:allow-unscoped`)

- `health_connections` — id, member_id, provider ('apple'|'garmin'), status, scopes/consent, oauth tokens (Garmin only; encrypted), connected_at, revoked_at.
- `health_sleep` — id, member_id, provider, source_id, start/end, total + per-stage minutes (awake/light|core/deep/rem), efficiency, resting_hr, hrv. Unique (provider, source_id).
- `health_activities` — workouts: type, start/end, duration, distance, active_kcal, avg/max HR, source_id.
- `health_daily` — per member per day: steps, active_kcal, resting_hr, hrv, stress avg, body_battery/readiness, spo2, respiration, vo2max.
- `health_samples` (optional) — high-resolution HR/HRV series if we need charts; otherwise skip to control storage.

All additive migrations (new tables only, never rename/drop). Tokens encrypted at rest; never store raw card-style secrets in plaintext.

## 5. Consent & privacy (do not skip)

- Wearable health data is **UK GDPR Article 9 special-category data** → requires **explicit, granular, revocable consent** per member, separate from the existing marketing/WhatsApp opt-ins. (Not US HIPAA/PHI, but treat with equivalent care.)
- Apple: HealthKit's own on-device permission prompts are the consent gate; we still record an app-level consent row.
- Garmin: OAuth authorization is the consent gate.
- Coach visibility is **opt-in** — a member must consent to share with staff; revocation hides it immediately and stops outreach use.
- Storage minimization: only pull scopes we use; document a retention policy; a DPA/privacy-notice update ships with the feature.
- Outreach: never trigger a send from health data without that member's consent + the standard compliance gates.

## 6. Reuse map (what already exists)

| Need | Existing piece |
|------|----------------|
| Garmin push receiver | `apps/edge-webhooks` (Fly, Hono) — add `/webhooks/garmin/*` |
| Async normalize/idempotency | `apps/worker` + pg-boss (same pattern as Stripe reducers) |
| Member data API | `/api/m/*` (add `/api/m/health/*`), `requireDemoMember` gate |
| Member app shell | `packages/mobile-app` (Expo) — add Health tab |
| Coach surfaces | staff-web member profile + the proposal/one-click model |
| Outreach chokepoint | `propose-action` → worker WhatsApp sender (gates intact) |
| Calorie targets | `/api/m/profile` macro-target model |

## 7. Risks / open decisions

- **Garmin approval timeline is the critical path** — apply at H1 start; H2 slips if approval is slow. (Aggregators like Terra/ROOK/Spike/Thryve could shortcut Garmin via one API if direct approval stalls — evaluate as a fallback; adds a vendor + cost.)
- **HealthKit background-delivery reliability** — iOS throttles; expect best-effort, not real-time. Design for eventual sync + on-open refresh.
- **Android members** — Google Health Connect is the equivalent path; fast-follow #2 (also needs the dev client / native module).
- **Storage volume** — `health_samples` high-res series can balloon; default to summaries, add samples only where a chart needs them.
- **Library choice** for HealthKit (kingstinct vs agencyenterprise) — decide at plan time.

## 8. Suggested sequencing

1. **Now:** submit the Garmin Health API partnership application (long pole). Decide HealthKit library.
2. **H1 (after the EAS dev-client build exists):** HealthKit read + ingest + member Health tab.
3. **H3a:** coach view + calorie TDEE adjustment (provider-agnostic, works off Apple data alone).
4. **H2 (when Garmin approved):** Garmin OAuth + webhook ingest into the same tables — all consumers light up for Garmin users for free.
5. **H3b:** outreach triggers.

> Build path: when approved to implement, run `/gsd:new-milestone` (or `/gsd:plan-phase` per phase) — this is milestone-sized, not a quick task.
