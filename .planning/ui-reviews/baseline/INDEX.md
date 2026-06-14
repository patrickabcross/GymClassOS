# UI Baseline Capture Index

| Key | Value |
|-----|-------|
| Capture date | 2026-06-12 |
| Deploy target | https://gym-class-os.vercel.app |
| Deployed commit SHA | `2fab6b7f78b7857b0ada16a411a26188ee9ccfae` (master HEAD, auto-deployed to Vercel) |
| Playwright version | 1.58.2 |
| Desktop viewport | 1440 × 900 |
| Mobile viewport | 390 × 844 |

> **Baseline is for side-by-side human review, not pixel-diff (D-16).**
> After-state runs (R2–R5) re-run `node scripts/ui-baseline/capture.mjs --output-dir <after-dir>` and check coverage parity against this manifest.

---

## Staff Web

| File | Route / Screen | Viewport | State | Capture date |
|------|---------------|----------|-------|--------------|
| `gymos-home.desktop.png` | `/gymos` | desktop | default | 2026-06-12 |
| `gymos-home.mobile.png` | `/gymos` | mobile | default | 2026-06-12 |
| `gymos-inbox.desktop.png` | `/gymos/inbox` | desktop | default | 2026-06-12 |
| `gymos-inbox.mobile.png` | `/gymos/inbox` | mobile | default | 2026-06-12 |
| `gymos-inbox-leads.desktop.png` | `/gymos/inbox?filter=leads` | desktop | leads filter | 2026-06-12 |
| `gymos-inbox.desktop.context-panel.png` | `/gymos/inbox?conversation=<first>` | desktop | conversation open, sidebar closed | 2026-06-12 |
| `gymos-inbox.desktop.selected-row.png` | `/gymos/inbox` | desktop | first row hovered | 2026-06-12 |
| `gymos-schedule.desktop.png` | `/gymos/schedule` | desktop | default | 2026-06-12 |
| `gymos-schedule.mobile.png` | `/gymos/schedule` | mobile | default | 2026-06-12 |
| `gymos-members.desktop.png` | `/gymos/members` | desktop | default | 2026-06-12 |
| `gymos-members.mobile.png` | `/gymos/members` | mobile | default | 2026-06-12 |
| `gymos-members-id.desktop.png` | `/gymos/members/<first-member-id>` | desktop | member detail | 2026-06-12 |
| `gymos-payments.desktop.png` | `/gymos/payments` | desktop | default | 2026-06-12 |
| `gymos-analytics.desktop.png` | `/gymos/analytics` | desktop | default | 2026-06-12 |
| `gymos-campaigns.desktop.png` | `/gymos/campaigns` | desktop | default | 2026-06-12 |
| `gymos-forms.desktop.png` | `/gymos/forms` | desktop | default | 2026-06-12 |
| `gymos-settings-integrations.desktop.png` | `/gymos/settings/integrations` | desktop | default | 2026-06-12 |
| `draft-queue.desktop.png` | `/draft-queue` | desktop | default | 2026-06-12 |
| `settings.desktop.png` | `/settings` | desktop | default | 2026-06-12 |
| `team.desktop.png` | `/team` | desktop | default | 2026-06-12 |

### Interaction-state failures (D-06)

Two D-06 interaction states failed to capture and are recorded here as known gaps:

| Intended file | Reason failed |
|---------------|--------------|
| `gymos-inbox.desktop.templates-dialog.png` | `getByRole('button', { name: /template/i })` not found — the Templates button requires a conversation to be active/loaded in the composer; the inbox headless state did not render this control. |
| `gymos-schedule.desktop.booking-dialog.png` | No `[role="dialog"]` appeared after clicking the first schedule element — schedule may have no upcoming bookable classes, or the first element clicked was not a class card. |

These are not regressions — they are baseline capture-time failures. After-state parity checks should attempt the same interaction states; if they also fail, the gap is consistent. If they succeed in after-state, it indicates a UI change exposed the controls.

---

## Embeds

| File | Route / Screen | Viewport | State | Capture date |
|------|---------------|----------|-------|--------------|
| `embed-host.light.desktop.png` | `file://scripts/ui-baseline/embed-light.html` | desktop | light host, embed widgets | 2026-06-12 |
| `embed-host.dark.desktop.png` | `file://scripts/ui-baseline/embed-dark.html` | desktop | dark host, embed widgets | 2026-06-12 |
| `embed-host.light.mobile.png` | `file://scripts/ui-baseline/embed-light.html` | mobile | light host, embed widgets | 2026-06-12 |

