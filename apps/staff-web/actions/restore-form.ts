import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Restore an archived form (clears the archive flag). The form returns as a draft; republish via propose-action if it should go live. Returns { restored: true }.",
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
      .set({ deletedAt: null, updatedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, formId));
    return { restored: true };
  },
});
