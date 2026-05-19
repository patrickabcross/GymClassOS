# Phase D2: Member Mobile App + Calorie Counter + Agent — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `D2-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** D2-member-mobile-app-calorie-counter-agent-days-4-7
**Areas discussed:** Mobile shell + native-vs-WebView; Member auth demo flow; Calorie counter UX flow; Agent chat surface placement

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Mobile shell + native-vs-WebView | Where the member app lives + native screens vs WebView wrapper | ✓ |
| Member auth demo flow | How the customer demos "log in as a member" | ✓ |
| Calorie counter UX flow | Today + modal vs single-screen vs tabbed | ✓ |
| Agent chat surface placement | FAB → bottom-sheet vs dedicated tab vs home-screen card | ✓ |

**User's selection:** All four areas

---

## Mobile shell + native-vs-WebView

| Option | Description | Selected |
|--------|-------------|----------|
| Edit `packages/mobile-app` in-place — native screens | Reuse Expo skeleton, rip out `(tabs)/` content, build native GymOS screens with `expo-camera`, native gestures | ✓ |
| Edit `packages/mobile-app` in-place — WebView wrapper | Reuse `AppWebView` pointing at `/gymos/m/*` mobile-optimized routes; barcode unreliable on iOS WebKit | |
| Fresh fork to `apps/member-app/` | Clean break with `expo init`; costs ~half a day of scaffolding | |

**User's choice:** In-place native
**Notes:** Decisive. Matches the D0 "fork-boundary loosened for demo" precedent. Note for the planner: even though we're editing in-place, we strip the upstream `(tabs)/` content entirely rather than coexisting with it — see D-02 in CONTEXT.md.

---

## Member auth demo flow

| Option | Description | Selected |
|--------|-------------|----------|
| Member-picker dropdown | List the 5 seeded members on first launch; tap to "sign in"; persist to AsyncStorage | ✓ |
| Stubbed magic-link with dev tray | Email field → dev tray shows the magic-link URL → tap to sign in | |
| WhatsApp OTP stub | Phone number → dev tray shows 6-digit code → enter | |

**User's choice:** Member-picker dropdown
**Notes:** Customer-friendly demo — operator can swap personas live. P1a (MEMAUTH-02..04) ships the real WhatsApp magic-link.

---

## Calorie counter UX flow

| Option | Description | Selected |
|--------|-------------|----------|
| Today screen + add-food modal | Default = Today with target ring, macro line, meal sections; one big "+ Add" opens modal with Search/Scan | ✓ |
| Single combined screen | Everything visible on one screen — search bar, totals, log list | |
| Tabbed sub-views | Top tabs: Today / Search / Scan / History | |

**User's choice:** Today + modal
**Notes:** Closest to MyFitnessPal / Cronometer mental model. Note for planner: meal-type sections (CAL-08) and target ring (CAL-06) are P-tagged for production — D2 ships them visually with hardcoded targets and a single user-picked meal type per add (D-09, D-10).

---

## Agent chat surface placement

| Option | Description | Selected |
|--------|-------------|----------|
| Persistent FAB → bottom-sheet | Floating button (message-circle icon) on every screen; opens bottom-sheet ~2/3 viewport | ✓ |
| Dedicated bottom-tab | Agent is its own tab; full-screen chat | |
| Home-screen embedded card | No FAB; "Ask your coach" card on Today screen expands inline | |

**User's choice:** Persistent FAB → bottom-sheet
**Notes:** Sells the differentiator — agent feels omnipresent. Underlying screen remains partially visible behind the dim scrim. Close via X / swipe-down / tap scrim.

---

## "Any more gray areas?" final check

| Option | Description | Selected |
|--------|-------------|----------|
| Ready for CONTEXT.md | Write context with 4 decisions + carry-forward + Claude's discretion | ✓ |
| One more: WA-01/02 demo path | Discuss real vs mock vs seeded for the WhatsApp end-to-end demo | |
| One more: Schedule view density | Week-grid vs day-by-day vs flat list for the member schedule | |

**User's choice:** Ready for CONTEXT.md
**Notes:** WA-01/02 demo path and schedule view density both moved to Claude's Discretion in CONTEXT.md.

---

## Claude's Discretion

Areas the user explicitly declined to discuss (defaults applied in CONTEXT.md):

- Schedule view density (default: week-grid mirrored from staff schedule, mobile-tuned vertical scroll)
- WA-01/WA-02 demo path (default: Fly Hono webhook receiver + direct Meta Graph API call from staff inbox action)
- App branding (default: name = "GymOS", placeholder icon, primary colour matching inbox surface)
- Agent system prompt wording
- Camera permission UX
- Booking flow UX detail (default: inline-expand under occurrence card)
- Offline / empty / error states

## Deferred Ideas

See `<deferred>` section in `D2-CONTEXT.md` — 23 items captured.
