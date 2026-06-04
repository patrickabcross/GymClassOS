---
quick_id: 260604-fj3
description: Add MYÜTIK verify-echo branch to edge-webhooks WhatsApp POST handler
date: 2026-06-04
status: complete
commit: 9dabc513
---

# Quick Task 260604-fj3 — Summary

## What was done

Added an authenticated verify-echo branch to the POST `/whatsapp` handler in
`services/edge-webhooks/src/routes/whatsapp.ts`. After the existing
`verifySignature(raw, sigHeader, appSecret)` check and the `JSON.parse(raw)`
block, before the `entries` loop:

```ts
if ((payload as { event?: string }).event === "verify") {
  console.log("[whatsapp] MYÜTIK verify event — echoing challenge");
  return c.json({ challenge: (payload as { challenge?: string }).challenge });
}
```

This closes the `challenge_not_echoed` gap: MYÜTIK posts a signed
`{"event":"verify","challenge":"<uuid>"}` and substring-checks the response body
for the challenge. The handler now returns `{"challenge":"<uuid>"}` (200).

## Why it is safe

- **Authenticated:** the branch runs only after `verifySignature` passes, so an
  unsigned/forged verify POST is rejected at line 39 before reaching it. MYÜTIK
  signs verify POSTs Meta-style — `X-Hub-Signature-256` = `sha256=` + hex
  HMAC-SHA256(rawBody) using the `whatsapp_app_secret` value — so the existing
  HMAC check passes for it with no secret change.
- **Raw-body-first discipline preserved:** no change to the
  `await c.req.text()` → `verifySignature` line order.
- **No impact on Meta:** Meta verifies via the GET handshake (unchanged) and
  never POSTs `event:"verify"`. The inbound message/status enqueue paths are
  untouched.

## Verification

- `cd services/edge-webhooks && npx tsc --noEmit` → exit 0
- prettier → already compliant (unchanged)
- Branch confirmed positioned after `JSON.parse(raw)` and before the `entries` loop

## Deploy (manual — NOT run here)

The Fly app `gymos-edge-webhooks` has no CI deploy hook (no GH workflow targets
it); `services/edge-webhooks/fly.toml` builds from the repo-root `Dockerfile`.
Ship with the same invocation used for prior deploys, e.g. from repo root:

```bash
fly deploy --config services/edge-webhooks/fly.toml
```

(or `cd services/edge-webhooks && fly deploy`). Left for the user — outward-facing
and needs Fly auth.

## Post-deploy self-test

```bash
SECRET='<whatsapp_app_secret value>'
BODY='{"event":"verify","challenge":"test-123"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')"
curl -i -X POST https://gymos-edge-webhooks.fly.dev/webhooks/whatsapp \
  -H "Content-Type: application/json" -H "X-Hub-Signature-256: $SIG" -d "$BODY"
# expect: 200, body {"challenge":"test-123"}
```

Then hit "Verify endpoint" in the MYÜTIK dashboard → it flips `verified_at`.

## Commit

- `9dabc513` — feat(edge-webhooks): echo challenge on MYUTIK verify POST (event:verify)
