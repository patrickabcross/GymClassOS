/**
 * GHL (GoHighLevel) contacts CSV importer.
 *
 * Loads a GoHighLevel contacts CSV export into the gymos-demo Neon DB,
 * inserting gym_members rows and, for consented contacts, whatsapp_opt_in rows.
 *
 * Default mode: DRY-RUN — prints a report and exits. Nothing is written.
 * --commit mode: performs idempotent chunked inserts (members first, then opt-ins).
 *
 * Usage:
 *   pnpm --filter @gymos/staff-web db:import-ghl <file.csv> [--commit]
 *
 * Features:
 *   - Auto-detects GHL/arbitrary column headers via synonyms map
 *   - Normalizes phones to E.164 (UK +44 default)
 *   - Within-file and against-DB deduplication
 *   - Hard error if firstName or phone column cannot be located
 *   - Re-running --commit inserts 0 new rows (onConflictDoNothing + phone PK)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parse } from "csv-parse/sync";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/ is ONE level under apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });

// ─────────────────────────────────────────────────────────────────────────────
// CLI arg parsing — must happen BEFORE any DB access
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const commitMode = args.includes("--commit");
const positional = args.filter((a) => !a.startsWith("--"));
const csvArg = positional[0];

if (!csvArg) {
  console.error(
    "Error: no CSV file path provided.\n" +
      "Usage: pnpm --filter @gymos/staff-web db:import-ghl <file.csv> [--commit]",
  );
  process.exit(1);
}

const csvPath = path.resolve(process.cwd(), csvArg);

if (!fs.existsSync(csvPath)) {
  console.error(
    `Error: file not found: ${csvPath}\n` +
      "Usage: pnpm --filter @gymos/staff-web db:import-ghl <file.csv> [--commit]",
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Header auto-detection
// ─────────────────────────────────────────────────────────────────────────────

/** Strip to lowercase alphanumeric for fuzzy matching */
function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Synonyms map: canonical field → list of normalized synonyms.
 * All synonym strings are already lowercase/alphanumeric (normalize()-form).
 */
const SYNONYMS: Record<string, string[]> = {
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

type FieldMapping = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  marketingConsent?: string;
  unsubscribed?: string;
  consentDate?: string;
};

