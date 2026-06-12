# UI Baseline Capture Harness

## What this is

The standing screenshot-capture harness for GymClassOS UI reviews. It captures
full-page screenshots of every in-scope staff-web route and embed widget against
the live Vercel deploy at `https://gym-class-os.vercel.app`.

The harness is reused across all UI-review phases:

| Phase | Purpose                        | Output directory                   |
|-------|--------------------------------|------------------------------------|
| R1    | Before-state (baseline)        | `.planning/ui-reviews/baseline`    |
| R2    | After design-token changes     | `.planning/ui-reviews/after-R2`    |
| R3    | After naming/IA pass           | `.planning/ui-reviews/after-R3`    |
| R4    | After staff-web + embed redesign | `.planning/ui-reviews/after-R4`  |
| R5    | After mobile app redesign      | `.planning/ui-reviews/after-R5`    |

Consistent filenames across runs make side-by-side human comparison meaningful (D-16).

---

## One-time auth setup

Google OAuth sessions expire (typically within 24 h). Run this command once —
before every capture session if it has been more than 24 h since the last login:

```bash
node scripts/ui-baseline/capture.mjs --save-auth
```

This launches a headed Chromium browser window. Log in via Google when the
browser opens. The script waits up to 2 minutes for you to reach a `/gymos/**`
URL, then saves the session to `scripts/ui-baseline/storageState.json` and exits.

`storageState.json` is gitignored — it contains OAuth session cookies and must
never be committed.

---

## Running a capture

**Baseline (R1 before-state):**

```bash
node scripts/ui-baseline/capture.mjs
```

Output directory: `.planning/ui-reviews/baseline` (created if absent)

**After-state (R2–R5):**

```bash
node scripts/ui-baseline/capture.mjs --output-dir .planning/ui-reviews/after-R2
node scripts/ui-baseline/capture.mjs --output-dir .planning/ui-reviews/after-R3
node scripts/ui-baseline/capture.mjs --output-dir .planning/ui-reviews/after-R4
```

If the script prints `storageState expired`, re-run `--save-auth` first.

---

## Embed test pages

`embed-light.html` and `embed-dark.html` are static HTML files that load the
live `embed.js` from `gym-class-os.vercel.app` and render both widgets:

- `data-gymos-schedule` — the public class schedule / booking widget
- `data-gymos-form="<slug>"` — the lead-capture form widget

**FORM_SLUG:** The placeholder slug is `trial-signup`. Before running a capture
that includes embed pages, verify a published form with this slug exists at
`https://gym-class-os.vercel.app/gymos/forms`. If not, publish a form via the
staff UI, copy its slug, and update the `data-gymos-form` attribute in both
HTML files.

The embed pages are loaded via `file://` URL in Playwright. The script waits
2.5 seconds after page load for the injected iframes to fetch the live widgets.

---

## Filename convention

Every screenshot follows this naming scheme (D-13):

```
<route-slug>.<viewport>[.<state>].png
```

- `<route-slug>` — URL-slug form of the route (e.g. `gymos-inbox`, `draft-queue`)
- `<viewport>` — `desktop` (1440 px) or `mobile` (390 px)
- `<state>` — optional interaction state (e.g. `context-panel`, `templates-dialog`)

Examples:

```
gymos-home.desktop.png
gymos-home.mobile.png
gymos-inbox.desktop.context-panel.png
gymos-inbox.desktop.templates-dialog.png
gymos-schedule.desktop.booking-dialog.png
gymos-inbox.desktop.selected-row.png
embed-host.light.desktop.png
embed-host.dark.desktop.png
embed-host.light.mobile.png
```

---

## Surfaces covered

### Staff-web routes (desktop + mobile)

- `/gymos` — home noticeboard
- `/gymos/inbox` — WhatsApp inbox
- `/gymos/schedule` — class schedule
- `/gymos/members` — members list

### Staff-web routes (desktop only)

- `/gymos/inbox?filter=leads` — leads filter
- `/gymos/members/<id>` — member detail (first member resolved at runtime)
- `/gymos/payments` — payments
- `/gymos/analytics` — analytics dashboard
- `/gymos/campaigns` — campaigns
- `/gymos/forms` — forms management
- `/gymos/settings/integrations` — settings / integrations
- `/draft-queue` — legacy draft queue (still routable)
- `/settings` — legacy settings (still routable)
- `/team` — team management (still routable)

### Interaction states (desktop, D-06)

- `gymos-inbox.desktop.context-panel` — conversation open, agent sidebar closed, member context right-rail visible
- `gymos-inbox.desktop.templates-dialog` — WhatsApp templates dialog open
- `gymos-schedule.desktop.booking-dialog` — class booking dialog open
- `gymos-inbox.desktop.selected-row` — first conversation row hovered/selected (`.email-list-row.selected` before-state, R-12)

### Embed host pages (desktop + mobile)

- `embed-host.light.desktop` — schedule + form widgets on white background
- `embed-host.dark.desktop` — schedule + form widgets on dark background (`#0b0f1a`)
- `embed-host.light.mobile` — schedule + form widgets at 390 px on white background

### Mobile (user-captured via Expo Go — D-07)

Mobile screenshots are captured manually on a physical device running Expo Go.
See the mobile capture checklist in `.planning/phases/R1-audit-baseline/R1-03-PLAN.md`.

---

## Notes

- `storageState.json` is gitignored — never commit it
- The script tolerates per-route errors: if one route fails, captures continue
- Agent sidebar is closed (Escape) before every gymos capture (Pitfall 2)
- Session validity is checked at script start — failure exits with a clear message
