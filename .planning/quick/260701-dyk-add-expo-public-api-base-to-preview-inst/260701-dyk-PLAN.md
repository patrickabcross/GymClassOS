---
phase: quick-260701-dyk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [packages/mobile-app/eas.json]
autonomous: true
requirements: [MOBILE-EAS-LIVE-API]
must_haves:
  truths:
    - "A standalone iOS build from the preview-install profile reaches the live backend instead of localhost"
  artifacts:
    - path: "packages/mobile-app/eas.json"
      provides: "EXPO_PUBLIC_API_BASE pointing at the live Vercel deploy in the preview-install env block"
      contains: "https://gym-class-os.vercel.app"
  key_links:
    - from: "packages/mobile-app/eas.json (build.preview-install.env.EXPO_PUBLIC_API_BASE)"
      to: "packages/mobile-app/lib/api.ts (process.env.EXPO_PUBLIC_API_BASE)"
      via: "Expo build-time env inlining of EXPO_PUBLIC_* vars"
      pattern: "EXPO_PUBLIC_API_BASE"
---

<objective>
Add `EXPO_PUBLIC_API_BASE` to the `preview-install` EAS build profile so a standalone iOS build points at the live production backend (`https://gym-class-os.vercel.app`) instead of the `http://localhost:8081` fallback in `lib/api.ts`.

Purpose: A standalone build on a physical iPhone cannot reach `localhost` — without this, every `apiFetch` fails. `EXPO_PUBLIC_*` vars are inlined at bundle time by Expo, so the value is baked into the build.
Output: One additive key in `packages/mobile-app/eas.json`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- How the value is consumed. From packages/mobile-app/lib/api.ts -->
```typescript
const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081";
```

<!-- Current preview-install profile. From packages/mobile-app/eas.json -->
```json
"preview-install": {
  "distribution": "internal",
  "env": {
    "AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH": "1"
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add EXPO_PUBLIC_API_BASE to preview-install env</name>
  <files>packages/mobile-app/eas.json</files>
  <action>
    In `packages/mobile-app/eas.json`, add exactly one key to the `env` object of the `build.preview-install` profile (which already contains `AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH: "1"`):

      "EXPO_PUBLIC_API_BASE": "https://gym-class-os.vercel.app"

    Constraints:
    - Purely additive. Do NOT modify, reorder, or reformat any other profile (`development`, `preview`, `production`, `submit`) or the `cli` block.
    - Keep `AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH` in place; the env block ends up with both keys.
    - No app source changes. No trailing comma; keep valid JSON.
    - Preserve existing 2-space indentation.
  </action>
  <verify>
    <automated>node -e "const e=require('./packages/mobile-app/eas.json'); const env=e.build['preview-install'].env; if(env.EXPO_PUBLIC_API_BASE!=='https://gym-class-os.vercel.app') throw new Error('missing/wrong EXPO_PUBLIC_API_BASE'); if(env.AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH!=='1') throw new Error('clobbered existing push key'); if(e.build.preview.env||e.build.production.env||e.build.development.env) throw new Error('other profile env mutated'); console.log('OK');"</automated>
  </verify>
  <done>`eas.json` parses as valid JSON; `build.preview-install.env` contains both `EXPO_PUBLIC_API_BASE: "https://gym-class-os.vercel.app"` and the pre-existing `AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH: "1"`; no other profile changed.</done>
</task>

</tasks>

<verification>
- `packages/mobile-app/eas.json` is valid JSON (the node verify command above exits 0).
- Only the `preview-install.env` block gained a single new key.
- `development`, `preview`, `production`, and `submit` profiles are byte-unchanged apart from formatting-neutral edits.
</verification>

<success_criteria>
- A standalone iOS build built with `--profile preview-install` inlines `EXPO_PUBLIC_API_BASE=https://gym-class-os.vercel.app`, so `lib/api.ts` targets the live Vercel backend rather than localhost.
</success_criteria>

<output>
After completion, create `.planning/quick/260701-dyk-add-expo-public-api-base-to-preview-inst/260701-dyk-SUMMARY.md`
</output>
