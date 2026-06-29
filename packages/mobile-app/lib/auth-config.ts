// Configurable per studio (repeatable-per-client, D-06).
// Override these via EXPO_PUBLIC_* env vars at EAS build time so a new
// client deploy points to their own site with no code change.
//
// Default subscribe URL: HUSTLE's studio site (doyouhustle.co.uk).
// Default reset URL: runstudioai.com account management page (D-05).
//
// These are deep-link targets only — the app opens them in expo-web-browser.
// There is NO in-app sign-up screen and NO in-app password-reset screen (D-03).
export const SUBSCRIBE_URL =
  process.env.EXPO_PUBLIC_SUBSCRIBE_URL ?? "https://doyouhustle.co.uk";

export const RESET_PASSWORD_URL =
  process.env.EXPO_PUBLIC_RESET_PASSWORD_URL ??
  "https://runstudioai.com/reset-password";
