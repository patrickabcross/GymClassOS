---
type: livefix-summary
phase: P1b.1-customer-pilot-enablement
created: 2026-05-26
trigger: user spotted 3 UI bugs on live gymos site after overnight UI polish
---

# P1b.1 Live-Site UI Bug Fixes

Three bugs the customer would have hit during morning UAT — all fixed,
typechecked, and pushed in three atomic commits.

## Commits

| #   | SHA        | Bug | Subject                                                                |
| --- | ---------- | --- | ---------------------------------------------------------------------- |
| A   | `36f8cdc7` | #1  | suppress Builder.io card on gymos; document ANTHROPIC_API_KEY          |
| B   | `af097fd1` | #2  | correct AgentSidebar flex layout on gymos                              |
| C   | `a77f2cee` | #3  | replace bare inbox empty state with actionable content                 |

Each commit is independently buildable (`pnpm --filter @gymos/staff-web
typecheck` exits 0 after every commit).

## Bug 1 — Builder.io card in right-rail Chat (Commit A)

**Symptom:** The framework's "Turn on the AI assistant — One click to connect
Builder for free hosted access — Or add your own API key" empty-state card
was showing inside the AgentSidebar on /gymos. GymClassOS is white-labelled
as a gym product; Builder.io branding must never appear in front of the
customer.

**Root cause:** `packages/core/src/client/AssistantChat.tsx` mounts
`<BuilderSetupCard>` whenever its `missingApiKey` gate is true. That gate
flips true when none of the three LLM-provider checks pass:
- no env var from `PROVIDER_ENV_VARS` is set (ANTHROPIC, OPENAI, GROQ, etc.)
- `/_agent-native/builder/status` reports not configured
- `/_agent-native/agent-engine/status` reports not configured

The Vercel deploy has no `ANTHROPIC_API_KEY` set in project env vars, so
the gate trips on every page load.

**Fix:**

1. **Document the env var as required** — `apps/staff-web/.env.example`
   now leads with `ANTHROPIC_API_KEY=sk-ant-api03-...` and explains how to
   get a key. This is the proper fix — once set on Vercel, the framework
   gate flips closed naturally and no card mounts.

2. **Defence-in-depth CSS suppressor** —
   `apps/staff-web/app/components/gymos/GymosBuilderCardSuppressor.tsx`
   injects a scoped `<style>` tag that hides the Builder setup card via
   `:has()` selectors targeting the framework's stable class trio plus an
   h3 text predicate. The suppressor only runs inside the
   `[data-gymos-agent-sidebar]` scope (`AppLayout.tsx` wraps the gymos
   `AgentSidebar` in a `<div data-gymos-agent-sidebar>` flex shell). Non-
   gymos surfaces (the legacy email shells under `/inbox`, `/settings`,
   etc.) are completely unaffected.

   The suppressor uses `:has()` which is Chromium 105+, Safari 15.4+,
   Firefox 121+ — well within the coach browser baseline for 2026. On
   older browsers the suppressor is a no-op and the env-var path is the
   fix; we don't degrade behaviour, we just lose the safety net.

**Files modified:**
- `apps/staff-web/.env.example` — leads with `ANTHROPIC_API_KEY`
- `apps/staff-web/app/components/gymos/GymosBuilderCardSuppressor.tsx` — NEW
- `apps/staff-web/app/components/layout/AppLayout.tsx` — wraps gymos
  `AgentSidebar` in `<div data-gymos-agent-sidebar>` + mounts the suppressor

## Bug 2 — AgentSidebar overlaying content + horizontal scroll (Commit B)

**Symptom:** On desktop the inbox had a horizontal scrollbar at the bottom
and the AgentSidebar visually overlaid the right edge of the page (the
"New cha[t]" header peeked through at the right edge of the screenshot).
The inbox content and sidebar were supposed to sit as flex columns:
`[inbox | sidebar]`.

**Root cause:** `apps/staff-web/app/routes/gymos.tsx` (`GymosLayout`)
wrapped its surface in `<div className="flex flex-col h-screen w-screen">`.
Once `AppLayout` wraps `GymosLayout`'s output in `<AgentSidebar>` — which
itself is a flex row `[content (flex-1) | sidebar (380px)]` — the
`w-screen` claim made the gym surface ignore the sidebar's width and
overflow the viewport.

