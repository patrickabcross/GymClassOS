# Forms Feature Fork Notes

## Source

Forked from `templates/forms/` — the upstream agent-native forms template.

**Fork rule:** Never edit `templates/forms/`. All GymClassOS-specific changes live in this directory.

## What Changed from Upstream

1. **Submission handler replaced** (`handlers/submissions.ts`): The generic `responses` insert was replaced with a gym-specific lead-upsert pipeline. A form submission now:
   - Upserts a `gym_members` row keyed by email or phone_e164
   - Re-selects the canonical member id after each upsert (FK-safety: the ON CONFLICT may hit an existing row whose id differs from the newly generated nanoid)
   - Upserts a `conversations` row with `status='lead'` (only resurrects from 'closed')
   - Re-selects the canonical conversation id after the conversations upsert
   - Writes a `messages` note (direction='in', messageType='text', body=form summary) so the coach sees lead context in /gymos
   - Writes a `form_submissions` row linking member + conversation + form
   - Also writes into `responses` (the fork's table) so the forms builder can list responses

2. **postMessage event renamed**: `{ type: "agent-native-feedback-submitted" }` → `{ type: "lead:submitted", formId: FORM_ID, responseId: id }`. Host pages receive a typed event they can dispatch to analytics.

3. **Height-resize postMessage added**: The iframe now fires `{ type: "gymos:resize", height: document.body.scrollHeight }` on load and after visibility changes. The parent `embed.js` (P1c-06) resizes the iframe accordingly.

4. **"Built with Agent Native" badge removed**: Replaced with nothing (GymClassOS branding decision).

5. **Sharing/ownableColumns dropped**: The upstream `forms` table uses `ownableColumns()` and has a `formShares` table for per-user/org sharing. The gym pilot is single-tenant; all forms are owned by the studio. `guard:allow-unscoped` markers applied.

6. **Integrations (Slack/Discord/Sheets) copied but NOT wired**: The `FormIntegration` type and `settings.integrations` array are preserved in types.ts, but `fireIntegrations` is not called in the gym submission handler. The conversations row serves as the notification mechanism.

7. **`appStatePut` call removed**: The upstream notifies the agent via `application_state`. For the gym, the `conversations` row with `status='lead'` surfacing in `/gymos` serves this purpose. Removed to avoid a dependency on the framework's application-state module in an anonymous context.

8. **URL-param theming added**: `?accent` (hex colour) and `?radius` (int px) are read from the request URL and injected as sanitized CSS custom properties `--accent` / `--radius` into the SSR HTML output. Sanitizer helpers `sanitizeHexColor` and `sanitizeIntPx` are exported for reuse by the schedule widget (P1c-05).

## Rate-limit Caveat

The per-IP in-memory rate limiter in `lib/rate-limit.ts` uses a `Map` that lives in process memory. On Fly.io (single always-on machine), this is effective. If staff-web is ever moved to Vercel serverless functions, each cold start is a fresh process and the Map resets — the rate limiter becomes best-effort only. Upgrade to **Vercel KV** (a durable shared store) if flooding materialises on Vercel.

## messageType Used for Lead Note

Lead notes use `messageType: 'text'` (NOT a new enum value). The form context is stored in `payload` as `{ kind: 'form_submission', formId, data }`. This avoids needing a new DB migration for a `'form_submission'` enum value — the existing `messages.messageType` enum is `["text","template","image","audio","video","document"]`.

## f/:slug Nitro Routing

The `server/routes/f/[...slug].get.ts` Nitro resource route handles all `/f/*` paths explicitly. Nitro routes files are matched before the React Router app catch-all at `server/routes/[...page].get.ts` because more-specific paths win. The `f/` nesting ensures no collision.

## Fork Boundary

- This directory: `apps/staff-web/features/forms/` — all GymClassOS customisations
- Schema: `apps/staff-web/server/db/forms-schema.ts` — forked `forms` + `responses` tables (no ownableColumns)
- Server routes: `apps/staff-web/server/routes/f/`, `apps/staff-web/server/routes/api/submit/`, `apps/staff-web/server/routes/api/forms/public/`
- Upstream: `templates/forms/` — untouched; upstream merges flow cleanly
