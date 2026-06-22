/**
 * PER-DEPLOY tenant brand DEFAULTS (customer-facing surfaces).
 *
 * This module is the FALLBACK / DEFAULT only. Live values come from the
 * "brand-styling" Studio Brain doc via tenant-brand-resolver.ts.
 * Editing that Brain doc (via /gymos/brain → Brand & Styling card) re-themes
 * all 5 public SSR surfaces within ~30s without a redeploy.
 *
 * Until the brand-styling doc is first edited, behavior is UNCHANGED —
 * DEFAULT_TENANT_BRAND is seeded into the doc on first Brain init.
 *
 * Owner-facing /gymos chrome is a SEPARATE RunStudio-brand track —
 * do NOT use tenantBrand there.
 *
 * Pure module — no DB, no side-effects, no async, safe to import anywhere
 * including client bundles (Nitro bundling rule: helper files in server/lib,
 * never server/plugins; this file must NEVER import DB modules).
 */

export interface TenantBrand {
  /** Customer-facing gym name, e.g. "Hustle" */
  displayName: string;
  /** CSS font-family stack — ready to inject into inline style strings */
  fontFamily: string;
  /** Google Fonts stylesheet href — ready for <link href="..."> in <head> */
  googleFontsHref: string;
  /** Primary CTA/accent colour hex — used as button background default */
  primary: string;
  /**
   * Text colour ON the primary background.
   * WCAG: #FAD02C yellow + white (#fff) fails contrast — must be dark #121212.
   */
  primaryText: string;
  /** Secondary accent for hovers/highlights */
  secondaryAccent: string;
  /** Main body/ink colour */
  ink: string;
  /** Page background */
  bg: string;
  /** Alternate/muted background */
  bgAlt: string;
  /** Default border-radius in px (used for embed widgets) */
  radius: number;
  /** Gym logo URL (black wordmark, suitable on white/light backgrounds) */
  logoUrl: string;
}

/**
 * HUSTLE brand defaults — locked with user 2026-06-22.
 * These are the fallback values used when the brand-styling Brain doc is
 * absent or malformed. The resolver (tenant-brand-resolver.ts) deep-merges
 * the DB doc over these defaults per-field, so a partial doc is safe.
 *
 * To onboard a new gym: update the brand-styling Brain doc via /gymos/brain,
 * or change these defaults and redeploy (one file).
 */
export const DEFAULT_TENANT_BRAND: TenantBrand = {
  displayName: "Hustle",
  fontFamily: '"Poppins", system-ui, -apple-system, sans-serif',
  googleFontsHref:
    "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&display=swap",
  primary: "#FAD02C",
  primaryText: "#121212",
  secondaryAccent: "#CE6334",
  ink: "#121212",
  bg: "#FFFFFF",
  bgAlt: "#F0F4F8",
  radius: 8,
  logoUrl:
    "https://static1.squarespace.com/static/5df9f5e185a8b572c107b1bd/t/5e088d17e3302c0f49c11808/1577618712599/Hustle+Logo+black.png",
};

/**
 * Back-compat alias — the 5 SSR renderers have been re-pointed to
 * getTenantBrand() from tenant-brand-resolver.ts, but this alias ensures
 * any stray import of `tenantBrand` still compiles and returns the defaults.
 */
export const tenantBrand: TenantBrand = DEFAULT_TENANT_BRAND;