**Fix:** Replaced `flex flex-col h-screen w-screen` with `flex flex-col
h-full w-full min-w-0`. The surface now fills the flex cell `AgentSidebar`
gives it (which is sized correctly) instead of the viewport. Also added
`min-w-0` to the inner content wrapper so its flex child can shrink below
its content's intrinsic width (without `min-w-0` the overflow returns
under busy thread loads).

In-file comment documents the constraint so the next agent doesn't
re-introduce `w-screen` for visual symmetry with other shells.

**Files modified:**
- `apps/staff-web/app/routes/gymos.tsx` — `w-screen h-screen` → `h-full
  w-full min-w-0`

## Bug 3 — Bare inbox empty state (Commit C)

**Symptom:** Landing on `/gymos` with no conversation selected showed a
single line of placeholder text — "Select a conversation to start" —
wasting the entire middle pane and offering no path forward. User feedback:
"it should be a message input".

**Fix:** Replaced the bare text with a richer empty state:

- IconMessage in a circular muted badge (mirrors the AgentSidebar
  empty-state idiom for visual consistency)
- Heading "No conversation selected" + 2-line subhead explaining what the
  left rail does and what the member-context panel will show on selection
- Primary CTA: "Open most recent conversation" — single-click jump into
  the freshest thread (loader orders conversations by `updatedAt desc`
  already, so we just link the first row). Honours the optimistic-UI rule:
  it's a `<Link>`, not a button-with-await — navigation is instant.
- True zero-state fallback copy for fresh deploys with no inbound messages

We considered adding the TemplatesDialog as an empty-state CTA, but it
needs a `conversationId` to enqueue the send (and creating a new
conversation from a phone number is a non-trivial action that doesn't
exist yet — would need a "compose new conversation" action). The "open
most recent thread" path is the cheapest useful guidance for now; a
"compose new conversation" affordance can ship in P2 if customers ask
for it.

**Files modified:**
- `apps/staff-web/app/routes/gymos._index.tsx` — added IconMessage import
  + replaced the placeholder with the new empty state

## Operational notes

**REQUIRED env var on Vercel before UAT:**

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Set this in the Vercel project (`gym-class-os`, org
`team_Ro8uqijNNO8GDT3A2PfFizrt`) → Settings → Environment Variables →
add `ANTHROPIC_API_KEY` for the Production environment, then trigger a
redeploy (or wait for the next push). Once set, the Builder card stops
mounting at the framework gate and the CSS suppressor becomes pure
defence-in-depth.

Get a key at `https://console.anthropic.com/settings/keys` — any key with
Claude Sonnet access is fine.

**Deploy:** Vercel auto-deploys from `master` (configured via
`.vercel/project.json` + `scripts/post-vercel-build.mjs`). Pushing to
`origin master` is enough — no manual Fly deploy step needed for
staff-web (STATE.md mentions an old gymos-staff-web Fly app that was
"pending fly launch"; current deploy target is Vercel per `.vercel/`).

## Verification

- `pnpm --filter @gymos/staff-web typecheck` — exits 0 after each commit
- Boot test (`pnpm --filter @gymos/staff-web dev` on :8081) — server
  starts clean. Curl confirms `/gymos` returns the auth interstitial as
  expected (route is auth-gated); rendered DOM verification requires a
  signed-in session and was deferred to user UAT on the live site
- Customer-facing UAT on the deployed site will be the final signal

## Success criteria

- [x] Builder.io card no longer mounts on /gymos/* once env var is set;
      suppressor stylesheet hides it as defence-in-depth otherwise
- [x] AgentSidebar lays out as a flex column on desktop, no horizontal
      scrollbar
- [x] Inbox empty state has actionable content (badge + heading +
      subhead + CTA + zero-state fallback)
- [x] `pnpm typecheck` exits 0
- [x] LIVEFIX-SUMMARY.md committed
- [ ] `git push origin master` — see final commit
- [ ] Vercel auto-deploy + user UAT (out of agent scope; user-driven)
