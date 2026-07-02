---
phase: quick-260702-dzx
plan: 01
subsystem: mobile-app
tags: [mobile, calorie-counter, ux, photo-first]
key-files:
  modified:
    - packages/mobile-app/app/(tabs)/food.tsx
    - packages/mobile-app/app/food-ai.tsx
    - packages/mobile-app/app/_layout.tsx
decisions:
  - "Use Feather 'maximize-2' for Scan barcode to visually distinguish it from the primary camera CTA"
  - "Give the Take Photo button accent styling (same as primary CTA) to reinforce the photo-first intent once user is already inside food-ai"
  - "Single atomic commit — both tasks are tightly coupled (food.tsx drives to food-ai with capture param; food-ai reads it)"
metrics:
  duration: ~10 minutes
  completed: 2026-07-02
  tasks: 2
  files: 3
---

# Phase quick-260702-dzx Plan 01: Photo-first calorie counter add-food flow

**One-liner:** Reordered the Food tab add-food sheet so a large accent 'Snap a meal' button leads (routes to `/food-ai?capture=1`), while Search and Scan barcode are demoted under a 'More ways to add' sub-header; the AI estimate screen now auto-opens the camera when reached from that primary CTA.

## Commit

| Hash | Message |
|------|---------|
| `d1a4c024` | `feat(quick-260702-dzx): photo-first calorie counter add-food flow` |

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 1 | Photo-first add-food chooser in food.tsx | Done |
| 2 | Photo-first food-ai input + register the route | Done |

## What Changed

### food.tsx
- Added `primaryOption` / `primaryOptionText` / `subLabel` styles to the theme-derived StyleSheet.
- Sheet now renders: title "Add food" → large accent "Snap a meal" Pressable (Feather "camera", accent background) → `router.push("/food-ai?capture=1")` → muted "More ways to add" sub-label → "Search" row → "Scan barcode" row (Feather "maximize-2" to distinguish from the camera CTA).
- Barcode and Search entries retained — just demoted, same `onPress` shape as before.

### food-ai.tsx
- Added `useLocalSearchParams` import from expo-router.
- Reads `params.capture` immediately before hook declarations; initialises `showCamera` state as `params.capture === "1"` so the camera opens on mount when arriving from the primary CTA.
- Reordered input-mode JSX: photo block first ("Snap your meal" label, accent-styled "Take photo" button), description TextInput second ("Or describe it" label, `autoFocus` removed).
- Camera button now uses `theme.colors.accent` background and `theme.colors.accentForeground` text/icon — consistent with primary CTA weight.
- All logging paths (AI estimate → `/api/m/foods/analyze` → `/api/m/food-entries`) untouched.

### _layout.tsx
- Added `<Stack.Screen name="food-ai" options={{ title: "Snap a meal", headerShown: true, presentation: "modal" }} />` alongside `food-add` and `food-barcode` registrations — eliminates the raw "food-ai" fallback header.

## Verification

- `cd packages/mobile-app && npx tsc --noEmit` — **clean, zero errors**.
- Barcode and text-search remain reachable from their demoted rows; both still `router.push("/food-barcode")` and `router.push("/food-add")` unchanged.
- AI estimate flow (`handleEstimate` → `handleLog`) untouched; all three log paths still POST to `/api/m/food-entries`.
- No changes outside `packages/mobile-app`; no backend, schema, or new deps touched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `packages/mobile-app/app/(tabs)/food.tsx` — modified, committed in `d1a4c024`.
- `packages/mobile-app/app/food-ai.tsx` — modified, committed in `d1a4c024`.
- `packages/mobile-app/app/_layout.tsx` — modified, committed in `d1a4c024`.
- Commit `d1a4c024` confirmed present in `git log`.
- `npx tsc --noEmit` produced no output (clean).
