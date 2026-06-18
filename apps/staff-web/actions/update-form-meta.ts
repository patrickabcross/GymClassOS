import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

const SettingsPatch = z.object({
  submitText: z.string().optional(),
  successMessage: z.string().optional(),
  redirectUrl: z.string().optional(),
  showProgressBar: z.boolean().optional(),
});

export default defineAction({
  description:
    "Edit a form's title, description, and settings (submit text, success message). Does NOT change publish status or slug. Returns { updated: true }.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id"),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
    settings: SettingsPatch.optional().describe("Partial settings to merge"),
  }),
  run: async ({ formId, title, description, settings }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db
      .select({ id: schema.forms.id, settings: schema.forms.settings })
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (title !== undefined) patch.title = title;
    if (description !== undefined) patch.description = description;
    if (settings !== undefined) {
      let current: Record<string, unknown> = {};
      try {
        current = JSON.parse(form.settings) ?? {};
      } catch {
        current = {};
      }
      patch.settings = JSON.stringify({ ...current, ...settings });
    }
    // guard:allow-unscoped — single-tenant gym forms
    await db.update(schema.forms).set(patch).where(eq(schema.forms.id, formId));
    return { updated: true };
  },
});
