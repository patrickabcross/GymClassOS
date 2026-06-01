/**
 * Normalise a UK phone number to E.164 format (+447XXXXXXXXX).
 *
 * Handles:
 *   - 07721 123456  → +447721123456  (11 digits, starts with 07)
 *   - 447721123456  → +447721123456  (12 digits, starts with 447)
 *   - +44 7721 123456 → +447721123456 (already has +44 prefix)
 *   - 7721123456    → +447721123456  (10 digits, starts with 7 — omitted leading 0)
 *   - "garbage"     → null           (can't normalise)
 *
 * Returns null when normalisation fails — the lead is still created as an
 * email-only lead (null phoneE164 stored).
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already has a + prefix — strip spaces and return as-is (trust the caller)
  if (trimmed.startsWith("+")) return trimmed.replace(/\s/g, "");

  const digits = trimmed.replace(/\D/g, "");

  // 11 digits, starts with 07 → UK mobile (e.g. 07721123456)
  if (digits.length === 11 && digits.startsWith("07")) return "+44" + digits.slice(1);

  // 12 digits, starts with 447 → international format without + (e.g. 447721123456)
  if (digits.length === 12 && digits.startsWith("447")) return "+" + digits;

  // 10 digits, starts with 7 → UK mobile without leading 0 (e.g. 7721123456)
  if (digits.length === 10 && digits.startsWith("7")) return "+44" + digits;

  return null; // can't normalise — store null, email-only lead
}
