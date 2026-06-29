# iOS EAS Build Runbook — Hustle member app

Operator-facing steps to produce an installable iOS build of the member app
(`packages/mobile-app`) under the customer's own accounts. The app identity is
already staged for this (see "Already set" below); the only values still pointing
at the upstream owner are regenerated automatically by `eas init`.

> **Direction note (supersedes a CLAUDE.md constraint):** this stands up a **new**
> app under a **new** Apple Developer account. It supersedes the original v1 line
> _"mobile work is updates to the customer's existing app under their existing
> developer accounts; no new App Store / Play Store submissions."_ We are shipping
> the agent-native mobile fork as its own app.

---

## Prerequisites (do these in the browser first)

1. **Apple Developer Program membership — active.** Individual enrols fast;
   Organization needs D-U-N-S verification (can take days). From the Apple Developer
   site → **Membership**, copy the **Team ID** (10 chars). EAS will ask for it.
2. **Expo account/org (free).** Create one at expo.dev — ideally a reusable org
   (e.g. a RunStudio org) so future gym apps live under the same account. This
   becomes the EAS project owner.
3. **Register the App ID in Apple.** Certificates, Identifiers & Profiles →
   **Identifiers** → new App ID with bundle id **`com.airunstudio.app`** (must match
   `app.json` exactly). Enable the **Push Notifications** capability here only if you
   want push (see optional section).

## Build steps

```bash
# 1. Log in to the NEW Expo account (not the upstream one)
npx eas login

# 2. From the mobile app package — this REGENERATES expo.owner +
#    expo.extra.eas.projectId in app.json under the new account,
#    replacing the upstream "steve8708" / "b359544d-..." values.
cd packages/mobile-app
npx eas init

# 3. Generate the EAS build profiles wiring (eas.json already exists with
#    development / preview / production profiles — this syncs project config)
npx eas build:configure

# 4a. Dev client build for a physical device (recommended first build —
#     needed for native modules like HealthKit later):
npx eas build -p ios --profile development

# 4b. OR an internal preview build (remote push stripped via
#     AGENT_NATIVE_MOBILE_DISABLE_REMOTE_PUSH, set in the preview-install profile):
npx eas build -p ios --profile preview
```

During step 4, EAS prompts to **create/sync iOS credentials** (distribution
certificate + provisioning profile). Let EAS manage them — supply the **Apple
Team ID** and sign in to Apple when prompted. EAS stores the credentials against
the Expo project for repeat builds.

When the build finishes, EAS prints a URL / QR. Install on a registered device
(a development profile requires the device's UDID to be on the provisioning
profile — EAS walks you through registering it).

## Push notifications (optional — deferred)

The app already bundles `expo-notifications`. To enable real push later:

1. On the `com.airunstudio.app` App ID, enable the **Push Notifications** capability.
2. Create an **APNs Auth Key (.p8)** (Keys → new key, Apple Push Notifications service).
3. Run `npx eas credentials` (or let `eas build` prompt) and upload the `.p8` —
   EAS configures the push key for the project.

Until then, use `--profile preview`, which strips the push entitlement.

## app.json field ownership

| Field                                                   | State                          | Who sets it                                         |
| ------------------------------------------------------- | ------------------------------ | --------------------------------------------------- |
| `expo.name` = `"Hustle"`                                | ✅ already set                 | committed                                           |
| `expo.ios.bundleIdentifier` = `"com.airunstudio.app"` | ✅ already set                 | committed (must match the registered Apple App ID)  |
| `expo.android.package` = `"com.airunstudio.app"`      | ✅ already set                 | committed                                           |
| `expo.slug` = `"hustle"`                                | ✅ already set                 | committed                                           |
| `expo.owner`                                            | ⬜ removed (was `steve8708`)   | **`eas init`** writes the new Expo account          |
| `expo.extra.eas.projectId`                              | ⬜ removed (was upstream)      | **`eas init`** writes the new project id            |

> `owner` and `extra.eas.projectId` were stripped (commit 41753cfa) so `eas init`
> creates a clean project under your account instead of failing on the upstream
> `steve8708` project's access.

## expo-doctor pre-flight (2026-06-25)

Ran `npx expo-doctor` so a real first-build failure can be told apart from
expected noise. 14/19 passed; the 5 failures:

- **FIXED** — `app.json` `newArchEnabled` removed. SDK 55 enables the New
  Architecture by default and dropped `newArchEnabled` from the config schema,
  so the flag was an invalid (and redundant) field. New Arch stays ON.
- **EXPECTED / INTENTIONAL** — the `metro.config.js` override is the deliberate
  Windows-watcher `blockList` + `CI=1` fix (commit 3d6b9a1f). expo-doctor flags
  any metro override, but it only affects local dev, **not** the EAS cloud build.
  Leave it.
- **WATCH (pnpm-monorepo hoisting/catalog artifacts — NOT fixed pre-emptively;
  only touch if the first `eas build` actually fails):**
  - duplicate native module dependencies (hoisting);
  - `@expo/metro-runtime` resolves to `5.0.5` vs expo-router's expected `^55.0.10`;
  - minor/patch SDK drift — `expo` + `expo-*` slightly behind `~55.0.27`, while
    `react` / `react-native` are slightly **ahead** because the workspace catalog
    pins them. **Do NOT downgrade react/react-native to satisfy expo-doctor** — it
    would break monorepo consistency.
  - If the build fails on bundling or a native-module version, run
    `npx expo install --check` and review each suggested change against the
    workspace catalog before applying.