function detectHeaders(rawHeaders: string[]): FieldMapping {
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

function normalizePhone(raw: string): string | null {
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

const TRUTHY_CONSENT = new Set([
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
const TRUTHY_UNSUB = new Set([
  "yes",
  "true",
  "1",
  "y",
  "unsubscribed",
  "opted out",
  "optout",
]);

function parseConsent(
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

function parseConsentDate(
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
// Bulk insert helper — mirrors seed-demo-data.ts pattern exactly
// ─────────────────────────────────────────────────────────────────────────────

async function bulkInsert<T>(
  table: any,
  rows: T[],
  conflictTarget: any,
  chunkSize = 200,
): Promise<number> {
  if (rows.length === 0) return 0;
  const { getDb } = await import("../server/db/index.js");
  const db = getDb();
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const result: any = await db
      .insert(table)
      .values(chunk as any)
      .onConflictDoNothing({ target: conflictTarget })
      .returning({ id: conflictTarget });
    inserted += Array.isArray(result) ? result.length : chunk.length;
  }
  return inserted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const NOW_ISO = new Date().toISOString();

  // 1. Parse CSV
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (rows.length === 0) {
    console.error("Error: CSV file is empty (no data rows).");
    process.exit(1);
  }

  const rawHeaders = Object.keys(rows[0]);

  // 2. Detect headers
  const mapping = detectHeaders(rawHeaders);

  console.log("\n=== Detected column mapping ===");
  const displayFields: (keyof FieldMapping)[] = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "marketingConsent",
    "unsubscribed",
    "consentDate",
  ];
  for (const field of displayFields) {
    const raw = mapping[field];
    console.log(`  ${field.padEnd(18)} → ${raw ?? "(not found)"}`);
  }
  console.log();

  // 3. Hard error if firstName or phone is missing
  const missingFields: string[] = [];
  if (!mapping.firstName) missingFields.push("firstName");
  if (!mapping.phone) missingFields.push("phone");

  if (missingFields.length > 0) {
    console.error(
      `Error: required column(s) not detected: ${missingFields.join(", ")}\n` +
        `Raw headers seen: ${rawHeaders.join(", ")}\n` +
        "Rename a column to match one of the synonyms and retry.\n" +
        "firstName synonyms: first name, first, fname, given name, contact first name\n" +
        "phone synonyms: phone, mobile, phone number, mobile number, contact phone, number, tel",
    );
    process.exit(1);
  }

  // 4. Query existing phones from DB (read-only SELECT — safe in dry-run too)
  let existingPhones = new Set<string>();
  try {
    const { getDb, schema } = await import("../server/db/index.js");
    const db = getDb();
    const existing = await db
      .select({ p: schema.gymMembers.phoneE164 })
      .from(schema.gymMembers);
    existingPhones = new Set(
      existing.map((r) => r.p).filter(Boolean) as string[],
    );
  } catch (err: any) {
    if (!commitMode) {
      console.warn(
        `Warning: could not connect to DB for existing-phone dedup (DATABASE_URL set?). ` +
          `Skipping DB dedup check — will count all valid rows as importable.\n` +
          `  ${err?.message ?? String(err)}\n`,
      );
    } else {
      throw err;
    }
  }

  // 5. Process rows
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  const members: Array<{
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phoneE164: string;
    marketingConsent: boolean;
    createdAt: string;
    updatedAt: string;
  }> = [];

  const optIns: Array<{
    memberId: string;
    optedInAt: string;
    evidenceMessageId: null;
    evidencePayload: string;
    source: "import";
  }> = [];

  // Skip counters
  let skipNoFirstName = 0;
  let skipNoValidPhone = 0;
  let skipDuplicateInFile = 0;
  let skipAlreadyInDb = 0;
  let optedInCount = 0;
  let notOptedInCount = 0;

  for (const row of rows) {
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
        seenPhones.delete(phoneE164); // undo — counted as dupe
        continue;
      }
      seenEmails.add(emailLower);
    }

    const lastName = mapping.lastName
      ? (row[mapping.lastName] ?? "").trim() || null
      : null;

    const consent = parseConsent(row, mapping);
    const consentDate = parseConsentDate(row, mapping, NOW_ISO);

    const memberId = nanoid();
    members.push({
      id: memberId,
      firstName,
      lastName,
      email,
      phoneE164,
      marketingConsent: consent,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });

    if (consent) {
      optedInCount++;
      const consentColName =
        mapping.marketingConsent ?? mapping.unsubscribed ?? null;
      const consentValue = consentColName ? (row[consentColName] ?? "") : "";
      optIns.push({
        memberId,
        optedInAt: consentDate,
        evidenceMessageId: null,
        evidencePayload: JSON.stringify({
          importedFrom: "gohighlevel",
          file: path.basename(csvPath),
          consentColumn: consentColName,
          consentValue,
          importedAt: NOW_ISO,
        }),
        source: "import",
      });
    } else {
      notOptedInCount++;
    }
  }

  // 6. Report
  console.log("=== Import summary ===");
  console.log(`  CSV rows parsed:        ${rows.length}`);
  console.log(`  Importable rows:        ${members.length}`);
  console.log(`    Opted-in (WA):        ${optedInCount}`);
  console.log(`    No consent:           ${notOptedInCount}`);
  console.log(`  Skipped:`);
  console.log(`    No first name:        ${skipNoFirstName}`);
  console.log(`    No valid phone:       ${skipNoValidPhone}`);
  console.log(`    Duplicate in file:    ${skipDuplicateInFile}`);
  console.log(`    Already in DB:        ${skipAlreadyInDb}`);
  console.log();

  // 7. Sample rows (up to 5)
  const sampleCount = Math.min(5, members.length);
  if (sampleCount > 0) {
    console.log(`=== Sample mapped rows (first ${sampleCount}) ===`);
    for (let i = 0; i < sampleCount; i++) {
      const m = members[i];
      const willOptIn = optIns.some((o) => o.memberId === m.id);
      console.log(
        `  [${i + 1}] ${m.firstName} ${m.lastName ?? ""} | ${m.phoneE164} | ${m.email ?? "(no email)"} | opt-in: ${willOptIn ? "yes" : "no"}`,
      );
    }
    console.log();
  }

  // 8. Dry-run exit or commit
  if (!commitMode) {
    console.log("Dry run — nothing written. Re-run with --commit to insert.");
    process.exit(0);
  }

  // 9. Commit mode: insert members then opt-ins
  console.log("=== Committing to DB ===");
  const { schema } = await import("../server/db/index.js");

  const membersInserted = await bulkInsert(
    schema.gymMembers,
    members,
    schema.gymMembers.id,
  );
  console.log(
    `  gym_members inserted:   ${membersInserted} / ${members.length} (${members.length - membersInserted} skipped — already existed)`,
  );

  const optInsInserted = await bulkInsert(
    schema.whatsappOptIn,
    optIns,
    schema.whatsappOptIn.memberId,
  );
  console.log(
    `  whatsapp_opt_in inserted: ${optInsInserted} / ${optIns.length} (${optIns.length - optInsInserted} skipped — already existed)`,
  );

  console.log();
  console.log(
    "Done. Safe to re-run — onConflictDoNothing ensures idempotency.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
