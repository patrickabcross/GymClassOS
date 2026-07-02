---
phase: quick-260702-dzx
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/mobile-app/app/(tabs)/food.tsx
  - packages/mobile-app/app/food-ai.tsx
  - packages/mobile-app/app/_layout.tsx
autonomous: true
requirements: [POSTDEMO-05]
must_haves:
  truths:
    - "Opening the Food tab '+' shows a photo/AI-estimate action as the single most prominent way to add food"
    - "Barcode scan and text search are still reachable, but visually demoted below the primary photo action"
    - "Tapping the primary photo action lands the user directly in the camera/photo step of the AI estimate flow"
    - "Logging still works from all three entry points (AI estimate, barcode, search)"
  artifacts:
    - path: "packages/mobile-app/app/(tabs)/food.tsx"
      provides: "Redesigned add-food sheet: primary photo CTA + demoted 'More ways to add' section"
      contains: "food-ai"
    - path: "packages/mobile-app/app/food-ai.tsx"
      provides: "Photo-first input mode; auto-opens camera when arriving from the '+' primary action"
      contains: "useLocalSearchParams"
    - path: "packages/mobile-app/app/_layout.tsx"
      provides: "Explicit Stack.Screen registration for food-ai (title + modal presentation)"
      contains: "food-ai"
  key_links:
    - from: "packages/mobile-app/app/(tabs)/food.tsx"
      to: "/food-ai"
      via: "router.push with capture param"
      pattern: "food-ai\\?capture"
    - from: "packages/mobile-app/app/food-ai.tsx"
      to: "CameraView"
      via: "showCamera initialised from capture param"
      pattern: "capture"
---

<objective>
Make the mobile Food tab's add-food flow photo-first: the "+" chooser must lead with the AI photo estimate as the obvious primary action, and demote barcode + text-search into a secondary "More ways to add" group. Tapping the primary action should drop the user straight into the camera step of the existing AI estimate flow.

Purpose: Req #5 of the post-demo scope — prove RunStudio's calorie counter is a modern "snap a photo" experience, not a barcode/search database lookup.
Output: Reordered/re-emphasised entry UI in `food.tsx`, a photo-first `food-ai.tsx` input screen that can auto-launch the camera, and a proper Stack registration for the `food-ai` route. No backend, no schema, no new deps.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@AGENTS.md

# Mobile is an Expo/React Native app — use RN conventions (useTheme, Feather icons,
# StyleSheet, expo-router). Do NOT use shadcn/Tabler (staff-web only).
# Keep the root AGENTS.md progressive-disclosure / "template UX stays clean" principles.

@packages/mobile-app/app/(tabs)/food.tsx
@packages/mobile-app/app/food-ai.tsx
@packages/mobile-app/app/food-barcode.tsx
@packages/mobile-app/app/food-add.tsx
@packages/mobile-app/app/_layout.tsx

<interfaces>
<!-- Contracts the executor needs. All already exist — do NOT rebuild them. -->

Routes (expo-router, file-based under packages/mobile-app/app/):
  /food-ai       → AI photo/text estimate screen (food-ai.tsx). PROMOTE to primary.
  /food-barcode  → barcode scan screen (food-barcode.tsx). DEMOTE (keep working).
  /food-add      → text search screen (food-add.tsx). DEMOTE (keep working).

food.tsx add-food sheet (current — a transparent Modal opened by the FAB):
  - styles.addOption / styles.addOptionText — the three equal-weight option rows.
  - Current order + targets:
      Search       → router.push("/food-add")       Feather "search"
      Scan barcode → router.push("/food-barcode")   Feather "camera"
      AI estimate  → router.push("/food-ai")        Feather "zap"
  - Available theme tokens (from useTheme()): colors.accent, colors.accentForeground,
    colors.card, colors.cardElevated, colors.foreground, colors.muted, colors.mutedFaint,
    colors.border; radius.md / radius.sm / radius.pill; font.bold / font.semibold / font.regular.

food-ai.tsx (input mode — the screen to make photo-first):
  - Mode = "input" | "estimating" | "result". State: description, photoBase64, showCamera.
  - const [showCamera, setShowCamera] = useState(false);  // camera overlay toggle
  - Camera capture already implemented (CameraView + handleCapture + useCameraPermissions).
  - Input mode currently renders: "Describe your meal" TextInput (autoFocus) FIRST,
    then "Photo (optional)" Take-photo button. Estimate button calls handleEstimate().
  - useLocalSearchParams from expo-router is available for reading a `capture` param.

