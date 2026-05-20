import crypto from "node:crypto";

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw body.
 *
 * Pattern preserved from templates/mail/app/routes/webhooks.whatsapp.tsx
 * lines 52-67 (the demo's HMAC verify is correct; do not deviate).
 *
 * Returns false on:
 *  - empty/missing signature header
 *  - empty/missing app secret
 *  - length mismatch (which timingSafeEqual would reject anyway)
 *  - HMAC mismatch
 */
export function verifySignature(
  rawBody: string,
  sigHeader: string,
  appSecret: string,
): boolean {
  if (!sigHeader || !appSecret) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const sigBuf = Buffer.from(sigHeader);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
