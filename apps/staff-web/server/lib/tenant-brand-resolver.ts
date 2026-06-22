/**
 * Server-only tenant brand resolver.
 *
 * Reads the "brand-styling" Studio Brain doc from Neon and deep-merges it
 * over DEFAULT_TENANT_BRAND per-field. Falls back to defaults on any error
 * or missing/malformed doc — public SSR surfaces never break.
 *
 * 30-second in-process cache (module-level). Invalidated immediately on a
 * successful brand-styling save via invalidateTenantBrandCache().
 *
 * IMPORTANT: This file imports the DB — it is SERVER-ONLY and must never be
 * imported by anything in the client bundle (e.g. app/routes, components).
 * The pure defaults + interface live in tenant-brand.ts which IS client-safe.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { DEFAULT_TENANT_BRAND, type TenantBrand } from "./tenant-brand.js";

// ─── Cache ────────────────────────────────────────────────────────────────────

const TTL_MS = 30_000;
let cache: { brand: TenantBrand; at: number } | null = null;

/** Force the next getTenantBrand() call to re-read from the DB. */
export function invalidateTenantBrandCache(): void {
  cache = null;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Returns the resolved TenantBrand, merging the brand-styling Brain doc over
 * DEFAULT_TENANT_BRAND per-field. Missing or malformed fields fall back to
 * the default for that field — this function never throws.
 */
export async function getTenantBrand(): Promise<TenantBrand> {
  // Serve from cache if fresh
  if (cache && Date.now() - cache.at < TTL_MS) {
    return cache.brand;
  }

  try {
    const db = getDb();

    // guard:allow-unscoped — single-tenant studio Brain (no ownableColumns)
    const rows = await db
      .select()
      .from(schema.studioBrainDocs)
      .where(eq(schema.studioBrainDocs.id, "brand-styling"))
      .limit(1);

    const row = rows[0];

    if (!row || !row.body) {
      // No doc yet — use defaults (seed from brain-init hasn't run, or body empty)
      const brand = DEFAULT_TENANT_BRAND;
      cache = { brand, at: Date.now() };
      return brand;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(row.body) as Record<string, unknown>;
    } catch {
      // Body not valid JSON — fall back to defaults
      cache = { brand: DEFAULT_TENANT_BRAND, at: Date.now() };
      return DEFAULT_TENANT_BRAND;
    }

    // Deep-merge per field: take parsed[key] only if correct type and non-empty.
    // This makes a partial or partially-garbage doc safe.
    const str = (key: keyof TenantBrand): string => {
      const v = parsed[key];
      return typeof v === "string" && v.trim().length > 0
        ? (v as string)
        : (DEFAULT_TENANT_BRAND[key] as string);
    };

    const brand: TenantBrand = {
      displayName: str("displayName"),
      fontFamily: str("fontFamily"),
      googleFontsHref: str("googleFontsHref"),
      primary: str("primary"),
      primaryText: str("primaryText"),
      secondaryAccent: str("secondaryAccent"),
      ink: str("ink"),
      bg: str("bg"),
      bgAlt: str("bgAlt"),
      logoUrl: str("logoUrl"),
      radius: Number.isFinite(Number(parsed.radius))
        ? Number(parsed.radius)
        : DEFAULT_TENANT_BRAND.radius,
    };

    cache = { brand, at: Date.now() };
    return brand;
  } catch {
    // DB error or any unexpected throw — never break a public page renderer
    cache = { brand: DEFAULT_TENANT_BRAND, at: Date.now() };
    return DEFAULT_TENANT_BRAND;
  }
}
