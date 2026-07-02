---
phase: quick-260702-de6
plan: 01
subsystem: check-in
tags: [kiosk, qr-scan, mobile, attendance, expo-camera]
dependency_graph:
  requires: [mark-booking-attended chokepoint, requireAdmin, requireMember, expo-camera (pre-installed)]
  provides: [/api/m/checkin, /api/m/admin/check-in, /gymos/kiosk, checkin-scan mobile screen]
  affects: [bookings.status (via chokepoint only), schedule query cache, profile query cache]
tech_stack:
  added: [qrcode@^1.5.4, @types/qrcode@^1.5.6]
  patterns: [Nitro wrapper depth table, mark-booking-attended chokepoint caller, requireAdmin/requireMember gates, expo-camera CameraView qr type, optimistic UI + revalidate]
key_files:
  created:
    - apps/staff-web/app/routes/api.m.checkin.tsx
    - apps/staff-web/app/routes/api.m.admin.check-in.tsx
    - apps/staff-web/server/routes/api/m/checkin.post.ts
    - apps/staff-web/server/routes/api/m/admin/check-in.post.ts
    - apps/staff-web/app/routes/gymos.kiosk.tsx
    - packages/mobile-app/app/checkin-scan.tsx
  modified:
    - apps/staff-web/app/components/gymos/GymosTopNav.tsx
    - apps/staff-web/app/components/gymos/GymosNavBridge.tsx
    - apps/staff-web/AGENTS.md
    - apps/staff-web/package.json (qrcode + @types/qrcode added)
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/(tabs)/schedule.tsx
decisions:
  - QR payload is stateless `runstudio-checkin:<occurrenceId>` — no HMAC in v1 (security rests on Bearer identity + server temporal window + booked-check)
  - Temporal window is [-45m, end+15m] — generous for gym-door scanning
  - Admin check-in has NO trainer-ownership check (admin can check in anyone)
  - Mobile scanner ignores non-`runstudio-checkin:` QRs silently (user can keep scanning)
  - `isMember = role === "member"` via fetchRole — teachers/admins use kiosk/roster flows
metrics:
  duration: ~45min
  completed: "2026-07-02"
  tasks: 5
  files: 12
---

# Phase quick-260702-de6 Plan 01: Gym Check-in Kiosk + Member QR Self-Scan Summary

Gym check-in via RunStudio: admin kiosk tablet page with per-class QR + tap roster, and Expo mobile member self-scan, both funneling through the existing `mark-booking-attended` attendance chokepoint.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Member self-check-in + admin check-in endpoints | 56dd188c | api.m.checkin.tsx, api.m.admin.check-in.tsx, 2x Nitro wrappers |
| 2 | Admin kiosk page (qrcode dep + gymos.kiosk.tsx) | 81ec488e | gymos.kiosk.tsx, package.json |
| 3 | Nav exposure — Kiosk tab + NavBridge + AGENTS.md | fdfffb6c | GymosTopNav.tsx, GymosNavBridge.tsx, AGENTS.md |
| 4 | Mobile QR scanner screen | 68e7dbad | checkin-scan.tsx, _layout.tsx |
| 5 | Mobile entry point — schedule tab | 3f4050b9 | schedule.tsx |

## Verification Results

**staff-web tsc:** `cd apps/staff-web && npx tsc --noEmit` — exit 0. Only pre-existing errors remain (mark-booking-attended.ts LibSQL .execute; member-session.test.ts parqCompletedAt). No new errors in any of the 6 new/modified staff-web files.

**Mobile tsc:** `cd packages/mobile-app && npx tsc --noEmit` — exit 0. No typecheck script in package.json; ran tsc directly. Clean pass.

**Single-attendance-writer grep:** `grep -n "status.*=.*'attended'\|status.*=.*\"attended\"" apps/staff-web/app/routes/api.m.checkin.tsx apps/staff-web/app/routes/api.m.admin.check-in.tsx` — only match is `booking.status === "attended"` (a READ compare for idempotency, not a write). PASSED. Both new routes call `mark-booking-attended.run` exclusively.

**No migration files:** `git diff --name-only HEAD~5..HEAD | grep migrations` — nothing. No schema.ts changes. PASSED.

**Nav check:** `grep -q "gymos/kiosk" GymosTopNav.tsx && grep -q "kiosk:" GymosNavBridge.tsx && grep -q "api/m/checkin" AGENTS.md` — PASSED.

**Scanner wired:** `grep -q "runstudio-checkin:" checkin-scan.tsx && grep -q "api/m/checkin" checkin-scan.tsx && grep -q 'barcodeTypes.*\["qr"\]' checkin-scan.tsx && grep -q "checkin-scan" _layout.tsx` — PASSED.

**Entry point wired:** `grep -q "checkin-scan" schedule.tsx && grep -q "fetchRole\|isMember" schedule.tsx` — PASSED.

## Deviations from Plan

None — plan executed exactly as written. All 5 tasks completed, all verification checks passed.

## Known Stubs

None. The kiosk QR is server-generated from a real occurrenceId, the roster queries real bookings, and the mobile scanner POSTs to a real endpoint.

## Self-Check: PASSED

Files confirmed present:
- apps/staff-web/app/routes/api.m.checkin.tsx — FOUND
- apps/staff-web/app/routes/api.m.admin.check-in.tsx — FOUND
- apps/staff-web/server/routes/api/m/checkin.post.ts — FOUND
- apps/staff-web/server/routes/api/m/admin/check-in.post.ts — FOUND
- apps/staff-web/app/routes/gymos.kiosk.tsx — FOUND
- packages/mobile-app/app/checkin-scan.tsx — FOUND

Commits confirmed: 56dd188c, 81ec488e, fdfffb6c, 68e7dbad, 3f4050b9 — all present in git log.
