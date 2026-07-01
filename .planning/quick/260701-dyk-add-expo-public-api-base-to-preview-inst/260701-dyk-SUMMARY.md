---
phase: quick-260701-dyk
plan: 01
subsystem: mobile-app
tags: [eas, expo, build-config, mobile, ios]
dependency_graph:
  requires: []
  provides: [EXPO_PUBLIC_API_BASE in preview-install EAS profile]
  affects: [packages/mobile-app]
tech_stack:
  added: []
  patterns: [EXPO_PUBLIC_* build-time env inlining]
key_files:
  modified: [packages/mobile-app/eas.json]
decisions:
  - "EXPO_PUBLIC_API_BASE added to preview-install.env only — other profiles (development, preview, production) left byte-identical"
metrics:
  duration: "<2min"
  completed: "2026-07-01"
  tasks_completed: 1
  files_modified: 1
---

# Quick 260701-dyk: Add EXPO_PUBLIC_API_BASE to preview-install EAS Profile Summary

## One-liner

Baked `https://gym-class-os.vercel.app` into the `preview-install` EAS build profile so standalone iOS builds reach the live Vercel backend instead of `localhost:8081`.

## What was done

Added a single key to `packages/mobile-app/eas.json` under `build.preview-install.env`:

```json
"EXPO_PUBLIC_API_BASE": "https://gym-class-os.vercel.app"
```

`AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH` is preserved alongside it. No other profile or file was touched.

## Why

`lib/api.ts` resolves `process.env.EXPO_PUBLIC_API_BASE ?? "http://localhost:8081"`. Expo inlines `EXPO_PUBLIC_*` vars at bundle time, so a physical iPhone build (which cannot reach localhost) was making every `apiFetch` call fail. This one key wires the build to the live API.

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Add EXPO_PUBLIC_API_BASE to preview-install env | 1dcdab84 | packages/mobile-app/eas.json |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `packages/mobile-app/eas.json` exists and parses as valid JSON: confirmed
- Commit `1dcdab84` exists: confirmed
- `build.preview-install.env.EXPO_PUBLIC_API_BASE === "https://gym-class-os.vercel.app"`: confirmed (node verify exited 0)
- `AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH` still `"1"`: confirmed
- Other profiles (`development`, `preview`, `production`) have no `env` block: confirmed
