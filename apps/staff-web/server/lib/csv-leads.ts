/**
 * Shared CSV-leads library.
 *
 * Pure functions (no DB, no fs) for parsing and normalising lead CSV files.
 * Used by:
 *   - apps/staff-web/scripts/import-ghl-contacts.ts (CLI batch importer)
 *   - apps/staff-web/actions/import-leads.ts (in-UI bulk-upload action)
 *
 * All logic here was extracted verbatim from import-ghl-contacts.ts and must
 * not diverge — the CLI and the UI action share one set of regexes and synonym
 * lists.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Header auto-detection
// ─────────────────────────────────────────────────────────────────────────────

/** Strip to lowercase alphanumeric for fuzzy matching */
export function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Synonyms map: canonical field → list of normalized synonyms.
 * All synonym strings are already lowercase/alphanumeric (normalize()-form).
 */
export const SYNONYMS: Record<string, string[]> = {
  firstName: [
    "firstname",
    "fname",
    "givenname",
    "contactfirstname",
    "first",
    "firstn",
  ],
  lastName: ["lastname", "lname", "surname", "contactlastname", "last"],
  email: ["email", "emailaddress", "email", "email"],
  phone: [
    "phone",
    "mobile",
    "phonenumber",
    "mobilenumber",
    "contactphone",
    "number",
    "tel",
    "cellphone",
    "mobilephone",
    "phonemobile",
  ],
  marketingConsent: [
    "optin",
    "optedin",
    "marketing",
    "consent",
    "subscribed",
    "marketingconsent",
    "smsoptin",
    "emailoptin",
    "smsconsent",
    "marketingoptinstatus",
  ],
  unsubscribed: [
    "unsubscribed",
    "unsubscribe",
    "optout",
    "optedout",
    "donotcontact",
    "dnc",
    "donotmarket",
  ],
  consentDate: [
    "consentdate",
    "optedindate",
    "dateadded",
    "optintimestamp",
    "subscribeddate",
    "optindate",
    "consentat",
  ],
};

export type FieldMapping = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  marketingConsent?: string;
  unsubscribed?: string;
  consentDate?: string;
};

