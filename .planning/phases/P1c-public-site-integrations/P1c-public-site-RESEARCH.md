# Phase P1c: Public Site Integrations — Research

**Researched:** 2026-06-01
**Domain:** Embeddable forms fork + public schedule widget + lead-funnel + Stripe Hosted Checkout + cross-origin embed plumbing
**Confidence:** HIGH (all findings verified against live codebase; upstream template fully read)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Forms location:** Fork `templates/forms/` co-located inside staff-web: `apps/staff-web/features/forms/` (NOT a standalone `apps/forms/`). Forms editor lives behind the same staff login; public pages served from the same Vercel app; no 4th deployable.
- **Booking auth model:** Lead funnel, NOT anonymous self-serve. Visitor submits form → lead lands in `/gymos` as `status='lead'` conversation → staff contacts via WhatsApp → booking + payment completes via Stripe hosted Checkout link sent to the now-known lead. No anonymous instant book-and-pay.
- **Theming:** URL-param theming only (`?accent=#000&radius=8`). No full CSS-variable token injection in P1c.
- **Stripe approach:** Hosted Checkout (redirect to Stripe-hosted page), NOT embedded Payment Element. Reuses P1b-07 reducer for Checkout→pass binding.
- **Embed mechanism:** Real `<script>` snippet (not iframe-only) that injects the iframe. `postMessage` for cross-origin callbacks (`lead:submitted`, `enquiry:created`).

### Claude's Discretion

