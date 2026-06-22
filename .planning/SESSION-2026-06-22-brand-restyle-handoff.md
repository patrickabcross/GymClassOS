# Session handoff — 2026-06-22 — Settings/detection fixes DONE, Brand restyle NEXT

## Part 1 — DONE this session (settings panel + LLM detection) — DEPLOYED

Pushed to master `89d6b94b` (Vercel auto-deploys; rebuilds packages/core from source via root `postinstall`).

Quick tasks (all on master, see STATE.md "Quick Tasks Completed"):
- **260622-d1v** — (superseded) trimmed the agent-chat gear Settings panel.
- **260622-e4a** — reverted that trim (full panel restored); added the operator-chrome gate + `AGENT_NATIVE_SINGLE_TENANT` flag + first env-status app_secrets fix.
- **260622-f8j** — generalized the gate to `showOperatorChrome` (one prop, default true); also hides **Workspace tab + Feedback button + model picker** for non-operators (Act picker stays).
- **260622-g2k** — (the real fix) env-status now **always** checks app_secrets (dropped the `inEnv ? false : …` short-circuit). A provider key in BOTH process.env AND app_secrets (HUSTLE's ANTHROPIC_API_KEY case) was collapsing `configured` to `canUseDeployEnv` (false in prod) → false "AI assistant not configured". Now app_secrets presence counts unconditionally → chat gate clears.

**Operator gating config (durable):**
- `RUNSTUDIO_OPERATOR_EMAILS` (comma-sep, Vercel env) gates the sidebar **gear + Workspace + Feedback + model picker**. Code default = `["patrickalexanderross@outlook.com"]`. **Add the HQ email here later.** Distinct from `GYMOS_ADMIN_EMAILS` (gym admins ≠ operator).
- `AGENT_NATIVE_SINGLE_TENANT=1` (optional Vercel env) — makes deploy-env LLM keys count too. NOT required (app_secrets path works without it); good hardening for a future client who only sets env.
- Mechanism: core `showOperatorChrome` prop (default true, upstream-safe) on AgentSidebar→AgentPanel→AssistantChat; staff-web `AppLayout` computes `isOperator` (session email ∈ root-loader `operatorEmails`) and passes it on the /gymos mount only.

**Verify post-deploy:** as operator → chat works, full chrome. As coach → no gear/Workspace/Feedback/model picker, just Chat + composer (with Act).
If chat STILL says "not configured" after the build is live → trace `appSecretExistsByKey` against the live gymos-demo DB (project `billowing-sun-51091059`; ANTHROPIC_API_KEY confirmed present, scope `user`/`support@myutik.com`).

---

## Part 2 — NEXT: Brand restyle (TWO brand systems)

### Decisions locked (2026-06-22)
1. **Owner-facing back-office (staff `/gymos/*`) = RunStudio brand** (the brand book: `docs/brand book/BRAND.md` + `tokens.css` — `--ink #14171C` / `--pulse #C8FF3D` / `--distance #0E5C50` / `--track #F3F1EA`; fonts Space Grotesk + Inter + Space Mono). Currently the staff app uses a generic shadcn HSL theme (`--studio-accent` orange) + the `app/skins/` system (hustle = burnt-orange `#ce6334`). Restyle the chrome to RunStudio brand.
2. **Customer-facing (forms, schedule, buy, video, content) = the GYM'S OWN brand**, sourced from the gym's site, so embeds drop into the gym's website seamlessly. Per-tenant, repeatable (HUSTLE first). See [[feedback_repeatable_per_client]] — do NOT hardcode to HUSTLE.
3. **Embeds stay iframe** (current `embed.js` → iframe model) **+ replicate the gym's brand inside** the iframe (font + colours + radius). Not inline/inherit.
4. **Brand capture = automated fetch-from-site**, designed as **config-time fetch → operator confirm/override → cache** into a per-deploy tenant-brand config (NOT silent runtime scraping). Future gyms: run the fetch against their URL.
5. **HUSTLE website URL = `doyouhustle.co.uk`** (confirmed by user).

### Technical map (from Explore agent — don't re-run)
Customer-facing surfaces are **standalone Nitro SSR HTML** (NOT React Router — root.tsx wraps RR in ClientOnly). Each builds its own inline `<style>`. Registered public in `server/middleware/00-public-cors.ts` + `server/plugins/auth.ts` publicPaths (`/embed`, `/f`, `/preview`, `/c`, `/v`).

| Surface | Route file | Renderer |
|---|---|---|
| Form | `server/routes/f/[...slug].get.ts`, `preview/[...slug].get.ts` | `features/forms/lib/public-form-ssr.ts` → `renderPublicForm` |
| Schedule widget | `server/routes/embed/schedule.get.ts` | `features/forms/lib/schedule-widget-ssr.ts` → `renderScheduleWidget` |
| Buy (Stripe) | `server/routes/embed/buy.get.ts` (+ .post, /thank-you) | `features/forms/lib/embed-buy-handler.ts` → `renderEmbedBuy` |
| Embed snippet | `server/routes/embed.js.get.ts` | `features/forms/lib/embed-snippet.ts` → `buildEmbedScript` |
| Video page | `server/routes/v/[...slug].get.ts` | `server/lib/public-video-ssr.ts` → `renderPublicVideo` (CSS poster, NOT real video; hardcodes "RunStudio" in caption — fix to gym name) |
| Content page | `server/routes/c/[...slug].get.ts` | `server/lib/public-content-ssr.ts` |

**Embed model:** `embed.js` scans host page for `[data-gymos-form]` / `[data-gymos-schedule]`, injects `<iframe>` → `/f/:slug?embed=1&accent=…&radius=…` etc. Base origin from `STAFF_WEB_URL` env (default `https://gym-class-os.vercel.app`). Auto-resize + events via postMessage. Pages set `CSP: frame-ancestors *`, CORS `*`.

**Current theming (the gaps):**
- Only **accent** is themeable, via `?accent=` URL param (from `data-accent` in snippet). **No per-tenant default → falls back to black `#000`.**
- **Fonts hardcoded Inter** on every public renderer (`@font-face` /fonts/inter-variable.woff2).
- **Video font hardcoded** in `features/video/GymPromo.tsx` (system-sans stack, ~lines 55/71/117/133/171). **`VideoSpec` (`server/lib/video-spec.ts`) has NO font field** — only per-scene `bgColor`. Player: `features/video/VideoPreviewPlayer.tsx` (@remotion/player). Remotion supports Google Fonts via `@remotion/google-fonts`.
- Existing skin system (`app/skins/config.ts` SkinName "default"|"hustle"; `app/skins/*.css` keyed `:root[data-studio=…]`; selected by env `GYMOS_STUDIO_SKIN`; root.tsx sets `data-studio` + theme-color) themes **ONLY the staff admin UI**, never the public surfaces. Logo slot exists but always null.

### What to BUILD (per-tenant customer brand)
Add ONE per-deploy **tenant-brand config** (font family + font URL/loader + colours {accent, maybe bg/text} + radius + logo + displayName), and feed it into ALL public renderers (`public-form-ssr.ts`, `schedule-widget-ssr.ts`, `embed-buy-handler.ts`, `public-video-ssr.ts`, `public-content-ssr.ts`) + the Remotion video (`GymPromo.tsx` via a new `VideoSpec` font field or config read). Replace the black accent fallback with the tenant default. Fix "RunStudio" → gym name in `public-video-ssr.ts`.

### NEXT STEP on resume
1. **Inspect `doyouhustle.co.uk`** (WebFetch) → extract their real font(s) + brand colour hex(es) + logo + radius; report extractability + whether the font is a Google/open font (loadable in iframe + Remotion) or licensed/custom (need file or approximate).
2. Then design the tenant-brand config shape + the config-time fetch+confirm step, and sequence the work: **schedule + forms first** (they go on the gym's site — user's priority), then **video font**, then buy/content. Owner-facing RunStudio chrome restyle is a parallel track.
3. Route implementation through GSD (`/gsd:quick` per task) per project CLAUDE.md.

### Caveats
- Colour auto-detection is heuristic (sites have many colours) → the confirm/override step is essential.
- Font licensing: Google/open font = load exactly in iframe + video; custom/licensed = need the woff2 from owner or approximate (embeds can match; video render needs the actual file).