Note: `embed-host.dark.mobile` was intentionally excluded from the capture harness (`scripts/ui-baseline/capture.mjs` `embedCaptures` array); only one mobile embed capture (light) was specified. After-state runs use the same harness so this is a consistent gap.

---

## Mobile

> **Mobile capture deviation — read before using these screenshots for review.**
>
> The original plan (D-07) required real-device captures via Expo Go. This was impossible at capture time:
> App Store Expo Go only runs SDK 56; this app is SDK 55; no EAS dev client exists (EAS build is master-branch
> work queued for after v1.1). The user explicitly approved a react-native-web fallback on 2026-06-12.
>
> **What these screenshots actually show:**
> - **Rendering:** Expo app rendered via react-native-web at 390×844 in headless Chromium (script:
>   `scripts/ui-baseline/capture-mobile-web.mjs`). Fonts, safe-area insets, and platform-specific
>   shadow/elevation may differ from a real device.
> - **Data source:** Live `/api/m/*` routes are production-gated (NODE_ENV check returns 401 in the Vercel
>   deploy — this affects real phones too). The capture script intercepts these requests and fulfills them with
>   fixture data matching the exact loader shapes so screens render meaningfully.
> - **Barcode screen:** `food-barcode.png` shows the camera permission stub — headless Chromium has no camera.
>   A real device shows the live camera view; the screen chrome (button layout, overlay) is still captured.
>
> **Re-shootable when EAS dev client exists (R5 or later):** Replace `scripts/ui-baseline/capture-mobile-web.mjs`
> with a real-device capture script, or follow MOBILE-CHECKLIST.md on a device running the EAS dev build.
> Use the same filenames — `mobile/` will slot into after-state comparisons without changing the manifest.
>
> **Discovery worth recording:** The `/api/m/*` member API being production-gated to 401 means the mobile app
> currently cannot fetch live data from the Vercel deploy at all — not just in headless Chromium. This is
> flagged for the master-branch mobile/EAS workstream to resolve before any real-device testing.

| Screen | Viewport | State | Target filename | Source | Status | Capture date |
|--------|----------|-------|-----------------|--------|--------|--------------|
| Home tab | 390×844 | default (fixture data) | `tab-home.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Schedule tab (class browser) | 390×844 | default (fixture data) | `tab-schedule.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Food tab (calorie log) | 390×844 | default (fixture data) | `tab-food.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Profile tab | 390×844 | default (fixture data) | `tab-profile.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Member picker | 390×844 | default (fixture data) | `pick-member.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Food search screen | 390×844 | default (fixture data) | `food-add.png` | react-native-web / headless Chromium | captured | 2026-06-12 |
| Barcode scanner screen | 390×844 | camera permission stub | `food-barcode.png` | react-native-web / headless Chromium | captured (stub) | 2026-06-12 |
| Agent chat sheet | 390×844 | sheet open via FAB | `agent-sheet.png` | react-native-web / headless Chromium | captured | 2026-06-12 |

---

## Coverage Summary

| Surface | Captured | Expected | Gap |
|---------|----------|----------|-----|
| Staff Web (desktop routes) | 16 | 16 | 0 |
| Staff Web (mobile routes) | 4 | 4 | 0 |
| Staff Web (interaction states) | 2 of 4 | 4 | 2 (templates-dialog, booking-dialog — see above) |
| Embeds | 3 | 3 | 0 |
| Mobile (web fallback) | 8 | 8 | 0 (all 8 captured; see deviation note above — not real-device) |
| **Total** | **33 PNGs** | **35 PNGs** | **2** |

### Intentional exclusions

The following surfaces are **excluded from all baseline and after-state captures** — after-state parity checks should treat these as expected gaps, not regressions:

| Surface | Reason |
|---------|--------|
| `/email` | Excluded per D-05 — legacy route not in scope for the UI redesign |
| `$view` redirect routes | URL redirect stubs; not distinct UI surfaces |
| API routes (`/_agent-native/*`, `/api/*`) | Server endpoints, no UI |
| Webhook routes | Server-only; not UI surfaces |
| `embed-host.dark.mobile` | Not in capture harness by design (only light-mobile included) |
