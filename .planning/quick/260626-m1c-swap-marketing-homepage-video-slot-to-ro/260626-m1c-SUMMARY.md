---
phase: quick-260626-m1c
plan: 01
subsystem: marketing-homepage
tags: [video, ssr, static-asset, marketing]
dependency_graph:
  requires: []
  provides: ["/marketing/runstudio-film.mp4 static asset", "videoSlot() real-video rendering"]
  affects: ["apps/staff-web/features/marketing/lib/marketing-ssr.ts"]
tech_stack:
  added: []
  patterns: ["SSR HTML-string template pattern (no React, no JS)"]
key_files:
  created:
    - apps/staff-web/public/marketing/runstudio-film.mp4
  modified:
    - apps/staff-web/features/marketing/lib/marketing-ssr.ts
decisions:
  - "Video src path is /marketing/runstudio-film.mp4 (stable name; roughcut_overlaid_v4 working name dropped)"
  - "videoSlot() made backward-compatible: placeholder still renders when src is absent"
  - "No poster attribute added (ffmpeg not available; plan explicitly allowed skipping)"
metrics:
  duration: "~5 minutes"
  completed: "2026-06-26"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Quick 260626-m1c: Swap Marketing Homepage Video Slot to Real Roughcut — Summary

Real 12.7 MB roughcut MP4 committed to `public/marketing/` and wired into `videoSlot()` via an optional `src` param — all five locale homepages now render `<video autoplay muted loop playsinline>` with tag + caption overlaid, no play-button placeholder.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Copy roughcut MP4 to `apps/staff-web/public/marketing/runstudio-film.mp4` | `991621ca` |
| 2 | Extend `videoSlot()` with `src?` param; update `agentSection()` call site; run Prettier | `287c76df` |

## Verification

- `apps/staff-web/public/marketing/runstudio-film.mp4` exists at 12.7 MB (OK)
- `marketing-ssr.ts` references `/marketing/runstudio-film.mp4` in doc-comment + call site
- `<video>` element emits `autoplay muted loop playsinline preload="metadata"`
- `.video-slot__play` placeholder is in the `else` branch only — not rendered when `src` is set
- `.video-slot__tag` and `.video-slot__cap` overlays preserved in all branches
- Pre-existing `tsc --noEmit` errors at lines 23-28 (import type syntax) confirmed pre-existing before this task; no new errors introduced

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The video is wired to the real binary; no placeholder or TODO remains in the deployed path.

## Self-Check: PASSED

- `apps/staff-web/public/marketing/runstudio-film.mp4` — FOUND (12.7 MB)
- `apps/staff-web/features/marketing/lib/marketing-ssr.ts` — modified, FOUND
- Commit `991621ca` — FOUND
- Commit `287c76df` — FOUND
