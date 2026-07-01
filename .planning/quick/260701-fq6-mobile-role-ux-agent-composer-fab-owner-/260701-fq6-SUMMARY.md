---
phase: quick-260701-fq6
plan: 01
subsystem: packages/mobile-app
tags: [mobile, expo, role-ux, agent-sheet, keyboard, bottom-sheet]
dependency_graph:
  requires: [MA3-03, MA4-03]
  provides: [MOBILE-ROLE-UX, AGENT-COMPOSER-FIX]
  affects: [packages/mobile-app/app/_layout.tsx, packages/mobile-app/app/(tabs)/_layout.tsx, packages/mobile-app/components/AgentSheet.tsx, packages/mobile-app/lib/bottom-sheet-impl.ts]
tech_stack:
  added: []
  patterns:
    - BottomSheetFlatList + BottomSheetTextInput for keyboard-aware lists inside gorhom bottom sheets
    - useSafeAreaInsets for home-indicator-safe composer bottom padding
    - href:undefined (always-visible) vs href:isTeacher?undefined:null (additive tab) pattern
key_files:
  created: []
  modified:
    - packages/mobile-app/app/_layout.tsx
    - packages/mobile-app/app/(tabs)/_layout.tsx
    - packages/mobile-app/components/AgentSheet.tsx
    - packages/mobile-app/lib/bottom-sheet-impl.ts
decisions:
  - "FAB gate changed from `role !== member && !isAdmin` to `!isAdmin` — members + teachers see no FAB; future role-specific chatbots are a separate task"
  - "Member tabs (Home/Classes/Passes/Log) now use href:undefined so all roles (member, teacher, admin) see the full 5-tab set"
  - "BottomSheetFlatList + BottomSheetTextInput replace RN FlatList + TextInput to fix composer visibility clipping inside gorhom bottom sheet"
  - "snapPoints raised from 66% to 90% so composer + keyboard both fit in the visible area"
  - "Safe-area bottom padding (12 + insets.bottom) on inputRow clears iPhone home indicator"
metrics:
  duration: "~8 min"
  completed: "2026-07-01T10:26:00Z"
  tasks: 3
  files: 4
---

# Phase quick-260701-fq6 Plan 01: Mobile Role UX + Agent Composer FAB Owner Summary

**One-liner:** Admin-only FAB gate + all-roles member tabs + gorhom BottomSheetFlatList/BottomSheetTextInput composer fix with 90% snap + safe-area padding.

## Objective

Three client-only fixes to the Expo mobile app:
1. Gate the AI chat FAB to owner/admin only (members + teachers no longer see a coach FAB that has no backing yet).
2. Show all 5 member tabs to every role; teacher adds Schedule on top.
3. Fix the AgentSheet reply composer so it stays visible and usable inside the gorhom bottom sheet after a long streamed answer.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Gate FAB to admin-only; member tabs visible for all roles | `8c37fb29` | `app/_layout.tsx`, `app/(tabs)/_layout.tsx` |
| 2 | Rebuild AgentSheet composer on gorhom keyboard-aware components | `402ab116` | `components/AgentSheet.tsx` |
| 3 | Add keyboard props + raise snap point to 90% on bottom sheet | `3819bee3` | `lib/bottom-sheet-impl.ts` |

## Decisions Made

1. **FAB gate: `!isAdmin` only.** Previous gate was `role !== "member" && !isAdmin` — this gave members a coach FAB while hiding it from teachers. The new rule is simpler: only admins get the FAB. Members + teachers see none. The endpoint/title switch by `isAdmin` inside `AgentFabAndSheet` is kept verbatim (the member branch is now dead code but safe and future-proofs a role-specific coach re-add).

2. **Member tabs: `href: undefined` for all roles.** The previous `isMember ? undefined : null` was blocking teachers and admins from reaching the booking, passes, and food-log surfaces they might legitimately need. All roles now see the full 5-tab set; `isMember` var removed entirely.

3. **`BottomSheetFlatList` + `BottomSheetTextInput` drop-in.** The root `KeyboardAvoidingView` was causing the composer to be clipped/unreachable after a long streamed answer because gorhom coordinates its own keyboard avoidance. Replacing the RN primitives with gorhom's keyboard-aware equivalents is the prescribed fix in the gorhom v5 docs.

4. **`snapPoints: ["90%"]`.** Raising from 66% gives the composer and the software keyboard room to coexist in the visible window without the FlatList content being squished off-screen.

5. **`paddingBottom: 12 + insets.bottom`.** Applied inline on the `inputRow` View. The `12` matches the existing `padding: 12` in the inputRow style (so effective bottom padding is doubled, which is intentional — the base padding plus home-indicator clearance). This replaces the removed `KeyboardAvoidingView` bottom avoidance.

## Verification

- `packages/mobile-app npx tsc --noEmit` output before and after changes is **identical**: 4 pre-existing errors (`app.config.ts`, `app/(tabs)/schedule.tsx`, `app/_layout.tsx` line 22, `tsconfig.json`) — zero new errors introduced.
- Manual (on-device, EAS/Apple-gated, deferred): admin sees ops FAB + 5 tabs; member sees 5 tabs, no FAB; teacher sees 5 tabs + Schedule, no FAB; opening AI sheet as admin + long prompt keeps composer visible above keyboard.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all changes are behavioral rewiring of existing patterns, no placeholder data or TODO branches.

## Self-Check: PASSED

- `packages/mobile-app/app/_layout.tsx` — contains `if (!isAdmin) return null;` ✓
- `packages/mobile-app/app/(tabs)/_layout.tsx` — member tabs use `href: undefined`, `isMember` removed, `isTeacher` present ✓
- `packages/mobile-app/components/AgentSheet.tsx` — imports `BottomSheetFlatList`, `BottomSheetTextInput`, `useSafeAreaInsets`; no `KeyboardAvoidingView`; `insets.bottom` in inputRow padding ✓
- `packages/mobile-app/lib/bottom-sheet-impl.ts` — `snapPoints: ["90%"]`, `keyboardBehavior: "interactive"`, `keyboardBlurBehavior: "restore"`, `android_keyboardInputMode: "adjustResize"` ✓
- Commits: `8c37fb29`, `402ab116`, `3819bee3` ✓
