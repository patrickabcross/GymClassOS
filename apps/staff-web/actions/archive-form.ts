import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Archive a form (soft-delete; also takes it offline if it was published). Reversible with restore-form. Returns { archived: true }.",
  schema: z.object({
    formId: z.string().min(1).describe("The form's id"),
  }),
  run: async ({ formId }) => {
    const db = getDb();
    // guard:allow-unscoped — single-tenant gym forms
    const [form] = await db
      .select({ id: schema.forms.id })
      .from(schema.forms)
      .where(eq(schema.forms.id, formId))
      .limit(1);
    if (!form) return { error: "FORM_NOT_FOUND" };
    // guard:allow-unscoped — single-tenant gym forms
    await db
      .update(schema.forms)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, formId));
    return { archived: true };
  },
});
