import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { FormFieldSchema } from "../features/forms/lib/form-field-schema.js";

export default defineAction({
  description:
    "Publish a draft form (makes it live at /f/{slug}). Must be approved via propose-action first — the agent never calls this directly. Re-validates the form's fields before going live. Returns { published: true, slug } or { error }.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id to publish"),
  }),
  run: async ({ formId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db
      .select()
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };
    if (form.deletedAt) return { error: "FORM_IS_ARCHIVED" };

    // Re-validate fields before going live (prevent malformed JSON silently
    // breaking the public renderer).
    let fields: unknown;
    try {
      fields = JSON.parse(form.fields);
    } catch {
      return { error: "FIELDS_INVALID_JSON" };
    }
    const parsed = z.array(FormFieldSchema).safeParse(fields);
    if (!parsed.success) {
      return { error: "FIELDS_INVALID", issues: parsed.error.issues };
    }

    // guard:allow-unscoped — single-tenant gym forms
    await db
      .update(schema.forms)
      .set({ status: "published", updatedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, formId));
    return { published: true, slug: form.slug };
  },
});
