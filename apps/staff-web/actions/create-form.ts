import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { slugify } from "../features/forms/lib/slugify.js";

export default defineAction({
  description:
    "Create a new lead-capture form as a draft. Returns { id, title, slug }. The form starts empty (no fields) — add fields with update-form-fields, then publish with propose-action.",
  schema: z.object({
    title: z.string().min(1).max(200).describe("Form title"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Optional description"),
  }),
  run: async ({ title, description }) => {
    const db = getDb();
    const slugBase = slugify(title);
    let slug = slugBase;
    let attempt = 0;
    // guard:allow-unscoped — single-tenant gym forms
    while (true) {
      const existing = await db
        .select({ id: schema.forms.id })
        .from(schema.forms)
        .where(eq(schema.forms.slug, slug))
        .then((r) => r[0]);
      if (!existing) break;
      attempt++;
      slug = `${slugBase}-${attempt}`;
    }
    const id = `form_${nanoid()}`;
    const now = new Date().toISOString();
    // guard:allow-unscoped — single-tenant gym forms
    await db.insert(schema.forms).values({
      id,
      title,
      slug,
      description: description ?? null,
      fields: JSON.stringify([]),
      settings: JSON.stringify({}),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { id, title, slug };
  },
});
