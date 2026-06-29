# Phase MA1: Auth + 3-Role Spine (the one-way door) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-29
**Phase:** MA1-auth-3-role-spine-the-one-way-door
**Areas discussed:** Password recovery, First-run & account creation, Unmatched-email UX, Demo fallback & cutover (+ web-dependency status, phone-match mechanics)

---

## Gray-area selection

User selected **all four** offered areas: Password recovery path, First-run & account creation, Unmatched-email UX, Demo fallback & cutover.

---

## Password recovery path

| Option | Description | Selected |
|--------|-------------|----------|
| Defer self-serve reset to v2 | Ship email+password now; no in-app reset; staff resets manually | |
| Email+password + wired sender | Stand up a transactional email provider this phase | |
| Magic-link (passwordless) | Replace passwords with emailed links | |
| Other (free text) | "use the runstudioai.com's system" | ✓ |

**Follow-up:** Clarified to **option 1b** — account + password managed entirely on the **runstudioai.com** website; mobile app never does in-app reset; "Forgot password?" deep-links to the web reset page; app only consumes the session.
**User's choice:** Web-managed recovery at runstudioai.com (no in-app reset).

---

## First-run & account creation

| Option | Description | Selected |
|--------|-------------|----------|
| Sign-in screen, self sign-up link | First screen Sign in, with in-app Create-account link | |
| Sign-up-first screen | Lead with account creation | |
| Invite-only | Staff provisions accounts | |
| Other (free text) | "People should be sent to the site to subscribe" | ✓ |

**Follow-up:** Confirmed — **no in-app self-signup**; app is **sign-in only**. "Join / Subscribe" deep-links to the **studio's own site** to subscribe + pay; **password is set on the web during subscribe (option 2ii)**.
**User's choice:** App is sign-in only; subscribe + set-password happen on the web (studio site).

---

## Unmatched-email UX

| Option | Description | Selected |
|--------|-------------|----------|
| 403 "No membership on file — contact the studio" | Clear dead-end; never auto-creates | |
| Staff-assisted / phone-match fallback | Prompt phone to match a WhatsApp-only row, or notify staff | ✓ |
| Generic auth error (anti-enumeration) | Don't reveal whether email is known | |

**Phone-match mechanics follow-up:**

| Option | Description | Selected |
|--------|-------------|----------|
| Try phone, auto-link if found, else contact-studio | Prompt phone → match WhatsApp-only row → link; else 403 + notify staff | ✓ |
| Phone-match only (no staff notify) | Link if matched; else plain message, no notify | |
| Contact-studio only (defer phone-match to v2) | 403 + notify staff; phone-match later | |

**User's choice:** Try phone → auto-link if matched → else "contact the studio" + notify staff.

---

## Demo fallback & cutover

| Option | Description | Selected |
|--------|-------------|----------|
| Keep non-prod only; real login is the prod gate | requireDemoMember gated DEMO_MODE && non-prod; dual-path | ✓ |
| Hard cutover — remove demo path in MA1 | Delete requireDemoMember + picker now | |
| Keep a dev-only persona switcher | Retain pick-member behind a flag indefinitely | |

**User's choice:** Keep non-prod demo fallback; real login is the prod gate (requireDemoMember → requireMember dual-path).

---

## Web account system status

| Option | Description | Selected |
|--------|-------------|----------|
| External dependency — app side only in MA1 | Build app spine + configurable deep-link URLs; test accounts via Better-auth API/seed | ✓ |
| Web pages already exist | Just point the app at them | |
| Build a minimal web flow in MA1 too | Expand scope to include a web subscribe/set-password page | |

**User's choice:** External dependency — MA1 builds the app side only.

---

## Claude's Discretion

Deferred to planner/researcher: `expo()` plugin + `trustedOrigins` wiring (absent today), `bearer()` `set-auth-token` header name on v1.6.0, SecureStore adapter, exact placement of claim-by-email (lazy-on-first-request recommended), `GYMOS_ADMIN_EMAILS` vs `RUNSTUDIO_OPERATOR_EMAILS` reconciliation, staff-notify channel, sign-in/role-landing visual design + sign-out/refresh UX.

## Deferred Ideas

WhatsApp-OTP recovery (v2), magic-link, in-app sign-up/reset (web-owned), the web subscribe/account/reset pages (separate workstream), minimal-web-flow-in-MA1 (rejected), anti-enumeration generic error (rejected), teacher AI (never), push (MA5), MA2/MA3/MA4 surfaces.
