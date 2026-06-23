# Phase MC1: Foundation + Lead event - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-23
**Phase:** MC1-foundation-lead-event
**Areas discussed:** CAPI token storage + send origin, stageEventMap scope, Settings card UX, Attribution capture robustness

---

## CAPI token storage + send origin

| Option | Description | Selected |
|--------|-------------|----------|
| Worker sends, token in Fly ENV | Worker POSTs, token via `fly secrets set`, UI shows 'set via Fly' status | |
| Worker sends, token in app_secrets (shared key) | Worker POSTs, token pasted in UI → app_secrets, requires shared decryption key across Vercel+Fly | ✓ |
| Nitro sends inline, token in app_secrets | CAPI POST in staff-web, loses pg-boss durable retry | |

**User's choice:** Worker sends, token in app_secrets (shared key)
**Notes:** Single source of truth + clean paste-in-UI; accepts the shared-key setup requirement.

### Follow-up: shared key mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Set SECRETS_ENCRYPTION_KEY on both | Dedicated shared key on Vercel + Fly, decoupled from auth secret | |
| Reuse BETTER_AUTH_SECRET on both | Make BETTER_AUTH_SECRET identical across envs, rely on existing fallback | ✓ |
| Worker self-test at boot | Boot-time decrypt self-test so drift fails loudly (combinable) | |

**User's choice:** Reuse BETTER_AUTH_SECRET on both
**Notes:** Boot-time self-test retained as Claude's-discretion safety net (D-04) since it doesn't conflict with the chosen key approach.

---

## stageEventMap scope + config storage

| Option | Description | Selected |
|--------|-------------|----------|
| Full map now, defaults only | Build 4-event resolver now, MC1 uses Lead only; MC2 adds senders with no rework | ✓ |
| Lead only, defer map to MC2 | Hardcode Lead, retrofit resolver in MC2 | |

**User's choice:** Full map now, defaults only

| Option | Description | Selected |
|--------|-------------|----------|
| studio_owner_config columns | Additive columns on existing worker-readable singleton | ✓ |
| application_state blob | JSON blob, no migration, but worker would need to read application_state | |

**User's choice:** studio_owner_config columns

---

## Settings card UX

| Option | Description | Selected |
|--------|-------------|----------|
| Config + last-send health | Show config completeness AND most-recent CAPI send result | ✓ |
| Config presence only | Just field-set checks like API Keys card | |

**User's choice:** Config + last-send health

| Option | Description | Selected |
|--------|-------------|----------|
| Fire test Lead to Test Events | Enqueue real CAPI Lead w/ testEventCode, lands in Test Events | ✓ |
| Validate credentials only | Ping Meta to validate token/pixel, no Lead emitted | |

**User's choice:** Fire test Lead to Test Events

| Option | Description | Selected |
|--------|-------------|----------|
| Masked + 'set'/'replace' state | Never display token; by-key presence resolution; rotate affordance | ✓ |
| Plain editable field | Pre-filled editable field, hits scoping gotcha | |

**User's choice:** Masked + 'set'/'replace' state

---

## Attribution capture robustness

| Option | Description | Selected |
|--------|-------------|----------|
| Query params on iframe src | Read parent fbclid/_fbc/_fbp, append to iframe URL; sync on first paint | ✓ |
| postMessage after load | Handshake-based, cleaner URL, adds race | |
| Both (param + postMessage) | Most robust, most code; overkill for MC1 | |

**User's choice:** Query params on iframe src

| Option | Description | Selected |
|--------|-------------|----------|
| Synthesize fbc from fbclid | Build `fb.1.<timestamp>.<fbclid>` when no _fbc cookie | ✓ |
| Only pass real _fbc | Drop bare fbclid; fails success criterion #2 | |

**User's choice:** Synthesize fbc from fbclid

| Option | Description | Selected |
|--------|-------------|----------|
| Fire Lead anyway, no fbc/fbp | Always send CAPI Lead with hashed PII + IP/UA | ✓ |
| Skip CAPI for organic leads | Only send when fbc/fbp present; undercounts | |

**User's choice:** Fire Lead anyway, no fbc/fbp

---

## Claude's Discretion

- event_id generation scheme (collision-safe, shared browser↔server)
- PII normalization before SHA-256 hashing (Meta standard rules)
- Graph API version pin (v23) confirmation at implement time
- Worker retry/backoff specifics (singletonKey on event_id)
- Boot-time decrypt self-test implementation (D-04)

## Deferred Ideas

- Contact/Purchase/Schedule lifecycle events → MC2
- Meta Lead Ads / Instant Forms → MC3
- Per-studio cookie/origin isolation for shared iframe origin
- EMQ surfacing in UI beyond last-send health
