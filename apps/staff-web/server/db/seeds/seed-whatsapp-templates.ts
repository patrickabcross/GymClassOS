/**
 * Idempotent seed for whatsapp_templates.
 *
 * Pre-populates 5 rows for the P1b.1 pilot Templates dialog:
 * - hello_world (approved) — Meta's pre-approved default; gives the pilot a
 *   real sendable on day one.
 * - class_reminder, waitlist_offer, payment_failed, pass_expiring (pending) —
 *   visible in the picker but disabled until Meta approval lands (per P0/FND-06).
 *   The WA-08 daily sync cron (P1b-09) replaces these rows once approvals
 *   come through.
 *
 * Run with: pnpm --filter @gymos/staff-web db:seed-templates
 * Safe to re-run — uses ON CONFLICT DO NOTHING on the primary key (name).
 *
 * Env loading: dotenv reads .env.local (preferred) and .env (fallback).
 * DATABASE_URL must point at the Neon project.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/staff-web/server/db/seeds/seed-whatsapp-templates.ts → apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

// Load app-level env first (.env.local preferred, then .env), so DATABASE_URL
// is available to @agent-native/core/db before getDb() is called.
dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });

const { getDb, schema } = await import("../index.js");

type SeedRow = {
  name: string;
  status: "approved" | "pending";
  category: "marketing" | "utility" | "authentication";
  language: string;
  componentsJson: string;
};

const SEED_ROWS: SeedRow[] = [
  {
    name: "hello_world",
    status: "approved",
    category: "utility",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [{ type: "BODY", text: "Hello World" }],
    }),
  },
  {
    name: "class_reminder",
    status: "pending",
    category: "utility",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, your {{2}} class is tomorrow at {{3}}. See you there!",
        },
      ],
    }),
  },
  {
    name: "waitlist_offer",
    status: "pending",
    category: "utility",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Good news {{1}}! A spot opened in {{2}} on {{3}}. Reply YES to confirm your booking.",
        },
      ],
    }),
  },
  {
    name: "payment_failed",
    status: "pending",
    category: "utility",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, your payment for {{2}} failed. Please update your payment method to keep your membership active.",
        },
      ],
    }),
  },
  {
    name: "pass_expiring",
    status: "pending",
    category: "utility",
    language: "en_US",
    componentsJson: JSON.stringify({
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, your {{2}} pass expires on {{3}}. Renew now to keep attending classes.",
        },
      ],
    }),
  },
];

async function main() {
  const db = getDb();
  console.log(`Seeding ${SEED_ROWS.length} whatsapp_templates rows...`);

  for (const row of SEED_ROWS) {
    await db
      .insert(schema.whatsappTemplates)
      .values({
        name: row.name,
        status: row.status,
        category: row.category,
        language: row.language,
        componentsJson: row.componentsJson,
        lastSyncedAt: new Date().toISOString(),
      })
      .onConflictDoNothing({ target: schema.whatsappTemplates.name });
    console.log(`  + ${row.name} (${row.status})`);
  }

  const all = await db
    .select({ name: schema.whatsappTemplates.name })
    .from(schema.whatsappTemplates);
  console.log(`Done. whatsapp_templates now has ${all.length} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
