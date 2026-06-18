import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";
import { assertValidFields } from "../features/forms/lib/validate-fields.js";

export default defineAction({
  description:
    "Replace a form's fields array (add/remove/reorder fields). All fields are Zod-validated AND XSS-guarded before write — malformed fields are rejected and never persisted. Pass the COMPLETE desired fields array (this replaces, it does not merge). Returns { updated: true, fieldCount } or { error }.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id"),
    fields: z
      .array(FormFieldSchema)
      .describe("Complete replacement fields array"),
  }),
  run: async ({ formId, fields }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db
      .select({ id: schema.forms.id, deletedAt: schema.forms.deletedAt })
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };
    if (form.deletedAt) return { error: "FORM_IS_ARCHIVED" };

    // Second-pass XSS guard (id regex, dup ids, numeric min/max) — Zod alone misses these.
    try {
      assertValidFields(fields);
    } catch (e) {
      return { error: e instanceof Error ? e.message : "FIELDS_INVALID" };
    }

    // guard:allow-unscoped — single-tenant gym forms
    await db
      .update(schema.forms)
      .set({
        fields: JSON.stringify(fields),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.forms.id, formId));
    return { updated: true, fieldCount: fields.length };
  },
});