_layout.tsx:
  - Stack registers food-add and food-barcode with { title, headerShown: true, presentation: "modal" }.
  - food-ai is NOT registered → inherits base screenOptions and shows an ugly "food-ai" header.
    Add a matching Stack.Screen for it.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Photo-first add-food chooser in food.tsx</name>
  <files>packages/mobile-app/app/(tabs)/food.tsx</files>
  <action>
    Redesign the add-food bottom sheet (the `Modal` opened by the FAB) so the AI photo
    estimate is the single most prominent action, per the locked photo-first decision.

    1. Replace the three equal `addOption` rows with a clear hierarchy:
       - PRIMARY: one large, accent-coloured action — label it "Snap a meal" (or
         "Photo estimate") with a Feather "camera" icon — that routes to the AI flow and
         requests the camera immediately:
             setAddOpen(false);
             router.push("/food-ai?capture=1");
         Give it real visual weight: accent background (theme.colors.accent), accentForeground
         text, larger padding than the secondary rows, camera icon. Add a new style (e.g.
         `primaryOption` / `primaryOptionText`) rather than reusing `addOption`.
       - SECONDARY: below the primary, add a small muted sub-header "More ways to add"
         (reuse the `sheetTitle` style or add a `subLabel` style), then the two demoted
         rows using the existing smaller `addOption` style:
             Search       → router.push("/food-add")      Feather "search"
             Scan barcode → router.push("/food-barcode")  Feather "camera-off" or keep "camera"
                            (prefer a distinct icon like "search"/"maximize" for barcode so the
                            two secondary rows read differently from the primary camera CTA;
                            "grid" or "maximize" works for barcode — pick one that exists in Feather).
       Keep every onPress doing setAddOpen(false) THEN router.push(...) exactly as today.

    2. Keep the sheet title "Add food" at the top. Maintain the existing backdrop / handle /
       stopPropagation structure and animationType.

    3. Do NOT delete the Search or Scan barcode entries — they must remain reachable, just
       demoted. Do NOT touch the entries list, totals, meal grouping, or FAB behaviour.

    Follow the app's existing RN conventions (StyleSheet built in the useMemo, theme tokens,
    Feather icons). No new deps, no shadcn/Tabler. Keep it clean — resist adding extra helper
    text or badges; the hierarchy alone should make the photo path obvious.

    Run `npx prettier --write` on the file after editing.
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit</automated>
  </verify>
  <done>food.tsx sheet shows one prominent accent "Snap a meal"/photo action routing to /food-ai?capture=1, with Search + Scan barcode demoted under a "More ways to add" sub-header; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 2: Photo-first food-ai input + register the route</name>
  <files>packages/mobile-app/app/food-ai.tsx, packages/mobile-app/app/_layout.tsx</files>
  <action>
    Make the AI estimate screen lead with the camera/photo, and register it as a proper modal
    route so the header matches food-add / food-barcode.

    In food-ai.tsx (input mode only — do NOT change estimating/result/camera-overlay logic):
    1. Import `useLocalSearchParams` from "expo-router" and read the `capture` param:
         const params = useLocalSearchParams<{ capture?: string }>();
       Initialise the camera to open automatically when arriving from the "+" primary action:
         const [showCamera, setShowCamera] = useState(params.capture === "1");
       (Keep the existing camera-permission handling — if permission isn't granted the existing
       permission prompt shows, which is the correct step-1 behaviour.)
    2. Reorder the input-mode JSX so PHOTO is the primary step and the text description is the
       secondary/optional fallback:
       - Move the "Photo" block ABOVE the description block. Relabel its section header from
         "Photo (optional)" to something primary like "Snap your meal", and make the
         "Take photo" affordance the visually dominant control (e.g. give it accent styling or
         keep it prominent — it is the headline action now).
       - Move the description TextInput below it, relabel to "Or describe it" and REMOVE
         `autoFocus` (autoFocus currently pops the keyboard and fights the photo-first intent).
       - Keep the "photo attached" confirmation row, the Estimate button, `hasInput` gating,
         handleEstimate, handleLog, and handleStartOver exactly as-is. The Estimate button must
         stay enabled whenever a photo OR description is present.
    3. Do NOT change the analyze POST (/api/m/foods/analyze) or the log POST
       (/api/m/food-entries) — behaviour must be identical.

    In _layout.tsx:
    4. Add a Stack.Screen registration for food-ai matching the food-barcode one:
         <Stack.Screen
           name="food-ai"
           options={{ title: "Snap a meal", headerShown: true, presentation: "modal" }}
         />
       Place it near the other food-* screen registrations.

    Follow RN/expo-router conventions; no new deps. Run `npx prettier --write` on both files.
  </action>
  <verify>
    <automated>cd packages/mobile-app && npx tsc --noEmit</automated>
  </verify>
  <done>food-ai opens the camera on mount when reached via ?capture=1, its input mode leads with the photo step (description demoted, no autoFocus), estimate/log flows unchanged, and food-ai is registered as a titled modal route; typecheck clean.</done>
</task>

</tasks>

<verification>
- `cd packages/mobile-app && npx tsc --noEmit` is clean (no typecheck npm script exists — run tsc directly).
- food.tsx: the add-food sheet leads with a single prominent photo/AI action; Search + Scan barcode are present but demoted under "More ways to add".
- The primary action routes to `/food-ai?capture=1`; food-ai reads the param and opens the camera immediately.
- All three log paths (AI estimate, barcode, search) still POST to /api/m/food-entries unchanged.
- No changes outside packages/mobile-app; no backend/schema/deps touched.
</verification>

<success_criteria>
- Photo/AI estimate is the obvious default add-food action on the Food tab.
- Barcode + text search remain fully functional from their demoted entry points.
- Tapping the primary action lands directly in the camera step of the existing AI flow.
- `npx tsc --noEmit` passes in packages/mobile-app.
- Single atomic commit: `feat(quick-260702-dzx): photo-first calorie counter add-food flow`.
</success_criteria>

<output>
After completion, create `.planning/quick/260702-dzx-calorie-counter-photo-first-food-leads-w/260702-dzx-SUMMARY.md`
</output>
