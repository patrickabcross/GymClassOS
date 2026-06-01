---
id: SEED-001
status: dormant
planted: 2026-06-01
planted_during: Production v1 — Phase P1c (Public Site Integrations)
trigger_when: First production EAS build under the customer's Apple Developer Account, OR the moment the customer's app team needs the mobile source
scope: Medium
---

# SEED-001: Extract the customer-facing mobile app into its own home

Move `packages/mobile-app` out of the GymClassOS monorepo into either (a) a
standalone `GymClassOS-mobile` repo or (b) the customer's existing React Native
app repo — whichever matches how the app actually ships at that point.

## Why This Matters

The pull toward a separate repo is **not** code coupling — it's the
distribution/ownership boundary around the app:

- It ships under the **customer's Apple/Google developer accounts**, on a
  different release cadence, with EAS / App Store Connect secrets the web side
  never touches.
- Per project constraints, production mobile is meant to be *updates to the
  customer's existing RN app* — so its eventual home may be **the customer's
  repo**, not a new GymClassOS one. There's a possible **IP hand-off**: you may
  not want to hand the customer's app team the entire monorepo (staff-web,
  worker, edge-webhooks, secrets handling).
- Different toolchain (Expo/RN/EAS) than the web side (Vercel/Fly/Node); the
  monorepo's guards (drizzle-push, template-list, changesets) are noise for RN.

**Do NOT split before v1.** Through v1 the monorepo is the correct home:

- Mobile is tightly **contract-coupled** to the backend — it consumes
  `/api/m/*` (8 routes today) and the **same Drizzle schema/types**. In the
  monorepo a schema change + its mobile consumer move in **one commit**; split
  repos invite API contract drift and version skew.
- `packages/mobile-app` **is an agent-native upstream package** — keeping it in
  the fork preserves any `git merge upstream/main` for mobile framework fixes
  (partly spent — D2-01 already diverged it heavily — but not zero).
- **Solo dev on a 2-month deadline**: a second repo doubles CI, dependency
  management, and release coordination for near-zero payoff before launch.
  Demo runs fine via Expo Go from the monorepo today.
- For the **vertical-SaaS-factory** vision, mobile-in-the-monorepo means each
  vertical's app comes "for free" with the fork; splitting forces assembling two
  repos per vertical.

## When to Surface

**Trigger:** First production EAS build under the customer's Apple Developer
Account, OR the customer's app team needs the mobile source.

Present this seed during `/gsd:new-milestone` when the milestone scope matches
any of:
- Production mobile distribution / App Store / Play Store / EAS production
  builds under the customer's accounts
- Customer hand-off of the mobile codebase, or onboarding the customer's app team
- A second vertical reaching its mobile phase (factory-pattern decision point)

## Scope Estimate

**Medium** — a phase or two. Repo extraction, CI/EAS pipeline setup in the new
home, dependency de-workspacing, and pointing the mobile app at the published
contract package (see prerequisite). Mechanical *if* the prerequisite is done
first; a refactor if it isn't.

## Prerequisite (the cheap insurance)

Complete the **`@gymos/shared-types` contract-package** backlog item first, so
the API/schema seam between mobile and backend is already a **package boundary**
rather than workspace/relative imports + `/api/m/*` convention. With that in
place, extracting mobile is a move-and-rewire, not a rearchitecture. See the
backlog item planted alongside this seed (2026-06-01).

## Breadcrumbs

- `packages/mobile-app/` — the Expo 55 + RN 0.83.9 app (fork of agent-native's
  `packages/mobile-app`); D2-01/03/04/05/06 work lives here
- `packages/mobile-app/lib/api.ts` — `API_BASE` (defaults to `localhost:8081`;
  needs a deployed backend URL for any real-phone build)
- `packages/mobile-app/eas.json`, `packages/mobile-app/app.json` — EAS/Expo config
- `apps/staff-web/app/routes/api.m.*.tsx` — the 8-route `/api/m/*` contract the
  mobile app consumes (agent.stream, bookings, food-entries, foods.barcode,
  foods.search, members.list, profile, schedule)
- `apps/staff-web/server/db/schema.ts` — the Drizzle schema/types the mobile app
  is coupled to
- Memory: `project_gymos_mobile.md` (mobile = Expo fork; demo via Expo Go,
  production via EAS under customer's Apple Dev Account)
- `.planning/phases/D2-member-mobile-app-calorie-counter-agent-days-4-7/` — all
  mobile phase plans + context

## Notes

Planted 2026-06-01 after pushing the WhatsApp-secrets migration. Decision raised
by the user ("I wonder if the customer-facing mobile app might need its own
repository"). Conclusion: right instinct, wrong time — keep in the monorepo
through v1, split at the distribution/ownership trigger above, and do the
`@gymos/shared-types` work first to make the split cheap.