- Whether leads surface as a sibling `/gymos/leads` tab vs inline in `/gymos` with a `status='lead'` filter — planner/UI decides, favouring the cleaner inbox.
- Exact bot-protection mechanism (rate-limit only vs + lightweight CAPTCHA).
- Server-render vs CSR split for the public `/embed/schedule` route (SEO favours SSR per CLAUDE.md public-page rule).
- Atomic capacity handling: with the lead-funnel model, the binding booking happens on Checkout success via the P1b-07 reducer (PITFALL #4 pass-balance race in scope there).

### Deferred Ideas (OUT OF SCOPE)

- Fully anonymous self-serve book-and-pay widget (stranger picks slot + pays with no studio contact).
- Full CSS-variable theme-token injection.
- Embedded Stripe Payment Element (in-widget card form).
- Email-verification gate before lead submission.
</user_constraints>

<phase_requirements>
## Phase Requirements

The following requirement IDs are proposed for registration in REQUIREMENTS.md (new, not yet registered). The planner MUST add these at the start of the first plan wave.

| ID | Description | Research Support |
|----|-------------|------------------|
| FORMS-01 | Fork `templates/forms/` into `apps/staff-web/features/forms/` — copy schema, builder pages, field-renderer, public-form-ssr, submission handler, and auth plugin `publicPaths` into staff-web; adapt Drizzle config to use the existing staff-web `getDb()` | Forms template architecture section below |
| FORMS-02 | Forms builder UI accessible at `/gymos/forms` (staff-only, behind auth) — create, edit, publish, archive forms; view responses | Builder page pattern section below |
| FORMS-03 | Public form submission → lead upsert — POST to `/api/submit/:id` (public, CORS-open) upserts `gym_members` keyed by email/phone, opens/upserts a `conversations` row with `status='lead'`, writes a `form_submission_source` note in `messages` | Lead upsert pattern section below |
| FORMS-04 | `<script>` embed snippet at `/embed.js` that injects a styled iframe for any `/f/:slug` form; `postMessage` `lead:submitted` callback from the iframe to the parent page on successful submission | Cross-origin section below |
| EMBED-01 | Server-rendered public `/embed/schedule` route — reads `class_occurrences` anonymously (no auth gate), returns HTML with inline CSS + URL-param theming (`?accent`, `?radius`) | Schedule SSR section below |
| EMBED-02 | URL-param theming applied to `/embed/schedule` and `/f/:slug` forms — `?accent` (hex colour) + `?radius` (px border-radius) injected as CSS custom properties into the SSR output | Theming section below |
| EMBED-03 | "Enquire / request to book" CTA on schedule widget — clicking a class slot opens an inline lead form (name + email + phone) or links to a published form; submission creates a `status='lead'` conversation | Lead CTA section below |
| EMBED-04 | `<script>` snippet at `/embed.js` supports both form and schedule embeds via `data-type="form|schedule"` attribute; `postMessage` callbacks: `lead:submitted`, `enquiry:created`; origin-check on parent window | Cross-origin section below |
| EMBED-05 | Stripe Hosted Checkout link generation action (`create-checkout-link`) — staff or an authenticated future self-serve flow calls it with `memberId` + `priceId`; session metadata includes `memberId` so P1b-07 reducer binds the pass correctly | Stripe section below |
| EMBED-06 | End-to-end smoke test: embed form on a throwaway page, submit from a clean browser, verify lead appears in `/gymos` with `status='lead'`; embed schedule widget, click enquiry, verify same lead path | Manual test plan section below |
</phase_requirements>

---

## Summary

P1c forks the upstream `templates/forms/` template into `apps/staff-web/features/forms/` (co-located, no new deployable) and adds a public `/embed/schedule` widget. The core insight from inspecting the template is that **most of the hard work is already done**: the forms template ships a production-quality SSR form renderer (`server/lib/public-form-ssr.ts`), a CORS middleware (`server/middleware/00-public-cors.ts`), a honeypot + time-based bot check + optional Cloudflare Turnstile captcha, and `postMessage` callbacks for the embedded case. The fork is primarily (a) wiring it into staff-web's auth/DB layer, (b) replacing the generic submission handler with a gym-specific lead upsert that writes `gym_members` + `conversations`, and (c) writing the `<script>` embed snippet and the schedule widget.

The lead-funnel model (Decision 2) dramatically simplifies P1c: no anonymous booking transaction atomicity, no pass-debit race at widget time (booking only happens later via the P1b-07 reducer on Checkout success). The schedule widget is read-only browse + "enquire", and the Stripe Checkout link is staff-generated for the now-identified lead. PITFALL #3 (atomic capacity) is deferred to the Checkout reducer; PITFALL #4 (pass-balance race) is already handled by P1b-07.

**Primary recommendation:** Fork the forms template as a feature slice (not a separate app), adapt the submission handler to upsert leads, add the `conversations.status='lead'` column additive migration, add a minimal SSR schedule widget, and ship the `<script>` snippet. Total scope is approximately 4–5 plan units (Wave 0: schema migration; Wave 1: forms fork + submission → lead; Wave 2: schedule widget + theming; Wave 3: embed.js + postMessage; Wave 4: Stripe checkout-link action + e2e test).

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React Router v7 (framework mode) | `^7.13.x` | Routing + SSR for public `/f/:slug` + `/embed/schedule` | Already the staff-web framework; public routes are standard RR v7 resource routes |
| Drizzle ORM | `^0.45.x` | DB queries for lead upsert + form CRUD | Already in staff-web; `getDb()` is the single import point |
| `@neondatabase/serverless` | `^1.1.x` | DB driver (Neon HTTP) | Already configured; staff-web uses HTTP driver on Vercel |
| H3 | `^2.0.x` | Server runtime for Nitro middleware | CORS middleware (`00-public-cors.ts`) runs in H3 event handler context |
| Nanoid | `^5.1.x` | IDs for form_submission rows, lead conversation rows | Already in staff-web |
| shadcn/ui + Radix | latest CLI | Form builder UI components | Already in staff-web; builder page is a staff-only React page |
| Tabler Icons (`@tabler/icons-react`) | latest | Icons in forms builder | CLAUDE.md mandate; forms template already uses Tabler |
| Zod | `^4.x` | Validation of form submission POST body, URL params | Already in staff-web |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Cloudflare Turnstile (optional) | CDN / `VITE_TURNSTILE_SITE_KEY` env | CAPTCHA for public form submission | Optional; upstream template supports it; for P1c decision: start without (rate-limit + honeypot is enough), add if spam hits |
| `date-fns` + `date-fns-tz` | `^4.1.x` | Schedule widget date rendering in studio timezone | Already in staff-web |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Honeypot + time-based bot check | Full CAPTCHA (Turnstile / reCAPTCHA) | CAPTCHA adds friction (hurts conversion on lead forms); honeypot is invisible and effective against naive bots. For a pilot with low traffic, honeypot is the right call. Enable Turnstile via env var when spam materialises. |
| Hosted Checkout redirect | Embedded Payment Element | Embedded Element is more integrated UX but requires client-side JS, PCI attestation complexity, and ~3x more implementation work. Hosted Checkout is the correct P1c choice per CONTEXT.md Decision 4. |
| Status column on conversations | Separate `leads` table | Separate table adds join complexity and diverges from the existing inbox model. Additive `status='lead'` is simpler and keeps the inbox query unified. |

---

## Architecture Patterns

### Recommended Project Structure

The fork goes into `apps/staff-web/features/forms/` following the same discipline as `apps/staff-web/features/inbox/`:

```
apps/staff-web/
├── features/
│   └── forms/
│       ├── FORMS.md              # fork notes (what changed from upstream)
│       ├── components/
│       │   ├── builder/          # FieldRenderer.tsx + FieldPropertiesPanel.tsx (copied)
│       │   └── FormsNav.tsx      # tab in GymosTopNav
│       └── lib/
│           ├── public-form-ssr.ts    # copied + adapted (gym lead upsert hook)
│           └── validate-fields.ts   # copied unchanged
├── server/
│   ├── db/
│   │   └── schema.ts             # additive: conversations.status enum extended + form_submissions table
│   ├── middleware/
│   │   └── 00-public-cors.ts     # NEW: copied from templates/forms/; covers /api/submit/* + /api/forms/public/* + /embed.js + /embed/schedule
│   ├── routes/
│   │   ├── api/
│   │   │   ├── forms/
│   │   │   │   └── public/[...slug].get.ts   # NEW: public form GET (no auth)
│   │   │   └── submit/
│   │   │       └── [id].post.ts              # NEW: public form POST → gym lead upsert
│   │   ├── embed.js.get.ts                   # NEW: <script> snippet
│   │   └── embed/
│   │       └── schedule.get.ts               # NEW: SSR schedule widget
└── app/
    └── routes/
        ├── gymos.forms._index.tsx            # NEW: forms list (staff, behind auth)
        └── gymos.forms.$id.tsx               # NEW: form builder (staff, behind auth)
```

### Pattern 1: Forms Template Fork Boundary

**What:** Copy files out of `templates/forms/` into `apps/staff-web/features/forms/`; never edit in `templates/forms/`.

**The key files to copy and adapt:**

| Upstream file | Destination | Adaptation needed |
|---|---|---|
| `server/lib/public-form-ssr.ts` | `features/forms/lib/public-form-ssr.ts` | Replace generic submit path; inject gym lead-upsert call after successful DB insert; add `postMessage` event `lead:submitted` |
| `server/lib/validate-fields.ts` | `features/forms/lib/validate-fields.ts` | Copy unchanged |
| `server/middleware/00-public-cors.ts` | `server/middleware/00-public-cors.ts` | Extend `PUBLIC_EMBED_PREFIXES` to also include `/embed.js` and `/embed/schedule`; copy the H3 CORS structure unchanged |
| `server/plugins/auth.ts` → `publicPaths` | `server/plugins/auth.ts` | Add paths to existing `createAuthPlugin({ publicPaths })` (NOT replace) |
| `shared/types.ts` | `features/forms/types.ts` | Copy unchanged (FormField, FormSettings, etc.) |
| `app/components/builder/FieldRenderer.tsx` | `app/components/forms/FieldRenderer.tsx` | Copy; replace `@agent-native/core/client` imports with staff-web equivalents |
| `app/components/builder/FieldPropertiesPanel.tsx` | `app/components/forms/FieldPropertiesPanel.tsx` | Copy; replace imports |
| `app/pages/FormBuilderPage.tsx` | `app/routes/gymos.forms.$id.tsx` | Adapt as RR v7 route (add `loader` + `action`); strip agent-native AgentToggleButton / ShareButton (not needed in pilot) |
| `app/pages/FormsListPage.tsx` | `app/routes/gymos.forms._index.tsx` | Adapt as RR v7 route with `loader` |

**Schema additions needed** (additive only — two changes):

1. **Extend `conversations.status` enum** — add `'lead'` variant. Because Drizzle text enums on Postgres are not real PG enums (they are CHECK constraints), the migration is `ALTER TABLE conversations ADD CONSTRAINT ... CHECK (status IN ('open','closed','snoozed','lead'))` — or more practically, since the existing constraint may be a Drizzle-generated one, write a migration that drops the old check and adds a new one inclusive of `'lead'`. Verify the existing constraint name before writing the migration.

2. **Add `form_submissions` table** — not strictly required (a `messages` row with `messageType='form_submission'` would work), but an explicit table makes response querying unambiguous:
   ```typescript
   export const formSubmissions = table("form_submissions", {
     id: text("id").primaryKey(),
     formId: text("form_id").notNull(),
     memberId: text("member_id"),          // FK gym_members.id — set after lead upsert
     conversationId: text("conversation_id"), // FK conversations.id
     data: text("data").notNull(),          // JSON: field responses
     submittedAt: text("submitted_at").notNull().default(now()),
     ip: text("ip"),
     submitterEmail: text("submitter_email"),
   });
   ```
   Alternatively: skip this table and use the upstream `responses` table (same schema) — but that table is tied to the `forms` FK which needs to exist. Decision for planner: if the forms table is forked into staff-web, reuse the upstream `responses` table pattern; if not, the `form_submissions` table above is cleaner.

### Pattern 2: Public Form Submission → Lead Upsert

**What:** The gym-specific submission handler replaces the upstream generic `responses` insert with:

1. Extract `email` and/or `phone` from the submitted field values (fields of type `email` / `text` that match label patterns like "email", "phone", "mobile").
2. Upsert `gym_members` keyed by email (if present) or phone (if present):
   ```sql
   INSERT INTO gym_members (id, first_name, email, phone_e164, marketing_consent, created_at, updated_at)
   VALUES (...)
   ON CONFLICT (email) DO UPDATE SET
     first_name = EXCLUDED.first_name,
     phone_e164 = COALESCE(EXCLUDED.phone_e164, gym_members.phone_e164),
     updated_at = NOW()
   RETURNING id
   ```
   Note: `gym_members` currently has no UNIQUE constraint on `email` or `phone_e164`. The migration must add `UNIQUE(email)` (nullable unique — handle NULL correctly in Postgres: use a partial unique index `WHERE email IS NOT NULL`).

3. Upsert `conversations` for the lead member:
   ```sql
   INSERT INTO conversations (id, member_id, channel, status, created_at, updated_at)
   VALUES (nanoid(), :memberId, 'whatsapp', 'lead', NOW(), NOW())
   ON CONFLICT (member_id, channel) DO UPDATE SET
     status = CASE
       WHEN conversations.status = 'closed' THEN 'lead'
       ELSE conversations.status
     END,
     updated_at = NOW()
   RETURNING id
   ```
   Note: `conversations` currently has no UNIQUE constraint on `(member_id, channel)`. The migration needs to add one.

4. Write a `messages` row with `messageType='form_submission'` (or a new enum value `'lead_form'`) so the coach sees what form the lead submitted, with the form title + submitted fields summarised in `body`.

5. Return `{ success: true, id: responseId }` as the upstream does — the iframe/postMessage path reads this.

**CRITICAL:** The upsert code must run in `runWithRequestContext` even though the endpoint is public, because the framework may enforce context. Actually, looking at the upstream `submitForm` handler, it does NOT use `runWithRequestContext` for the submission itself (the form is public and `responses` has no `ownableColumns`). The gym lead tables also have `guard:allow-unscoped` markers (confirmed in staff-web AGENTS.md: "gym domain tables do NOT use `ownableColumns()` — they are single-tenant by design"). So `runWithRequestContext` is NOT needed for the lead-upsert path.

### Pattern 3: CORS Middleware (Nitro file-prefix ordering)

**What:** The CORS middleware must run BEFORE the auth plugin middleware on public routes. The upstream forms template achieves this with the `00-` filename prefix in `server/middleware/`. This ensures OPTIONS preflight returns 204 before the auth guard can redirect it to the login page.

**How it works in staff-web:**
- Nitro loads middleware files in filesystem alphabetical order. The `00-public-cors.ts` prefix guarantees it runs first.
- Extend `PUBLIC_EMBED_PREFIXES` in the copied middleware to cover `/api/submit/`, `/api/forms/public/`, `/embed.js`, and `/embed/schedule`.
- The `Access-Control-Allow-Origin: *` is appropriate for public form submission and schedule viewing.

**auth.ts publicPaths update (additive):**
```typescript
publicPaths: [
  "/api/m",
  "/pick-member",
  "/webhooks/whatsapp",
  "/access-denied",
  // P1c additions:
  "/f",              // public form pages (SSR rendered)
  "/api/forms/public", // public form GET
  "/api/submit",     // public form POST (no auth needed — lead upsert only)
  "/embed",          // /embed/schedule and /embed.js
],
```

### Pattern 4: Public Form SSR (server route, not RR v7 React route)

**What:** The upstream `/f/:slug` route renders a full standalone HTML page via a Nitro server route (NOT a React Router page), using the `renderPublicForm` function from `server/lib/public-form-ssr.ts`. This is correct for P1c because:
- The form page loads in an iframe; it does not need React hydration.
- The rendered HTML is self-contained with inline CSS and vanilla JS.
- CSP `frame-ancestors *` is set so any domain can embed it.

**Implementation:** Add a Nitro server route `server/routes/f/[...slug].get.ts` that delegates to `renderPublicForm()`. The existing upstream pattern is exactly this.

**Key security note from the upstream code:** `safeRedirectUrl()` validates that any `settings.redirectUrl` is `http:` or `https:` — prevents `javascript:` XSS via publisher-controlled redirect. Copy this function exactly.

### Pattern 5: Schedule Widget SSR Route

**What:** `/embed/schedule` is a server-rendered HTML page (same pattern as the form SSR). No React Router component. Returns a standalone HTML page with inline CSS, reads `class_occurrences` + `class_definitions` from Neon, and renders a week's class grid.

**Theming via URL params:**
```typescript
const accent = sanitizeHexColor(url.searchParams.get("accent") ?? "#000000");
const radius = sanitizeIntPx(url.searchParams.get("radius") ?? "6");
// Inject into <style>:
// :root { --accent: ${accent}; --radius: ${radius}px; }
```

`sanitizeHexColor` must validate against `/^#[0-9a-fA-F]{6}$/` and reject arbitrary strings (prevents CSS injection). `sanitizeIntPx` clamps to 0–32px.

**SSR vs CSR decision:** Per CLAUDE.md "SSR for public pages, CSR for logged-in pages" — the schedule widget MUST be server-rendered. The embed URL will be indexed by the studio's own marketing site analytics; keeping it SSR means link-preview metadata works and robots don't need JS. The widget is read-only; no hydration needed. Vanilla JS handles the "Enquire" CTA form inline.

**"Enquire / request to book" CTA:** Clicking a class card shows an inline mini-form (name + email + phone) rendered in the same standalone HTML page. Submitting it POSTs to `/api/submit/:formId` (using a special "schedule enquiry" form created by the studio in the forms builder) OR directly to a dedicated `/api/enquiry/:occurrenceId` endpoint. The simpler approach for P1c: create a default "Schedule Enquiry" form at install time (Wave 0) and hardcode that form's slug in the widget. The POST still goes through the lead-upsert handler.

### Pattern 6: `<script>` Embed Snippet (`/embed.js`)

**What:** A server route at `/embed.js` returns JavaScript that studio staff paste into `doyouhustle.co.uk`:

```html
<!-- Embed a lead-capture form -->
<div data-gymos-form="trial-signup" data-accent="#ff5733" data-radius="8"></div>
<script src="https://gym-class-os.vercel.app/embed.js" async></script>

<!-- Embed the schedule widget -->
<div data-gymos-schedule data-accent="#ff5733"></div>
<script src="https://gym-class-os.vercel.app/embed.js" async></script>
```

The script:
1. Finds all `[data-gymos-form]` elements → creates iframes pointing to `/f/<slug>?accent=...&radius=...`
2. Finds all `[data-gymos-schedule]` elements → creates iframes pointing to `/embed/schedule?accent=...`
3. Sets `iframe.style.border=none`, `width=100%`, initial height.
4. Listens for `window.message` events from the iframes (with origin check against the staff-web domain).
5. Re-dispatches `lead:submitted` and `enquiry:created` as CustomEvents on the host page for analytics integrations.

**Origin check:** The `postMessage` listener in embed.js validates `event.origin === "https://gym-class-os.vercel.app"` before processing. The iframe sends events targeting `window.parent` with the parent origin (`*` is acceptable for the initial implementation since the form page cannot know the parent origin ahead of time, but the receiver on the parent side SHOULD check the source origin matches the known staff-web domain).

**postMessage event payload from the form page (sent on success):**
```javascript
window.parent.postMessage({ type: "lead:submitted", formId: FORM_ID, responseId: id }, "*");
```
The current upstream sends `{ type: "agent-native-feedback-submitted" }`. The gym version replaces this with the `lead:submitted` event shape.

**Height auto-resize:** The iframe sends `{ type: "gymos:resize", height: document.body.scrollHeight }` and the parent embed.js sets `iframe.style.height = data.height + "px"`. This is the standard cross-origin iframe resize pattern.

### Pattern 7: Stripe Hosted Checkout Link (EMBED-05)

**What:** Staff generates a Checkout link for a contacted lead and sends it via WhatsApp. The link redirects to Stripe's hosted Checkout page. On completion, the P1b-07 reducer fires.

**Critical — metadata the P1b-07 reducer depends on:**
From inspecting `checkout-session-completed.ts`:
```typescript
const memberId = (fullSession.metadata?.memberId as string | undefined) ?? null;
```
The reducer reads `session.metadata.memberId`. If this is absent, `memberId` is null and no pass is granted (the payment row is still inserted but unlinked). Therefore, **the Checkout session creation action MUST include `metadata: { memberId }`**.

**Action signature (defineAction pattern):**
```typescript
// apps/staff-web/actions/create-checkout-link.ts
defineAction({
  name: "create-checkout-link",
  http: { method: "POST" },
  parameters: z.object({
    memberId: z.string(),
    priceId: z.string(),           // Stripe Price ID from product catalog
    productName: z.string(),       // display name for pass
  }),
  handler: async ({ memberId, priceId, productName }) => {
    const stripe = await getStripeClient(); // reads pgcrypto secret
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { memberId },       // CRITICAL for P1b-07 reducer
      success_url: `${process.env.STAFF_WEB_URL}/gymos/members/${memberId}?checkout=success`,
      cancel_url:  `${process.env.STAFF_WEB_URL}/gymos/members/${memberId}?checkout=cancelled`,
    });
    return { url: session.url };
  },
});
```

**Integration with P1b-07:** The reducer already handles `checkout.session.completed`. For P1c, the Checkout flow is: staff creates session (with `memberId`) → sends URL to lead via WhatsApp (through `sendMessage` chokepoint) → lead pays → webhook fires → reducer grants pass + links to member. No code changes needed to the reducer itself.

**Line item → pass credits:** The existing `passCreditsForLineItem()` function in the reducer matches by description string pattern (`"10-pack"`, `"5-pack"`, `"1-class"`). To make P1c bookings bind correctly, the Stripe Product description for each pass product MUST include one of these keywords. Document this as a configuration requirement for the studio's Stripe account setup.

### Anti-Patterns to Avoid

- **Editing templates/forms/ directly** — violates the fork boundary; P1c must copy files out, never edit upstream.
- **Creating a 4th deployable (`apps/forms/`)** — locked out by CONTEXT.md Decision 1; everything goes in staff-web.
- **Widening `/_agent-native/*` public paths** — the CORS middleware covers only the form submission paths; never add `/_agent-native/` to public paths.
- **Anonymous booking transaction at widget time** — the lead-funnel model means no booking row is written at form submission time. The booking happens only after the Stripe Checkout webhook fires (P1b-07). Writing a speculative booking row at enquiry time creates orphaned rows and complicates capacity logic.
- **Trusting `submitterEmail` from the client as verified identity** — the upstream template explicitly marks this as "claimed, not verified". For the gym, the email/phone collected in the form is how the lead gets a WhatsApp message; staff sends it and verifies via conversation.
- **Running `runWithRequestContext` on the public submission endpoint** — not needed (gym tables have `guard:allow-unscoped`), and if the framework requires a user session it would break anonymous submitters. Check the actual `createAuthPlugin` middleware contract for whether unauthenticated requests reaching `/api/submit/*` get `runWithRequestContext` injected.
- **Setting `conversations.status` to `'lead'` via a Drizzle schema enum** — currently `conversations.status` has enum `["open", "closed", "snoozed"]`. Adding `"lead"` requires an additive migration that adds the value to the CHECK constraint. The column itself is `text("status", { enum: [...] })` which in Postgres is a CHECK constraint, not a PG ENUM type. Adding to a CHECK constraint requires dropping and re-creating it; this is additive at the data level (no rows deleted) but care is needed in the migration SQL.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form field rendering + validation | Custom field component library | Fork `FieldRenderer.tsx` + `FieldPropertiesPanel.tsx` from templates/forms/ | The upstream implementation handles 11 field types including conditional visibility, ratings, and scale sliders — all edge-cased |
| Bot protection | Custom IP-rate-limit store | Upstream honeypot (`_hp` field) + time-to-submit check (`_t` timestamp) — already in the submission handler | These two checks catch 90% of naive bots with zero friction for real users |
| SSR HTML form renderer | React component with hydration | `renderPublicFormHtml()` from `public-form-ssr.ts` | The upstream SSR renderer handles all 11 field types, conditional visibility, theme variables, CAPTCHA integration, and XSS escaping. ~700 lines of tested, battle-hardened HTML generation — copying it is far safer than rebuilding. |
| Cross-origin iframe height resize | Custom ResizeObserver + hash-based messaging | Standard `postMessage { type: "gymos:resize", height }` pattern | The upstream already has this; iframes cannot resize themselves, the standard pattern requires postMessage to the parent |
| Stripe signature verification | Custom HMAC | `stripe.webhooks.constructEvent()` (already in P1b-07, not touched by P1c) | P1c does not add new webhook handlers; Checkout link generation is one-way |
| CSS injection sanitization | Ad-hoc regex | `sanitizeHexColor()` + `sanitizeIntPx()` helpers (< 5 lines each) | Without these, `?accent=url(javascript:...)` would be injected into the page CSS — XSS via URL param |

**Key insight:** The upstream `templates/forms/` template has already solved the hard form-rendering problems. P1c's value is the gym-specific submission → lead pipeline, not re-implementing form rendering.

---

## Runtime State Inventory

> This is a greenfield addition within an existing codebase — no rename/refactor involved. Skip category audit.

None applicable — P1c adds new tables and routes. No existing runtime state is being renamed or migrated.

---

## Common Pitfalls

### Pitfall 1: `conversations.status` enum missing `'lead'` breaks insert at runtime

**What goes wrong:** The Drizzle schema has `status: text("status", { enum: ["open", "closed", "snoozed"] })`. Writing `status: 'lead'` via Drizzle insert compiles fine (TypeScript may not catch it depending on how enums are typed) but Postgres CHECK constraint rejects it at runtime with a constraint violation error.

**Why it happens:** Drizzle `text(..., { enum: [...] })` generates a CHECK constraint in Postgres. Adding a new value requires a migration that drops the old constraint and adds a new one.

**How to avoid:** Write the migration first (Wave 0). Pattern:
```sql
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_status_check
  CHECK (status IN ('open', 'closed', 'snoozed', 'lead'));
```
Then update the Drizzle schema definition to include `'lead'` in the enum array.

**Warning signs:** `ERROR: new row for relation "conversations" violates check constraint` in logs.

### Pitfall 2: Missing UNIQUE constraint on `gym_members.email` breaks the lead upsert

**What goes wrong:** The lead upsert tries `ON CONFLICT (email)` but no unique index exists on `gym_members.email`. Postgres raises `there is no unique or exclusion constraint matching the ON CONFLICT specification`.

**Why it happens:** The demo-grade schema was intentionally permissive. The migration for P1c must add the constraint.

**How to avoid:** Wave 0 migration adds:
```sql
-- Partial unique: allow multiple NULLs (only one unique email per non-null value)
CREATE UNIQUE INDEX gym_members_email_unique ON gym_members (email)
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX gym_members_phone_unique ON gym_members (phone_e164)
  WHERE phone_e164 IS NOT NULL;
```
The upsert then uses `ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE ...`.

**Warning signs:** Postgres error `ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification`.

### Pitfall 3: Missing UNIQUE constraint on `(member_id, channel)` in `conversations` means duplicate lead conversations

**What goes wrong:** Every form submission by the same person creates a new conversation row instead of upserting the existing one.

**Why it happens:** No unique constraint means `ON CONFLICT` has nothing to conflict on; each insert succeeds.

**How to avoid:** Wave 0 migration:
```sql
CREATE UNIQUE INDEX conversations_member_channel_unique ON conversations (member_id, channel);
```
Then the upsert `ON CONFLICT (member_id, channel) DO UPDATE SET status = ...` works correctly.

### Pitfall 4: CORS middleware runs AFTER auth guard due to filename ordering

**What goes wrong:** The OPTIONS preflight for `/api/submit/:id` gets intercepted by the auth guard and returns a 302 redirect to the login page. The browser sees `302` on OPTIONS and blocks the POST.

**Why it happens:** Nitro loads server middleware files alphabetically. If the CORS file is named `cors.ts`, it loads after any auth plugin (which typically auto-mounts early). The `00-` prefix forces it first.

**How to avoid:** Name the file `apps/staff-web/server/middleware/00-public-cors.ts` exactly as the upstream template does. Verify with a CORS preflight test (`curl -X OPTIONS -H "Origin: https://doyouhustle.co.uk" https://gym-class-os.vercel.app/api/submit/test`) before declaring Wave 1 complete.

### Pitfall 5: CSS injection via unsanitized URL theme params

**What goes wrong:** `?accent=url(javascript:alert(1))` is reflected into the SSR HTML `<style>` block, executing attacker JavaScript in the form page origin.

**Why it happens:** Direct string interpolation of URL params into CSS.

**How to avoid:**
```typescript
function sanitizeHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
}
function sanitizeIntPx(value: string, min = 0, max = 32): number {
  const n = parseInt(value, 10);
  return isNaN(n) ? 6 : Math.min(max, Math.max(min, n));
}
```
Both helpers are trivial and must be present before the schedule widget or any URL-param theming goes live.

### Pitfall 6: `postMessage` without origin check in embed.js opens XSS vector

**What goes wrong:** The embed.js listener on the parent page accepts `lead:submitted` messages from any origin, including a malicious iframe injected on the same page.

**Why it happens:** `window.addEventListener("message", handler)` without an origin check is a common mistake.

**How to avoid:**
```javascript
window.addEventListener("message", function(event) {
  if (event.origin !== "https://gym-class-os.vercel.app") return;
  // process event
});
```
The staff-web URL is known at embed.js generation time; hardcode or inject it.

### Pitfall 7: Stripe Checkout session missing `memberId` metadata → pass not granted

**What goes wrong:** The P1b-07 reducer reads `session.metadata?.memberId`. If the staff creates a Checkout link without this metadata, the reducer inserts a payment row but grants no pass and links to no member. The lead paid but has no credits.

**Why it happens:** Easy to forget the metadata field when calling `stripe.checkout.sessions.create()`.

**How to avoid:** The `create-checkout-link` action validates `memberId` is a non-empty string via Zod before calling Stripe. Add a test fixture that replays `checkout.session.completed` with missing `memberId` and asserts the reducer does not crash (it currently handles `null` gracefully — passes loop is skipped) but does leave an audit trail.

### Pitfall 8: Phone number field mapping — form submission phone → E.164 normalisation

**What goes wrong:** Form submitter types `07721 123456` (UK mobile). The lead upsert stores it as-is. The WhatsApp conversation later tries to match `conversations JOIN gym_members ON phone_e164` but never finds the lead because WhatsApp delivers `+447721123456` and the stored value is the raw user input.

**Why it happens:** Free-text phone fields are not normalised.

**How to avoid:** The submission handler must normalise UK phone numbers to E.164 before the upsert. Use a simple normaliser for the pilot:
```typescript
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("07")) return "+44" + digits.slice(1);
  if (digits.length === 11 && digits.startsWith("447")) return "+" + digits;
  if (digits.startsWith("+")) return raw.replace(/\s/g, ""); // assume pre-normalised
  return null; // can't normalise — store null, flag for manual review
}
```
A `null` result means the phone wasn't matched but the lead is still created (email-only lead).

---

## Code Examples

Verified patterns from the upstream template and existing staff-web codebase:

### Lead-upsert submission handler outline

```typescript
// apps/staff-web/server/routes/api/submit/[id].post.ts
// Source: adapted from templates/forms/server/handlers/submissions.ts

export { submitLeadForm as default } from "../../../../features/forms/handlers/submissions.js";

// In features/forms/handlers/submissions.ts:
export const submitLeadForm = defineEventHandler(async (event: H3Event) => {
  // 1. Load published form by id (same as upstream — guard:allow-unscoped)
  // 2. Validate payload (honeypot + time check + field whitelist) — copy upstream verbatim
  // 3. Extract email + phone from submitted data by field type
  // 4. Upsert gym_members (partial unique index on email WHERE NOT NULL)
  // 5. Upsert conversations with status='lead' (unique on member_id+channel)
  // 6. Insert messages row: direction='in', messageType='form_submission', body=summary
  // 7. Insert responses row (same as upstream, for the forms builder to show responses)
  // 8. postMessage note: return { success: true, id: responseId } — iframe JS fires lead:submitted
});
```

### auth.ts publicPaths extension (additive)

```typescript
// Source: apps/staff-web/server/plugins/auth.ts (existing)
publicPaths: [
  "/api/m",
  "/pick-member",
  "/webhooks/whatsapp",
  "/access-denied",
  // P1c additions (Wave 1):
  "/f",
  "/api/forms/public",
  "/api/submit",
  "/embed",          // covers /embed/schedule and /embed.js
],
```

### CORS middleware extension

```typescript
// Source: apps/staff-web/server/middleware/00-public-cors.ts (new, copied from upstream)
const PUBLIC_EMBED_PREFIXES = [
  "/api/forms/public/",
  "/api/submit/",
  "/embed.js",         // exact match
  "/embed/",           // schedule widget
];
```

### URL-param theming in SSR

```typescript
// Source: pattern recommended from research
function sanitizeHexColor(value: string | null): string {
  const v = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : "#000000";
}
function sanitizeIntPx(value: string | null, min = 0, max = 32): number {
  const n = parseInt(value ?? "", 10);
  return isNaN(n) ? 6 : Math.min(max, Math.max(min, n));
}

// In the SSR HTML output:
`<style>
  :root {
    --accent: ${sanitizeHexColor(url.searchParams.get("accent"))};
    --radius: ${sanitizeIntPx(url.searchParams.get("radius"))}px;
  }
  /* ... rest of CSS ... */
</style>`
```

### Checkout link action (EMBED-05)

```typescript
// Source: pattern using P1b-07 reducer metadata contract
// apps/staff-web/actions/create-checkout-link.ts
import { defineAction } from "@agent-native/core";
import { z } from "zod";
import { getStripeClient } from "../server/lib/stripe.js";

export default defineAction({
  name: "create-checkout-link",
  http: { method: "POST" },
  parameters: z.object({
    memberId: z.string().min(1),
    priceId: z.string().min(1),
    productName: z.string().default("pass"),
  }),
  handler: async ({ memberId, priceId, productName }) => {
    const stripe = await getStripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { memberId },     // REQUIRED by P1b-07 reducer
      success_url: `${process.env.STAFF_WEB_URL}/gymos/members/${memberId}?checkout=success`,
      cancel_url: `${process.env.STAFF_WEB_URL}/gymos/members/${memberId}`,
    });
    return { url: session.url };
  },
});
```

### `embed.js` snippet structure

```javascript
// Source: /embed.js server route — vanilla JS, no framework
(function() {
  var BASE = "https://gym-class-os.vercel.app"; // injected at render time

  function createIframe(src, container) {
    var iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.style.cssText = "border:none;width:100%;min-height:300px;display:block";
    iframe.setAttribute("allowtransparency", "true");
    container.appendChild(iframe);
    return iframe;
  }

  // Wire form embeds
  document.querySelectorAll("[data-gymos-form]").forEach(function(el) {
    var slug = el.getAttribute("data-gymos-form");
    var accent = el.getAttribute("data-accent") || "";
    var radius = el.getAttribute("data-radius") || "";
    var params = new URLSearchParams({ embed: "1" });
    if (accent) params.set("accent", accent);
    if (radius) params.set("radius", radius);
    createIframe(BASE + "/f/" + encodeURIComponent(slug) + "?" + params, el);
  });

  // Wire schedule embeds
  document.querySelectorAll("[data-gymos-schedule]").forEach(function(el) {
    var accent = el.getAttribute("data-accent") || "";
    var params = new URLSearchParams({ embed: "1" });
    if (accent) params.set("accent", accent);
    createIframe(BASE + "/embed/schedule?" + params, el);
  });

  // postMessage listener (with origin check)
  window.addEventListener("message", function(ev) {
    if (ev.origin !== BASE) return;
    var d = ev.data;
    if (!d || !d.type) return;
    if (d.type === "gymos:resize") {
      // find the iframe that sent this and resize it
      document.querySelectorAll("iframe").forEach(function(f) {
        try {
          if (f.contentWindow === ev.source) f.style.height = d.height + "px";
        } catch (_) {}
      });
    }
    if (d.type === "lead:submitted" || d.type === "enquiry:created") {
      // re-dispatch as CustomEvent for host page analytics
      document.dispatchEvent(new CustomEvent(d.type, { detail: d }));
    }
  });
})();
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate forms app deploy | Co-located in staff-web as feature slice | P1c CONTEXT.md Decision 1 | Removes 4th Fly/Vercel deployable; single auth context |
| Anonymous self-serve booking widget | Lead funnel (submit → lead → staff contacts → Checkout link) | P1c CONTEXT.md Decision 2 | Removes need for anonymous payment flow + atomic capacity check at widget time |
| agent-native feedback `postMessage` event name `"agent-native-feedback-submitted"` | Gym-specific `"lead:submitted"` event | P1c fork | Host site analytics can distinguish gym-form lead events from framework feedback events |

**Deprecated/outdated in the upstream template for gym purposes:**
- `FormIntegration` (webhook/Slack/Discord/Google Sheets integrations): Not needed for pilot; the lead upsert replaces webhooks as the integration mechanism. Can be preserved in the copied code as a no-op; do not wire Slack/Discord integrations in P1c.
- `appStatePut` notification after submission: The upstream writes to `application_state` to notify the agent. For the gym, the `conversations` row serves this purpose. Remove the `appStatePut` call in the gym fork to avoid a dependency on the framework's application-state module being configured for anonymous contexts.
- `"Built with Agent Native"` badge: Remove from the SSR output for the gym embed (replace with nothing or GymClassOS branding).

---

## Open Questions

1. **`conversations.status` CHECK constraint name**
   - What we know: The schema adds a CHECK constraint via Drizzle's enum syntax; Drizzle generates a constraint name automatically.
   - What's unclear: The exact generated constraint name in the current Neon DB. Need to query `SELECT conname FROM pg_constraint WHERE conrelid = 'conversations'::regclass AND contype = 'c'` before writing the migration.
   - Recommendation: Wave 0 planner step: query the constraint name and template the migration accordingly.

2. **Leads in `/gymos` — filter vs sibling tab**
   - What we know: CONTEXT.md says "Claude's discretion — favouring the cleaner inbox".
   - What's unclear: Whether the inbox loader already shows all statuses or only `status != 'closed'`.
   - Looking at `gymos._index.tsx` loader: the query filters `status` but only the snippet was read. The planner should read the full loader query.
   - Recommendation: Add a `?filter=leads` search param to `/gymos` that filters `status='lead'`, rather than a new route. A tab button "Leads" in `GymosTopNav` or a filter chip in the inbox sidebar. Simpler than a full new route.

3. **Rate limiting on public POST endpoints**
   - What we know: CONTEXT.md Decision 2: "rate-limit + lightweight bot protection" is required.
   - What's unclear: Whether to use a Vercel Edge middleware approach or a server-side in-memory counter.
   - Recommendation: Use the upstream honeypot + time-to-submit already in the handler (these are free and already copied). Add a simple per-IP `Map`-based rate limiter in the handler itself (60 requests per 15 minutes per IP) for the pilot. Full Redis-backed rate limiting is overkill for a single-studio pilot.

4. **Stripe Product setup for pass credits**
   - What we know: `passCreditsForLineItem()` matches by description string (`"10-pack"`, `"5-pack"`, `"drop-in"`).
   - What's unclear: Whether the Hustle studio's existing Stripe Products have descriptions matching these patterns, or whether new Products need to be created.
   - Recommendation: The `create-checkout-link` action should accept `productName` and the staff-web UI shows it. Document in the plan that the Stripe Product description must contain one of the recognised keywords. This is a configuration dependency, not a code change.

5. **`gym_members.email` uniqueness and existing data**
   - What we know: The demo seed has 260 members. If any have duplicate emails (possible in seeded demo data), the partial unique index migration will fail.
   - Recommendation: Wave 0 migration includes a dedup step: `DELETE FROM gym_members WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at) rn FROM gym_members WHERE email IS NOT NULL) t WHERE rn > 1)`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Neon (gymos-demo project) | All DB operations | Yes | Postgres 16 | — |
| Stripe (restricted key in `app_secrets`) | EMBED-05 Checkout link creation | Yes (P1b-07 verified) | SDK 19.3.1 | — |
| Vercel (staff-web deployment) | Public `/f/:slug`, `/embed/schedule`, `/embed.js` routes | Yes (auto-deploys from master) | — | — |
| Cloudflare Turnstile | Bot protection CAPTCHA | No key configured | — | Honeypot + time-to-submit (already in handler) |
| `doyouhustle.co.uk` host page | E2E embed test | Accessible via browser | — | Use a local `<iframe>` test page instead |

**Missing dependencies with no fallback:** None — the honeypot approach removes the Turnstile dependency.

**Missing dependencies with fallback:**
- Turnstile CAPTCHA: not configured; honeypot is the fallback for P1c.

---

## Sources

### Primary (HIGH confidence)

- `templates/forms/server/handlers/submissions.ts` — submission handler, bot protection, CORS, field validation patterns (direct code read, 2026-06-01)
- `templates/forms/server/lib/public-form-ssr.ts` — full SSR renderer, CSS, postMessage, JS field logic (direct code read, 2026-06-01)
- `templates/forms/server/middleware/00-public-cors.ts` — CORS middleware pattern (direct code read, 2026-06-01)
- `templates/forms/server/plugins/auth.ts` — publicPaths convention (direct code read, 2026-06-01)
- `templates/forms/server/db/schema.ts` + `templates/forms/shared/types.ts` — complete schema + type contracts (direct code read, 2026-06-01)
- `apps/staff-web/server/db/schema.ts` — existing gym schema (conversations, gym_members, passes, etc.) (direct code read, 2026-06-01)
- `apps/staff-web/server/plugins/auth.ts` — existing publicPaths, allowlist middleware pattern (direct code read, 2026-06-01)
- `services/worker/src/domain/stripeReducers/checkout-session-completed.ts` — metadata contract (`memberId`) and pass grant logic (direct code read, 2026-06-01)
- `apps/staff-web/app/routes/gymos._index.tsx` — inbox loader pattern (direct code read, 2026-06-01)
- `.planning/phases/P1c-public-site-integrations/P1c-CONTEXT.md` — locked decisions (2026-06-01)
- `.planning/research/PITFALLS.md` — PITFALL #3 (atomic capacity) + #4 (pass-balance race) context (2026-06-01)

### Secondary (MEDIUM confidence)

- `templates/forms/app/pages/FormBuilderPage.tsx` — builder page structure, Tabler icons, shadcn components (direct code read, 2026-06-01)
- `apps/staff-web/AGENTS.md` — `guard:allow-unscoped` policy for gym tables (direct code read, 2026-06-01)
- `.planning/STATE.md` §Session Continuity — handoff notes for P1c (direct read, 2026-06-01)

---

## Metadata

**Confidence breakdown:**
- Forms fork scope and patterns: HIGH — upstream template fully read, all key files inspected
- Lead upsert schema changes: HIGH — existing schema read, migration patterns clear
- Stripe Checkout `memberId` metadata contract: HIGH — reducer source read directly
- `embed.js` postMessage pattern: HIGH — upstream pattern + standard web platform
- URL-param theming + CSS injection prevention: HIGH — straightforward, standard patterns
- Rate limiting approach: MEDIUM — in-memory map is a pragmatic choice but not verified against Vercel serverless instance lifetime (each invocation may be a new process; may not persist state between requests). Planner should consider Vercel KV for IP rate-limiting if the in-memory approach fails.

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable domain; no fast-moving dependencies for this phase)
