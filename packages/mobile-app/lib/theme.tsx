/**
 * GymClassOS Mobile Theme Foundation
 *
 * Single source of hex/token values for the mobile app. All component files
 * consume tokens via `useTheme()` — they must NOT contain any hex literals.
 *
 * Skin selection: `EXPO_PUBLIC_STUDIO_SKIN` env var (set at EAS build time).
 * Defaults to "default" when unset or unknown.
 *
 * Usage pattern in component files:
 *   const theme = useTheme();
 *   // Build styles in component body (not at module level — StyleSheet.create
 *   // runs once at module load time and cannot read context values):
 *   const styles = React.useMemo(() => StyleSheet.create({
 *     container: { backgroundColor: theme.colors.background },
 *   }), [theme]);
 *   // OR use inline style objects directly:
 *   <View style={{ backgroundColor: theme.colors.background }} />
 *
 * Downstream plans R5-02/03/04 follow this pattern exclusively.
 */
import { createContext, useContext } from "react";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Token type — the contract every consumer depends on
// ---------------------------------------------------------------------------

export type StudioTokens = {
  colors: {
    /** Near-black page background */
    background: string;
    /** Elevated surface (cards) */
    card: string;
    /** Higher elevated surface (sheets, pills) */
    cardElevated: string;
    /** Hairline divider */
    border: string;
    /** Primary text — high contrast */
    foreground: string;
    /** Secondary text */
    muted: string;
    /** Tertiary text / empty states */
    mutedFaint: string;
    /** Studio accent — orange-500 family */
    accent: string;
    /** Accent hover / pressed state */
    accentHover: string;
    /** Tint background for active pills (dark-mode analog of web #FFF7ED) */
    accentSoft: string;
    /** Text rendered on top of accent background */
    accentForeground: string;
    /** Booked / positive state */
    success: string;
    /** Low balance / full / error */
    danger: string;
    /** Danger pill background */
    dangerSoft: string;
    /** Amber warning */
    warning: string;
    /** Modal backdrop */
    overlay: string;
    /** Shadow color for elevation effects */
    shadow: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  font: {
    regular: string;
    semibold: string;
    bold: string;
  };
};

// ---------------------------------------------------------------------------
// Skins — only this file is allowed to contain hex literals
// ---------------------------------------------------------------------------

/**
 * GymClassOS default skin: dark-first, high-contrast, orange-500 accent.
 * Contrast ratios (approx):
 *   foreground (#FAFAFA) on background (#0A0A0B): ≈ 19:1  ✓ WCAG AAA
 *   accentForeground (#FFFFFF) on accent (#F97316): ≈ 3.1:1 — acceptable for
 *   large text / CTA buttons (WCAG AA Large); orange-on-black is 4.5:1+ for
 *   icon-only uses where the background is near-black.
 */
const defaultSkin: StudioTokens = {
  colors: {
    background: "#0A0A0B",
    card: "#161618",
    cardElevated: "#1F1F22",
    border: "#2A2A2E",
    foreground: "#FAFAFA",
    muted: "#A1A1AA",
    mutedFaint: "#71717A",
    accent: "#F97316",
    accentHover: "#EA580C",
    accentSoft: "#3A2410",
    accentForeground: "#FFFFFF",
    success: "#16A34A",
    danger: "#DC2626",
    dangerSoft: "#7F1D1D",
    warning: "#FBBF24",
    overlay: "rgba(0,0,0,0.6)",
    shadow: "#000000",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
  font: {
    regular: "Inter-Regular",
    semibold: "Inter-SemiBold",
    bold: "Inter-Bold",
  },
};

/**
 * Hustle skin — brand values sourced from Hustle's live site
 * (doyouhustle.co.uk, Squarespace custom.css): burnt-orange #ce6334 primary
 * with #b5532b as the hover shade. accentSoft is a dark warm tint for the
 * dark-first mobile theme; derived from the primary.
 */
const hustleSkin: StudioTokens = {
  ...defaultSkin,
  colors: {
    ...defaultSkin.colors,
    accent: "#ce6334", /* Hustle burnt orange */
    accentHover: "#b5532b", /* Hustle hover shade (from custom.css) */
    accentSoft: "#371c10", /* dark warm tint for dark-first mobile */
    accentForeground: "#ffffff",
  },
};

// ---------------------------------------------------------------------------
// Skin registry + env resolution
// ---------------------------------------------------------------------------

const skins = {
  default: defaultSkin,
  hustle: hustleSkin,
} as const;

type SkinKey = keyof typeof skins;

const activeSkin: StudioTokens =
  skins[(process.env.EXPO_PUBLIC_STUDIO_SKIN as SkinKey)] ?? skins.default;

// ---------------------------------------------------------------------------
// Context + hooks
// ---------------------------------------------------------------------------

const ThemeContext = createContext<StudioTokens>(activeSkin);

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeContext.Provider value={activeSkin}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): StudioTokens {
  return useContext(ThemeContext);
}
