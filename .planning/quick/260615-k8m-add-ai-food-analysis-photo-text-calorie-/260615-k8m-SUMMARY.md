---
phase: quick-260615-k8m
plan: 01
subsystem: calorie-counter / member-mobile
tags: [ai, food, calorie, mobile, claude, vision]
key-files:
  created:
    - apps/staff-web/app/routes/api.m.foods.analyze.tsx
    - apps/staff-web/server/routes/api/m/foods/analyze.post.ts
    - packages/mobile-app/app/food-ai.tsx
  modified:
    - apps/staff-web/app/routes/api.m.food-entries.tsx
    - packages/mobile-app/app/(tabs)/food.tsx
    - apps/staff-web/AGENTS.md
decisions:
  - expo-image-picker skipped (zero new deps; camera + text covers both required paths for v1)
  - claude-sonnet-4-6 used (not Haiku-4.5); comment in code records the cheaper alternative
  - Nitro wrapper uses 5 ../ levels (not 6 as plan suggested); matched sibling foods/search.get.ts depth
metrics:
  duration: ~60min
  completed: 2026-06-15
  tasks: 3
  files: 6
---

# Quick 260615-k8m: AI Food Analysis (Photo + Text → Calorie Estimate)

**One-liner:** Claude vision+text estimate endpoint + mobile food-ai.tsx screen + FAB menu entry — members can now log home-cooked meals and restaurant plates by description or camera photo.

## What Was Built

### Task 1 — Backend: POST /api/m/foods/analyze

New resource route `apps/staff-web/app/routes/api.m.foods.analyze.tsx` and Nitro wrapper `apps/staff-web/server/routes/api/m/foods/analyze.post.ts`.

