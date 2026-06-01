// ---------------------------------------------------------------------------
// Forked forms + responses tables for GymClassOS staff-web.
//
// Source: templates/forms/server/db/schema.ts
//
// Changes from upstream:
//   - Dropped ownableColumns() and createSharesTable() — the gym pilot is
//     single-tenant; all forms belong to the studio. No per-user ownership.
//   - Dropped the formShares table — no sharing model for pilot.
//   - guard:allow-unscoped — gym domain tables are single-tenant by design;
//     no ownableColumns() means no access filter needed on these tables.
//
// ---------------------------------------------------------------------------
import { table, text, now } from "@agent-native/core/db/schema";

// guard:allow-unscoped — gym domain tables are single-tenant; forms have no
// per-user ownership in the pilot. Single studio, single deploy.
export const forms = table("forms", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  fields: text("fields").notNull(), // JSON array of FormField
  settings: text("settings").notNull(), // JSON FormSettings
  status: text("status", { enum: ["draft", "published", "closed"] })
    .notNull()
    .default("draft"),
  createdAt: text("created_at").notNull().default(now()),
  updatedAt: text("updated_at").notNull().default(now()),
  // ISO timestamp when soft-deleted, NULL while live.
  deletedAt: text("deleted_at"),
});

// guard:allow-unscoped — responses belong to the studio, not to individual staff users.
export const responses = table("responses", {
  id: text("id").primaryKey(),
  formId: text("form_id")
    .notNull()
    .references(() => forms.id),
  data: text("data").notNull(), // JSON object: { fieldId: value }
  submittedAt: text("submitted_at").notNull().default(now()),
  ip: text("ip"),
  submitterEmail: text("submitter_email"),
});
