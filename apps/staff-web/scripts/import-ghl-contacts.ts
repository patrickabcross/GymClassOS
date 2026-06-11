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
import { parseLeadsCsv } from "../server/lib/csv-leads.js";
import type { FieldMapping } from "../server/lib/csv-leads.js";

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
// Header auto-detection, phone normalization, and consent parsing are now in:
//   apps/staff-web/server/lib/csv-leads.ts
// Imported above — no inlined copies here.
// ─────────────────────────────────────────────────────────────────────────────

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

  // 2–3. Detect headers + hard-error on missing required fields — delegated to parseLeadsCsv

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

  // 5. Process rows via shared library
  const parsed = parseLeadsCsv(rows, { existingPhones, nowIso: NOW_ISO });
  const { mapping, rawHeaders } = parsed;

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
    const col = mapping[field];
    console.log(`  ${field.padEnd(18)} → ${col ?? "(not found)"}`);
  }
  console.log();

  if (parsed.missingFields.length > 0) {
    console.error(
      `Error: required column(s) not detected: ${parsed.missingFields.join(", ")}\n` +
        `Raw headers seen: ${rawHeaders.join(", ")}\n` +
        "Rename a column to match one of the synonyms and retry.\n" +
        "firstName synonyms: first name, first, fname, given name, contact first name\n" +
        "phone synonyms: phone, mobile, phone number, mobile number, contact phone, number, tel",
    );
    process.exit(1);
  }

  // Build insert arrays from parsed members (CLI owns DB inserts and reporting)
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

  for (const m of parsed.members) {
    const memberId = nanoid();
    members.push({
      id: memberId,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phoneE164: m.phoneE164,
      marketingConsent: m.consent,
      createdAt: NOW_ISO,
      updatedAt: NOW_ISO,
    });

    if (m.consent) {
      optIns.push({
        memberId,
        optedInAt: m.consentDate,
        evidenceMessageId: null,
        evidencePayload: JSON.stringify({
          importedFrom: "gohighlevel",
          file: path.basename(csvPath),
          consentColumn: m.consentColumn,
          consentValue: m.consentValue,
          importedAt: NOW_ISO,
        }),
        source: "import",
      });
    }
  }

  // 6. Report
  const { counts } = parsed;
  console.log("=== Import summary ===");
  console.log(`  CSV rows parsed:        ${parsed.totalRows}`);
  console.log(`  Importable rows:        ${counts.importable}`);
  console.log(`    Opted-in (WA):        ${counts.optedIn}`);
  console.log(`    No consent:           ${counts.notOptedIn}`);
  console.log(`  Skipped:`);
  console.log(`    No first name:        ${counts.skipNoFirstName}`);
  console.log(`    No valid phone:       ${counts.skipNoValidPhone}`);
  console.log(`    Duplicate in file:    ${counts.skipDuplicateInFile}`);
  console.log(`    Already in DB:        ${counts.skipAlreadyInDb}`);
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
