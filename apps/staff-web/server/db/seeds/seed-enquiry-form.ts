/**
 * Idempotent seed for the default published "Schedule Enquiry" form.
 *
 * The schedule widget at /embed/schedule targets this form's stable id
 * ("/api/submit/schedule-enquiry") so enquiries flow through the P1c-02 lead
 * handler and land as status='lead' conversations in /gymos.
 *
 * Run with: pnpm --filter @gymos/staff-web db:seed-enquiry-form
 * Safe to re-run — uses onConflictDoNothing on the primary key (id).
 *
 * Env loading: dotenv reads .env.local (preferred) and .env (fallback).
 * DATABASE_URL must point at the Neon project.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// apps/staff-web/server/db/seeds/seed-enquiry-form.ts → apps/staff-web
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");

// Load app-level env first (.env.local preferred, then .env), so DATABASE_URL
// is available to @agent-native/core/db before getDb() is called.
dotenv.config({ path: path.join(APP_ROOT, ".env.local"), quiet: true });
dotenv.config({ path: path.join(APP_ROOT, ".env"), quiet: true });

const { getDb, schema } = await import("../index.js");

// Stable id/slug — the widget hardcodes /api/submit/schedule-enquiry.
const FORM_ID = "schedule-enquiry";
const FORM_SLUG = "schedule-enquiry";

// FormField shape matches features/forms/types.ts FormField interface.
const FIELDS = [
  {
    id: "name",
    type: "text",
    label: "Your name",
    placeholder: "Jane Smith",
    required: true,
  },
  {
    id: "email",
    type: "email",
    label: "Email",
    placeholder: "you@example.com",
    required: true,
  },
  {
    id: "phone",
    type: "text",
    label: "Phone",
    placeholder: "+44 7700 900000",
    required: false,
  },
];

// FormSettings shape matches features/forms/types.ts FormSettings interface.
const SETTINGS = {
  submitText: "Send Enquiry",
  successMessage: "Thanks! We'll be in touch shortly to confirm your spot.",
  // allowedOrigins is empty/absent → any origin may submit (back-compat / embed)
};

async function main() {
  const db = getDb();
  console.log(`Seeding "Schedule Enquiry" form (id=${FORM_ID})...`);

  await db
    .insert(schema.forms)
    .values({
      id: FORM_ID,
      title: "Schedule Enquiry",
      slug: FORM_SLUG,
      fields: JSON.stringify(FIELDS),
      settings: JSON.stringify(SETTINGS),
      status: "published",
    })
    .onConflictDoNothing({ target: schema.forms.id });

  console.log(`  + ${FORM_ID} (published)`);
  console.log(
    `Done. Form "Schedule Enquiry" is live at /api/submit/${FORM_ID}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