- `requireDemoMember` gate
- Accepts `{ image?: string, description?: string, mealHint?: string }` — at least one required
- Normalises image: bare base64 or `data:image/jpeg;base64,...` data URL (captures media type from prefix)
- Builds Claude message content array: vision block (if image) + text prompt with strict JSON schema
- Non-streaming `client.messages.create()` with `claude-sonnet-4-6`, `max_tokens: 600`
- Defensive parse: strips ` ```json ` fences, slices first `{` → last `}`, JSON.parse in try/catch
- Coerces/validates all fields with safe fallbacks; confidence ∈ {low,medium,high}
- Returns `{ ok: true, estimate: { foodName, kcalPer100g, proteinPer100gG, carbsPer100gG, fatPer100gG, suggestedQuantityG, confidence, note } }`

`apps/staff-web/app/routes/api.m.food-entries.tsx` widened (additive only):
- `foodItem.source` now accepts `"llm_estimate"` (was `"openfoodfacts" | "custom"` only)
- New optional body field `entrySource?: "manual" | "barcode" | "search" | "favourite" | "agent"`
- `food_entries.source` insert: `body.entrySource ?? (body.foodItem.barcode ? "barcode" : "search")` — existing callers unchanged
- No DB migration — both enum values already exist in schema

### Task 2 — Mobile: food-ai.tsx + FAB menu entry

`packages/mobile-app/app/food-ai.tsx` (new, 450+ lines):
- 3-mode state machine: `input` → `estimating` → `result`
- Input mode: multiline TextInput for description + `expo-camera` CameraView for photo capture; photo-attached row with Remove affordance; Estimate button (Feather `zap`) disabled unless input present
- Camera: `useCameraPermissions` gate, `CameraView` ref + `takePictureAsync({ base64: true, quality: 0.4 })`, full-screen overlay with close button
- Estimating mode: centered `ActivityIndicator` + text
- Result mode: foodName + kcal/100g + confidence badge + note; editable quantity TextInput (prefilled from suggestedQuantityG); meal pills (breakfast/lunch/dinner/snack); Log button POSTs to `/api/m/food-entries` with `source:"llm_estimate"` + `entrySource:"agent"`; Start Over link
- After log: `qc.invalidateQueries({ queryKey: ["food-entries"] })` + `qc.invalidateQueries({ queryKey: ["profile"] })` + `router.back()`
- No hardcoded hex — `useTheme()` tokens throughout; Feather icons only; no emoji icons; `useMemo` StyleSheet per AGENTS.md pattern

`packages/mobile-app/app/(tabs)/food.tsx` — FAB sheet now has three options:
1. Search (Feather `search`) → `/food-add`
2. Scan barcode (Feather `camera`) → `/food-barcode`
3. AI estimate (Feather `zap`) → `/food-ai` ← new

### Task 3 — Docs

`apps/staff-web/AGENTS.md` — Added "Member API — Calorie Counter Endpoints" section documenting all `/api/m/*` routes including the new `/api/m/foods/analyze` with full request/response shape, model choice, and the food-entries logging reuse pattern.

## Runtime Verification

Production build: `node ../../packages/core/dist/cli/index.js build` — successful (43.3 MB output).

Server started on PORT=8096. Curl result:

```
POST /api/m/foods/analyze
Body: {"description":"chicken caesar salad"}
Headers: X-Demo-Member-Id: seedm_05

Response:
{"ok":true,"estimate":{"foodName":"Chicken Caesar Salad","kcalPer100g":120,"proteinPer100gG":9.5,"carbsPer100gG":5.2,"fatPer100gG":7.8,"suggestedQuantityG":300,"confidence":"medium","note":"Romaine, grilled chicken, parmesan, croutons, Caesar dressing. Dressing amount varies greatly affecting calories."}}
```

Server stopped after verification (releases .output/server/node_modules/@libsql lock).

## Verification Checklist

- [x] `apps/staff-web/app/routes/api.m.foods.analyze.tsx` exports `action`, gates via requireDemoMember, calls Claude with vision block when image supplied, parses strict JSON defensively, returns `{ ok, estimate }` / `{ ok:false, error }`
- [x] Nitro wrapper `analyze.post.ts` exists and imports the action at the correct relative depth (5 `../`)
- [x] `food-entries` action accepts `entrySource` + `foodItem.source:"llm_estimate"` additively; existing callers unchanged; no DB migration
- [x] `food-ai.tsx` >= 120 lines; links to `/api/m/foods/analyze` and `/api/m/food-entries`; invalidates `["food-entries"]` + `["profile"]`
- [x] FAB menu in food.tsx has 3 options including `router.push("/food-ai")`
- [x] No hardcoded hex; Feather icons only; no emoji icons; no sparkle/wand
- [x] `npx tsc --noEmit` → zero errors (staff-web)
- [x] `npx expo export --platform web` → success (mobile bundles, food-ai.tsx resolves)
- [x] `AGENTS.md` documents `foods/analyze` endpoint
- [x] No DB migration; `@agent-native/core` untouched; no new deps (`expo-image-picker` skipped)
- [x] Runtime curl → `{ ok: true, estimate: {...} }` confirmed

## Deviations from Plan

**1. [Rule-manual] Nitro wrapper relative-path depth: 5 not 6**
- Plan said "six ../ levels" but cross-check against `server/routes/api/m/foods/search.get.ts` (sibling, same directory) shows it uses 5 levels. `[ean].get.ts` uses 6 because it lives one directory deeper (`foods/barcode/`). Used 5 to match the sibling.

**2. [Rule-manual] expo-image-picker not added**
- Plan specified the "skip for v1" default. Camera (`takePictureAsync`) covers the photo path; text description covers text-only. Zero new deps shipped.

**3. [Rule-manual] Model: sonnet-4-6 (not Haiku)**
- Plan default was `claude-sonnet-4-6`. Haiku alternative documented via code comment as instructed.

## Known Stubs

None — the AI estimate produces real data from Claude. The food-entries logging uses the existing food_items + food_entries tables with the already-present `llm_estimate` / `agent` enum values. No stubs blocking the plan's goal.

## Self-Check: PASSED

Files created:
- [x] apps/staff-web/app/routes/api.m.foods.analyze.tsx
- [x] apps/staff-web/server/routes/api/m/foods/analyze.post.ts
- [x] packages/mobile-app/app/food-ai.tsx

Commits:
- [x] 88c49160 — backend endpoint + food-entries widening
- [x] 1b187fbd — mobile screen + FAB menu
- [x] 4ddd89dc — AGENTS.md doc
