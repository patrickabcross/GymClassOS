/**
 * PER-DEPLOY tenant brand (customer-facing surfaces).
 *
 * Sourced from doyouhustle.co.uk (HUSTLE gym, first RunStudio customer).
 * The next gym swaps these VALUES — one file. Automated brand fetch is
 * deferred to gym #2 (see SESSION-2026-06-22-brand-restyle-handoff.md).
 *
 * Owner-facing /gymos chrome is a SEPARATE RunStudio-brand track —
 * do NOT use tenantBrand there.
 *
 * Pure module — no DB, no side-effects, no async, safe to import anywhere in
 * server/lib (Nitro bundling rule: helper files belong here, never server/plugins).
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
 * HUSTLE brand tokens — locked with user 2026-06-22.
 * To deploy for a new gym: swap these values and redeploy.
 */
export const tenantBrand: TenantBrand = {
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
