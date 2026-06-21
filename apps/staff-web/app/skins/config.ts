// Studio skin registry — non-CSS identity (name + logo) consumed by the root
// loader (root.tsx) and GymosTopNav. CSS token overrides live in the sibling
// <name>.css files, keyed by the data-studio attribute. (R2 D-05)
export type SkinName = "default" | "hustle";

export interface SkinConfig {
  displayName: string;
  logo: string | null; // public path e.g. "/logos/hustle.svg", or null = styled wordmark
}

const skins: Record<SkinName, SkinConfig> = {
  default: {
    displayName: "RunStudio",
    logo: null, // wordmark only for default (R2 D-04)
  },
  hustle: {
    // Brand confirmed from doyouhustle.co.uk: black "HUSTLE" wordmark + Poppins.
    // Logo is wordmark-only, so the styled-wordmark fallback (logo: null) matches brand.
    displayName: "Hustle",
    logo: null,
  },
};

export function getSkinConfig(name: string): SkinConfig {
  return skins[name as SkinName] ?? skins.default;
}
