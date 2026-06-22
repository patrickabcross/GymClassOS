# Session — RunStudio rebrand, marketing homepages, video brief pipeline

**Date:** 2026-06-21 → 2026-06-22
**Branch:** master (deployed to production via Vercel git integration)
**Commits:** `f7195ffe` → `082854ba` (9 commits, all on master, all live)

---

## TL;DR

1. **Rebrand GymClassOS → RunStudio** across all user-visible staff-web strings + agent identity + auth appName + the public `/v` page. (Internal `gymos` route slugs / env names / tables unchanged. `apps/hq` operator app and code comments left as-is.)
2. **4 localized marketing homepages** shipped at `/uk /us /fr /de` (`/` = UK canonical), built from the country briefs. FR + DE in native French/German. Live on `gym-class-os.vercel.app`.
3. **Content tab hidden** from the admin nav (gyms aren't writing articles). Route intact, just unlinked.
4. **Video content pipeline stages 1–2 built**: agent authors a brief (`create-video-brief`) and WhatsApps it to the coach as an approved template (`dispatch-video-brief`). Stages 3–5 (footage capture, Remotion render, posting) NOT built — need new infra.

---

## 1. Brand book (input)

Unzipped to `docs/brand book/`: `BRAND.md` + `tokens.css` + `tokens.json` — the RunStudio brand spec (rebrand of the GymClassOS product, domain `runstudio.ai`).
Key brand rules: double meaning of **run** (operate + move); "the software disappears" (lead with outcome + agent); agent is an unnamed colleague; proof over promise; spine = **"You teach. Your AI runs everything else."**; pulse `#C8FF3D` ≤8% accent-only; warm `--track #F3F1EA` ground; Space Grotesk / Inter / Space Mono; double-chevron motion mark; `runStudio.` wordmark (700/400 weight break).

Design exploration mockups live in `docs/brand book/homepage-concepts/` (v1-operator, v2-proof, v3-disappear, index.html). **v3 "Disappearing Software" was chosen** as the production design.

## 2. Rebrand GymClassOS → RunStudio

- All 55 visible `GymClassOS` strings in `apps/staff-web/app/**` → `RunStudio` (route `<title>`s, `skins/config.ts` `displayName`, `GymosTopNav` fallback, access-denied/checkout text, member agent persona).
- `server/plugins/agent-chat.ts` staff agent identity, `server/plugins/auth.ts` `appName`, `server/lib/public-video-ssr.ts` public `/v` page copy.
- **Left intentionally:** `apps/hq` (separate operator control plane), internal code comments, secret descriptions, `gymos` route slugs, `GYMOS_*` env names, DB table names. The `hustle` skin still shows "Hustle" (the customer's own brand); `default` skin = "RunStudio".

## 3. Marketing homepages (4 markets)

**Architecture** (the live homepage is NOT a React Router route — `root.tsx` wraps the RR app in `<ClientOnly>`, so RR routes aren't crawlable; public pages are Nitro server routes returning self-contained SSR HTML, same pattern as `/privacy`, `/c`, `/v`):

- `apps/staff-web/features/marketing/lib/marketing-content.ts` — `LOCALES` record (uk/us/fr/de): all copy per market + the 7-section content model. **Edit copy here.**
- `apps/staff-web/features/marketing/lib/marketing-ssr.ts` — `homePage(locale)` renderer + section builders + `homeCSS()` (all brand tokens inlined). Exports `renderHomeUK/US/FR/DE`; `renderHomePage` = UK. Privacy page still uses the older lighter shell in the same file.
- Routes: `apps/staff-web/server/routes/{uk,us,fr,de}.get.ts` re-export the renderers; `index.get.ts` (`/`) = UK.
- Public access wired in `server/plugins/auth.ts` (`publicPaths` + the allowlist-skip list both list `/uk /us /fr /de`).

**Per-brief emphasis:** UK = boldest, full content→conversion loop, month-to-month. US = consolidation/ROI ("stop duct-taping six tools"), demo-led. FR (native) = aggregator pain first, RGPD/SEPA, NF525 wording is **"conçu pour la conformité NF525 … attestation éditeur fournie"** (NOT "certifié"). DE (native, Sie-Form) = aggregator independence, DSGVO/EU-hosting, sober tone.

**Sections (all locales):** sticky nav (wordmark + links + Log in + CTA) → hero (2-col: pitch + live WhatsApp agent thread) → problem → how-it-works loop (5 steps: content→distribution→conversion→booking→back-office) → agent (copy + 16:9 AI-video slot) → proof (4 stats) → objections (Q/A + trust row) → final CTA → footer (privacy/contact + market switcher).

**AI-video slots:** layout-stable placeholders with a comment showing the `<video>` swap. Hero is the live chat; the agent section has a 16:9 film slot — both still placeholders.

**CTA targets (TODO):** "Run my studio" (UK/FR) + "Log in" (all) → `/gymos`; "Get a demo" (US/DE) → `mailto:`. Repoint to a real signup/demo flow when one exists. No geo-redirect — `/` always = UK.

**Fixes made during review:** WhatsApp thread moved into the hero (was in a lower section); nav `Log in` added; proof stats `white-space:nowrap` + smaller max font (FR/DE `2 840 €` was wrapping the `€`); FR label tightened to "d'admin gagnées / semaine"; nav content wrapped in `.r-wrap` so it aligns with the body column + footer (was using a bespoke padding calc).

## 4. Content tab hidden

`apps/staff-web/app/components/gymos/GymosTopNav.tsx` — removed the Content `<Link>` + unused `isContent`. `/gymos/content` route + feature untouched (re-surface by re-adding the Link).

## 5. Video content pipeline (stages 1–2 of 5)

User's target pipeline: **agent writes hook/angle/script → dispatch to trainer → trainer shoots & sends back → agent edits with Remotion → approve → post.** Trainer = the coach (one person). Dispatch decided = **approved WhatsApp template**.

**Built (live):**
- `apps/staff-web/actions/create-video-brief.ts` — agent authors `{title, hook, angle, script, classId?, format?}`. Stored in `application_state` key `gymos-video-briefs` (status `draft`). **No DB migration** (mirrors `save-segment.ts`). Two-exposed (agent prompt Video tab + AGENTS.md).
- `apps/staff-web/actions/dispatch-video-brief.ts` — sends a brief to the coach as an approved WhatsApp template via the existing `enqueueOutboundWhatsApp` → worker `sendMessage` chokepoint. `{briefId?}` (omit → most recent draft). Script flattened to one line (template vars reject newlines). Marks brief `dispatched`. Agent-callable ("send me that brief").

**Send-path facts (why dispatch needs setup):** `sendMessage` is **member-bound** (`memberId` + `phone_e164`) and **opt-in is gate #1 even for templates**. A free-text message only sends in a 24h window; the coach has no open window with the business → out-of-window delivery requires an **approved template**.

**⚠️ OPERATOR SETUP required before dispatch actually delivers** (action returns a clear error until done):
1. Approve a `video_brief` WhatsApp template in Meta/MYÜTIK with **3 body vars** ({{1}} title, {{2}} hook, {{3}} script). Suggested body: *"New video to shoot — {{1}}. Hook: {{2}}. Script: {{3}}. Open RunStudio when it's filmed."*
2. Coach must be a `gym_members` row (matched by `COACH_WHATSAPP_E164`) **with WhatsApp opt-in**.
3. Set `COACH_WHATSAPP_E164` (E.164) in the **Vercel** env (the action runs in staff-web). Optional `VIDEO_BRIEF_TEMPLATE_NAME` (default `video_brief`).
   Error codes: `NO_BRIEFS` / `BRIEF_NOT_FOUND` / `COACH_NOT_CONFIGURED` / `COACH_NOT_A_MEMBER` / `TEMPLATE_NOT_APPROVED`.

**NOT built — stages 3–5 (each needs new infra):**
- Stage 3 — receive trainer footage: inbound WhatsApp `video` messageType is modelled in the schema, but capturing/storing the actual media file from the MYÜTIK relay is not wired.
- Stage 4 — **Remotion render-to-mp4**: only `@remotion/player` (browser preview) exists; there is **no** server-side renderer (`@remotion/renderer`/Lambda) — the code deliberately avoids importing it. This is the gated **CV-RENDER** phase (RENDER-01/02). Needs a render service (Fly machine or Remotion Lambda) + file storage.
- Stage 5 — approve + post to social: no posting integration exists.

## Deploy mechanics (important for next session)

- **Deploy = `git push origin master`** → Vercel git integration (project `gym-class-os`, prod branch `master`). Auto-builds in ~2 min.
- **DO NOT use `vercel` / `vercel --prod` CLI** to deploy — the monorepo source exceeds the CLI's **10 MB upload cap** ("Request body too large"). Git push is the only path.
- **DO NOT add a root `.vercelignore`** — Vercel applies it to git builds too, and a bare `docs` pattern matches every nested `docs/` (including `packages/core/src/scripts/docs/`), which broke the core build (TS2307). The one I added was removed in `ce7fef05`.
- Verify live: `curl -s -o /dev/null -w '%{http_code}' https://gym-class-os.vercel.app/fr` etc.

## Commits (oldest → newest)

| Commit | What |
|--------|------|
| `f7195ffe` | 4 localized RunStudio homepages + rebrand |
| `ce7fef05` | remove `.vercelignore` that broke the monorepo build |
| `713a4e78` | WhatsApp thread back in hero + nav Log in |
| `c09de61c` | proof stats one-line (FR/DE `€` wrap) |
| `6fc2b73d` | FR proof label tighten |
| `6408cc99` | nav content width aligned with body column |
| `85fe7642` | hide Content tab from admin nav |
| `f67026e3` | `create-video-brief` (pipeline stage 1) |
| `082854ba` | `dispatch-video-brief` (pipeline stage 2) |

## Open follow-ups

- [ ] Complete the 3 dispatch operator-setup steps (template + coach member + env) to activate `dispatch-video-brief`.
- [ ] Repoint marketing CTAs to a real signup/demo flow (currently `/gymos` + `mailto:`).
- [ ] Fill the AI-video slots with real clips (hero chat is live; agent-section 16:9 slot is a placeholder).
- [ ] (Optional) geo-redirect `/` by country instead of always-UK.
- [ ] Pipeline stages 3–5: footage capture → Remotion render service (CV-RENDER) → social posting. Each needs an infra decision; scope one at a time.
