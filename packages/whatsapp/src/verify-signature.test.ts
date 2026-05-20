import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySignature } from "./verify-signature.js";

const SECRET = "test_app_secret_abcdef";
const BODY = '{"object":"whatsapp_business_account","entry":[{}]}';

function validSig(body: string, secret: string): string {
  return (
    "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex")
  );
}

describe("verifySignature", () => {
  it("returns true for valid signature", () => {
    const sig = validSig(BODY, SECRET);
    expect(verifySignature(BODY, sig, SECRET)).toBe(true);
  });

  it("returns false for tampered body", () => {
    const sig = validSig(BODY, SECRET);
    expect(verifySignature(BODY + "X", sig, SECRET)).toBe(false);
  });

  it("returns false for wrong secret", () => {
    const sig = validSig(BODY, SECRET);
    expect(verifySignature(BODY, sig, "wrong_secret")).toBe(false);
  });

  it("returns false for length mismatch", () => {
    expect(verifySignature(BODY, "sha256=tooshort", SECRET)).toBe(false);
  });

  it("returns false for empty header", () => {
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
  });

  it("returns false for empty secret", () => {
    const sig = validSig(BODY, SECRET);
    expect(verifySignature(BODY, sig, "")).toBe(false);
  });
});