export function detectHeaders(rawHeaders: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  for (const raw of rawHeaders) {
    const n = normalize(raw);
    for (const [field, synonyms] of Object.entries(SYNONYMS)) {
      if (
        (mapping as Record<string, string | undefined>)[field] === undefined &&
        synonyms.includes(n)
      ) {
        (mapping as Record<string, string | undefined>)[field] = raw;
      }
    }
  }
  return mapping;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone normalization → E.164 (UK +44 default)
// ─────────────────────────────────────────────────────────────────────────────

export function normalizePhone(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  // Keep digits and a leading +
  let s = raw.replace(/[^\d+]/g, "");
  if (!s) return null;

  let result: string;
  if (s.startsWith("+")) {
    // Already has country code — keep as-is after validation
    result = s;
  } else if (s.startsWith("0")) {
    // UK national format: 07xxx → +447xxx
    result = "+44" + s.slice(1);
  } else if (s.startsWith("44")) {
    // UK without leading + e.g. 447911123456
    result = "+" + s;
  } else {
    // Ambiguous — cannot safely assume country
    return null;
  }

  // Sanity: must be +<8-15 digits>
  if (!/^\+\d{8,15}$/.test(result)) return null;
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent parsing
// ─────────────────────────────────────────────────────────────────────────────

export const TRUTHY_CONSENT = new Set([
  "yes",
  "true",
  "1",
  "y",
  "opted in",
  "optedin",
  "subscribed",
  "opt in",
  "optin",
]);

export const TRUTHY_UNSUB = new Set([
  "yes",
  "true",
  "1",
  "y",
  "unsubscribed",
  "opted out",
  "optout",
]);

export function parseConsent(
  row: Record<string, string>,
  mapping: FieldMapping,
): boolean {
  // unsubscribed column is an INVERTED signal — if truthy, member is NOT consented
  if (mapping.unsubscribed !== undefined) {
    const val = (row[mapping.unsubscribed] ?? "").toLowerCase().trim();
    if (TRUTHY_UNSUB.has(val)) return false;
  }
  if (mapping.marketingConsent !== undefined) {
    const val = (row[mapping.marketingConsent] ?? "").toLowerCase().trim();
    return TRUTHY_CONSENT.has(val);
  }
  return false;
}

export function parseConsentDate(
  row: Record<string, string>,
  mapping: FieldMapping,
  fallback: string,
): string {
  if (mapping.consentDate !== undefined) {
    const raw = (row[mapping.consentDate] ?? "").trim();
    if (raw) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Higher-level row parser — shared between CLI and action
// ─────────────────────────────────────────────────────────────────────────────

export type ParsedLeadRow = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phoneE164: string;
  consent: boolean;
  consentDate: string;
  consentColumn: string | null;
  consentValue: string;
};

export type ParseLeadsResult = {
  mapping: FieldMapping;
  rawHeaders: string[];
  members: ParsedLeadRow[];
  totalRows: number;
  counts: {
    importable: number;
    optedIn: number;
    notOptedIn: number;
    skipNoFirstName: number;
    skipNoValidPhone: number;
    skipDuplicateInFile: number;
    skipAlreadyInDb: number;
  };
  missingFields: string[]; // 'firstName' and/or 'phone' if not detected
};

/**
 * Parse a list of CSV rows (already parsed via csv-parse) into a structured
 * result. Pure — no DB access, no fs.
 *
 * @param rows           Already-parsed CSV rows (array of objects keyed by header).
 * @param opts.existingPhones  Phone set from the DB — rows matching these are skipped.
 * @param opts.nowIso    ISO timestamp to use as the consent-date fallback.
 */
export function parseLeadsCsv(
  rows: Record<string, string>[],
  opts: { existingPhones?: Set<string>; nowIso: string },
): ParseLeadsResult {
  const existingPhones = opts.existingPhones ?? new Set<string>();
  const nowIso = opts.nowIso;

  const rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const mapping = detectHeaders(rawHeaders);

  // Compute missing required fields
  const missingFields: string[] = [];
  if (!mapping.firstName) missingFields.push("firstName");
  if (!mapping.phone) missingFields.push("phone");

  // Skip counters
  let skipNoFirstName = 0;
  let skipNoValidPhone = 0;
  let skipDuplicateInFile = 0;
  let skipAlreadyInDb = 0;
  let optedIn = 0;
  let notOptedIn = 0;

  const members: ParsedLeadRow[] = [];
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  for (const row of rows) {
    // Skip if required columns are missing (missingFields check above handles
    // the hard-error path; here we just skip gracefully when iterating)
    if (missingFields.length > 0) {
      // If headers are missing, can't process any rows — return early
      break;
    }

    const firstName = (row[mapping.firstName!] ?? "").trim();
    if (!firstName) {
      skipNoFirstName++;
      continue;
    }

    const rawPhone = (row[mapping.phone!] ?? "").trim();
    const phoneE164 = normalizePhone(rawPhone);
    if (!phoneE164) {
      skipNoValidPhone++;
      continue;
    }

    if (seenPhones.has(phoneE164)) {
      skipDuplicateInFile++;
      continue;
    }
    seenPhones.add(phoneE164);

    if (existingPhones.has(phoneE164)) {
      skipAlreadyInDb++;
      continue;
    }

    const rawEmail = mapping.email ? (row[mapping.email] ?? "").trim() : "";
    const email = rawEmail || null;
    if (email) {
      const emailLower = email.toLowerCase();
      if (seenEmails.has(emailLower)) {
        skipDuplicateInFile++;
        seenPhones.delete(phoneE164); // undo phone add — counted as dupe
        continue;
      }
      seenEmails.add(emailLower);
    }

    const lastName = mapping.lastName
      ? (row[mapping.lastName] ?? "").trim() || null
      : null;

    const consent = parseConsent(row, mapping);
    const consentDate = parseConsentDate(row, mapping, nowIso);
    const consentColumn =
      mapping.marketingConsent ?? mapping.unsubscribed ?? null;
    const consentValue = consentColumn ? (row[consentColumn] ?? "") : "";

    if (consent) {
      optedIn++;
    } else {
      notOptedIn++;
    }

    members.push({
      firstName,
      lastName,
      email,
      phoneE164,
      consent,
      consentDate,
      consentColumn,
      consentValue,
    });
  }

  return {
    mapping,
    rawHeaders,
    members,
    totalRows: rows.length,
    counts: {
      importable: members.length,
      optedIn,
      notOptedIn,
      skipNoFirstName,
      skipNoValidPhone,
      skipDuplicateInFile,
      skipAlreadyInDb,
    },
    missingFields,
  };
}
