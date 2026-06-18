import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";

export default defineAction({
  description:
    "Unpublish a published form — reverts it to draft and takes it offline at /f/{slug}. Direct action, no approval needed. Returns { unpublished: true }.",
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
      .set({ status: "draft", updatedAt: new Date().toISOString() })
      .where(eq(schema.forms.id, formId));
    return { unpublished: true };
  },
});
