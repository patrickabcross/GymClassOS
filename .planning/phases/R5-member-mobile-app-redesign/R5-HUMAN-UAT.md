---
status: partial
phase: R5-member-mobile-app-redesign
source: [R5-VERIFICATION.md]
started: 2026-06-13T00:00:00Z
updated: 2026-06-13T00:00:00Z
---

## Current Test

[awaiting human testing — BLOCKED until an EAS dev/preview build exists. App Store Expo Go is SDK 56, this app is SDK 55, and `/api/m/*` is 401-gated on the deploy (per R1-03). Real-device UAT requires the master-branch EAS workstream to produce a build + un-gate `/api/m/*`.]

## Tests

### 1. Dark-first theme + Inter (MOBL-01, MOBL-03, MOBL-07)
expected: App opens in a high-contrast dark theme (near-black `#0A0A0B` surfaces, orange accent). Text renders in Inter (loaded via useFonts). `EXPO_PUBLIC_STUDIO_SKIN=hustle` at EAS build time selects the Hustle placeholder skin.
result: [pending]

### 2. Bottom tabs (MOBL-02)
expected: Five tabs in order — Home / Classes / Passes / Log / Profile. Passes is a new tab showing pass balance + history.
result: [pending]

### 3. Home hero (MOBL-04)
expected: Home tab shows next class, pass balance, and latest coach message as prominent hero cards (graceful empty states when data is unavailable).
result: [pending]

### 4. Coach-voice noticeboard (MOBL-06)
expected: Updates framed as "From your coach" / "Studio updates" — not a generic notification feed.
result: [pending]

### 5. Booking flow (MOBL-05)
expected: Booking completes in ≤3 steps (select → confirm with pass/drop-in choice → done) with a persistent pass-balance pill visible throughout. Optimistic "booked" state.
result: [pending]

### 6. Visual consistency (MOBL-01)
expected: No stray blue accents (old `#3b82f6` fully replaced with orange); agent chat sheet + barcode scanner match the dark theme.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 6

## Gaps

- **`lib/bottom-sheet-impl.ts`** retains 2 bare hex (`#1a1a1a`, `#333`) on the @gorhom bottom-sheet handle indicator — pre-R5 file, outside the R5 hex inventory, visually fine in dark theme. Recommended follow-on cleanup (low priority); not a code defect.
- Real-device verification of all of the above is deferred to an EAS dev/preview build (master-branch mobile workstream) + un-gating `/api/m/*` on the deploy.
