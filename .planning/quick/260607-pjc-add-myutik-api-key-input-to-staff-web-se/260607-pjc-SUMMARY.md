# Quick Task 260607-pjc — Summary

**Task:** Add a MYÜTIK API key input to the staff-web Settings → API Keys panel (the gear button on the AI input section).

**Date:** 2026-06-07
**Status:** Complete

## What changed

Single additive edit to `apps/staff-web/server/register-secrets.ts`: one new
`registerRequiredSecret()` block under a new `// ─── MYÜTIK relay ───` section,
registering `MYUTIK_API_KEY`. This surfaces a labeled input + Save button in
Settings → API Keys alongside the existing Anthropic and WhatsApp keys, so staff
can paste/rotate the key from the UI (encrypted into the `app_secrets` row via
the framework's `POST /_agent-native/secrets/:key` handler) — no redeploy needed.

### Registration fields

| Field | Value |
|-------|-------|
| `key` | `MYUTIK_API_KEY` |
| `label` | `MYÜTIK API Key` |
| `docsUrl` | `https://myutik.com` |
| `scope` | `user` (matches every other pilot secret — no org setup) |
| `kind` | `api-key` |
| `required` | `true` |
| `validator` | omitted (no documented MYÜTIK validation GET endpoint; mirrors `WHATSAPP_PHONE_NUMBER_ID`) |

## Deviation from plan / executor correction

The executor (worktree run) initially wrote the block with `required: false` and a
description framing the key as a "management API / relay configuration" credential
"not required for the inbound relay." That contradicts the integration spec: the
MYÜTIK API key (with `whatsapp:send` permission) is the **outbound send**
credential — GymOS uses it to `POST https://myutik.com/api/channels/whatsapp/send`
(from phoneNumberId `302631896256150`) to deliver replies and campaigns. The
orchestrator re-applied the block to `master` with `required: true` and an accurate
description (send endpoint, phoneNumberId, `x-api-key` header, 24h text→template
fallback, and the note that inbound signatures use `WHATSAPP_APP_SECRET`, not this
key). The isolated worktree branch (`worktree-agent-a318c8da0b76f4f7c`) was
discarded in favour of the corrected change.

## Scope boundaries (intentionally NOT done)

- No worker / edge-webhooks wiring — the senders don't yet read this key.
- No `secrets.ts` helper, no new route, no schema change.
- Like the existing WhatsApp keys, until the Fly senders read from `app_secrets`,
  the in-app paste must be paired with `fly secrets set MYUTIK_API_KEY=…`.

## Verification

- `npx prettier --write` succeeded (file parses cleanly).
- Block mirrors the proven `WHATSAPP_PHONE_NUMBER_ID` registration exactly (same
  required fields, no validator), so it compiles against the same
  `registerRequiredSecret` signature already used 6× in the file.

## Files

- `apps/staff-web/server/register-secrets.ts` (+1 block)
