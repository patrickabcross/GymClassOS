// GOB-03: Owner edit of brand-voice, ethos, or brand-styling doc body.
//
// The .strict() schema structurally limits editable docs to brand-voice,
// ethos, and brand-styling. The class-catalog doc (auto-seeded from
// class_definitions) cannot be edited via this action.
// Only the body field changes — docType, title, and seededAt are never
// touched by this action.
//
// For brand-styling: the body MUST be valid JSON matching the TenantBrand
// token shape. Malformed JSON or wrong types are rejected with
// { updated: false, reason: "INVALID_BRAND_JSON" } — no DB write.
// On a successful brand-styling write, the tenant-brand cache is invalidated
// so the next SSR render re-reads within ~30s.
//
// guard:allow-unscoped — studio-global single-tenant Brain (no ownableColumns)

import { z } from "zod";
import { defineAction } from "@agent-native/core";
import { getDb, schema } from "../server/db/index.js";
import { eq } from "drizzle-orm";
import { invalidateTenantBrandCache } from "../server/lib/tenant-brand-resolver.js";

// Zod schema for the brand-styling token body (all fields optional — partial
// doc is safe; the resolver fills in defaults per-field).
const brandTokenSchema = z
  .object({
    displayName: z.string().optional(),
    fontFamily: z.string().optional(),
    googleFontsHref: z.string().optional(),
    primary: z.string().optional(),
    primaryText: z.string().optional(),
    secondaryAccent: z.string().optional(),
    ink: z.string().optional(),
    bg: z.string().optional(),
    bgAlt: z.string().optional(),
    radius: z.number().optional(),
    logoUrl: z.string().optional(),
  })
  .passthrough(); // allow extra fields without rejecting

export default defineAction({
  description:
    "Update the body of a studio Brain document. Editable docs: " +
    "'brand-voice', 'ethos', 'brand-styling'. " +
    "For brand-styling, body must be valid JSON matching the TenantBrand token shape. " +
    "Returns { updated: true, id } on success, or { updated: false, reason } on validation failure.",
  schema: z
    .object({
      id: z.enum(["brand-voice", "ethos", "brand-styling"]).describe(
        "Which Brain doc to update.",
      ),
      body: z
        .string()
        .max(20000)
        .describe(
          "The new body content. Markdown for brand-voice/ethos; JSON for brand-styling.",
        ),
    })
    .strict(),
  // No http key → mutation (POST-only auto-mount)
  run: async ({ id, body }) => {
    // Validate brand-styling JSON token body before writing.
    if (id === "brand-styling") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return { updated: false, reason: "INVALID_BRAND_JSON" };
      }
      const result = brandTokenSchema.safeParse(parsed);
      if (!result.success) {
        return { updated: false, reason: "INVALID_BRAND_JSON" };
      }
    }

    const db = getDb();
    const nowIso = new Date().toISOString();

    // guard:allow-unscoped — studio-global single-tenant Brain
    await db
      .update(schema.studioBrainDocs)
      .set({ body, updatedAt: nowIso })
      .where(eq(schema.studioBrainDocs.id, id));

    // Invalidate the brand cache so SSR surfaces re-theme within ~30s.
    if (id === "brand-styling") {
      invalidateTenantBrandCache();
    }

    return { updated: true, id };
  },
});
