---
phase: R5-member-mobile-app-redesign
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/mobile-app/lib/theme.ts
  - packages/mobile-app/app/_layout.tsx
  - packages/mobile-app/package.json
  - packages/mobile-app/assets/fonts/Inter-Regular.otf
  - packages/mobile-app/assets/fonts/Inter-SemiBold.otf
  - packages/mobile-app/assets/fonts/Inter-Bold.otf
autonomous: true
requirements: [MOBL-01, MOBL-03, MOBL-07]
must_haves:
  truths:
    - "The app opens in a high-contrast dark theme by default (near-black surfaces, orange accent)"
    - "Inter loads via useFonts and the app gates render until fonts are loaded"
    - "A theme.ts token file exists and is the single source of color/spacing/radius/font values"
    - "EXPO_PUBLIC_STUDIO_SKIN selects between the default skin and a Hustle placeholder skin"
  artifacts:
    - path: "packages/mobile-app/lib/theme.ts"
      provides: "ThemeContext + useTheme() hook + default skin + hustle placeholder skin + EXPO_PUBLIC_STUDIO_SKIN resolution"
      contains: "export function useTheme"
    - path: "packages/mobile-app/app/_layout.tsx"
      provides: "ThemeProvider wrapping root + useFonts render gate; zero bare hex"
      contains: "useFonts"
    - path: "packages/mobile-app/assets/fonts/Inter-Regular.otf"
      provides: "Self-hosted Inter OTF (Expo Go compatible)"
  key_links:
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "packages/mobile-app/lib/theme.ts"
      via: "ThemeProvider import + wrap"
      pattern: "ThemeProvider"
    - from: "packages/mobile-app/app/_layout.tsx"
      to: "assets/fonts"
      via: "useFonts require"
      pattern: "useFonts"
---

<objective>
Create the mobile theme foundation that every other R5 plan consumes: a hand-rolled `lib/theme.ts` token file (ThemeContext + `useTheme()` hook, dark-first, orange accent mirroring the R2 web brand), wire `ThemeProvider` + a `useFonts` Inter render-gate into the root layout, and self-host Inter OTF assets.

Purpose: React Native has no CSS-variable cascade (PITFALLS R-04). The web token system cannot propagate to native — a parallel JS token object consumed via context is the only mechanism that lets the mobile app be studio-skinnable and dark-first. This MUST land before the tab, Home, and booking plans (they all call `useTheme()`).

Output: `lib/theme.ts`, a font-gated `ThemeProvider`-wrapped root layout, and Inter OTF assets under `assets/fonts/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md
@.planning/research/STACK.md
@.planning/research/PITFALLS.md
@.planning/phases/R2-design-system-token-layer/R2-CONTEXT.md

<interfaces>
<!-- The token shape downstream plans (R5-02/03/04) will consume via useTheme(). -->
<!-- Define these contracts here; downstream plans import { useTheme } and read theme.colors.* / theme.font.* / theme.radius.* / theme.spacing.* -->

Target StudioTokens shape (mirror R2 semantics; values are Claude's discretion within dark-first orange brand):
```typescript
export type StudioTokens = {
  colors: {
    background: string;      // near-black page background, e.g. "#0A0A0B"
    card: string;            // elevated surface, e.g. "#161618"
    cardElevated: string;    // higher surface (sheets/pills), e.g. "#1F1F22"
    border: string;          // hairline divider, e.g. "#2A2A2E"
    foreground: string;      // primary text, high contrast, e.g. "#FAFAFA"
    muted: string;           // secondary text, e.g. "#A1A1AA"
    mutedFaint: string;      // tertiary text/empty states, e.g. "#71717A"
    accent: string;          // studio accent — orange-500 family "#F97316"
    accentHover: string;     // orange-600 "#EA580C"
    accentSoft: string;      // tint background for active pills "#3A2410" (dark-mode tint)
    accentForeground: string;// text on accent, e.g. "#FFFFFF"
    success: string;         // booked/positive, e.g. "#16A34A"
    danger: string;          // low balance/full/error, e.g. "#DC2626"
    dangerSoft: string;      // danger pill bg, e.g. "#7F1D1D"
    warning: string;         // amber warning (OFF no-nutrition), e.g. "#FBBF24"
    overlay: string;         // modal backdrop, e.g. "rgba(0,0,0,0.6)"
  };
  radius: { sm: number; md: number; lg: number; pill: number };   // e.g. 8/12/16/999
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number }; // 4/8/12/16/24
  font: {
    regular: string;   // "Inter-Regular"
    semibold: string;  // "Inter-SemiBold"
    bold: string;      // "Inter-Bold"
  };
};
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Inter OTF assets + expo-font dependency</name>
  <read_first>
    - packages/mobile-app/package.json (current deps — note expo ^55, NO expo-font direct dep yet; @expo/vector-icons present)
    - .planning/research/STACK.md (Font Strategy → Expo Mobile App section: useFonts, OTF not TTF, assets in packages/mobile-app/assets/fonts/, from github.com/rsms/inter)
  </read_first>
  <files>packages/mobile-app/assets/fonts/Inter-Regular.otf, packages/mobile-app/assets/fonts/Inter-SemiBold.otf, packages/mobile-app/assets/fonts/Inter-Bold.otf, packages/mobile-app/package.json</files>
  <action>
    Create the `packages/mobile-app/assets/fonts/` directory and place three Inter OTF files: `Inter-Regular.otf`, `Inter-SemiBold.otf`, `Inter-Bold.otf`. Download from the Inter release at github.com/rsms/inter (the `Inter Desktop` OTF set, or the `extras/otf` directory of the release zip). Use OTF, NOT TTF (STACK.md: OTF is smaller and renders better per Expo docs). Do NOT use the variable font for the mobile OTF set — use the three static weights so `useFonts` keys map 1:1.

    If network download of the OTFs is not possible in this environment, STOP and surface this as a checkpoint — do NOT commit placeholder/empty files or substitute a different font. The font assets are required for MOBL-07 and cannot be faked.

    Add `expo-font` to dependencies in `packages/mobile-app/package.json` pinned to the Expo 55 line: `"expo-font": "~55.0.x"` (match the installed Expo SDK 55 — use the exact `~55.0.*` version that `expo install expo-font` resolves; run `npx expo install expo-font` from `packages/mobile-app` if the toolchain is available, otherwise add the `~55.0.x` range manually consistent with the other `expo-*` deps in this file like `expo-camera` which is `~55.0.18`). expo-font's `useFonts` is Expo Go compatible (NOT the config plugin, which needs a dev build — per D-05).
  </action>
  <verify>
    <automated>ls -la packages/mobile-app/assets/fonts/Inter-Regular.otf packages/mobile-app/assets/fonts/Inter-SemiBold.otf packages/mobile-app/assets/fonts/Inter-Bold.otf && node -e "const p=require('./packages/mobile-app/package.json'); if(!p.dependencies['expo-font']) throw new Error('expo-font missing'); console.log('expo-font', p.dependencies['expo-font'])"</automated>
  </verify>
  <done>Three non-empty Inter OTF files exist in assets/fonts/; expo-font is a dependency in package.json on the ~55.0.x line.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Create lib/theme.ts (ThemeContext + useTheme + default + Hustle skins)</name>
  <read_first>
    - .planning/research/STACK.md (Surface 3: Expo Mobile App — ThemeContext ~60 lines, useTheme(); NOT unistyles/NativeWind)
    - .planning/research/PITFALLS.md (R-04: RN StyleSheet has no CSS variable cascade — JS constants bridge is the fix; first task of mobile phase is the token file before any visual change)
    - .planning/phases/R2-design-system-token-layer/R2-CONTEXT.md (D-02 orange #F97316 / #EA580C accent + #FFF7ED-equivalent tint; D-03 radius 0.5rem≈8px; D-04 default + Hustle placeholder skin selected by env var; D-07 token vocabulary)
    - packages/mobile-app/app/(tabs)/index.tsx (current dark palette in use: #111 bg, #1a1a1a card, #1f2937 pill, #999/#666 muted text, #3b82f6 accent, #7f1d1d danger, #16a34a success — these are the values to re-express as dark-first orange-accent tokens)
    - The <interfaces> block in this plan's <context> (the exact StudioTokens type to implement)
  </read_first>
  <files>packages/mobile-app/lib/theme.ts</files>
  <action>
    Create `packages/mobile-app/lib/theme.ts` (~80-110 lines) exporting:

    1. `export type StudioTokens = { ... }` exactly per the <interfaces> block (colors / radius / spacing / font).

    2. `const defaultSkin: StudioTokens` — the GymClassOS dark-first, high-contrast default (MOBL-03). Use a near-black background (`#0A0A0B`), layered dark surfaces (`#161618` card, `#1F1F22` elevated), high-contrast light text (`#FAFAFA` foreground, `#A1A1AA` muted, `#71717A` mutedFaint), and the R2 brand accent: `accent: "#F97316"`, `accentHover: "#EA580C"`, `accentForeground: "#FFFFFF"`, and a dark-mode accent tint `accentSoft: "#3A2410"` (a desaturated dark orange suitable as an active-pill background on near-black — the dark-mode analog of web's `#FFF7ED`). success `#16A34A`, danger `#DC2626`, dangerSoft `#7F1D1D`, warning `#FBBF24`, border `#2A2A2E`, overlay `rgba(0,0,0,0.6)`. radius `{ sm: 8, md: 12, lg: 16, pill: 999 }`, spacing `{ xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }`, font `{ regular: "Inter-Regular", semibold: "Inter-SemiBold", bold: "Inter-Bold" }`. Ensure foreground-on-background and accentForeground-on-accent meet high contrast (WCAG AA ≥ 4.5:1 for body text).

    3. `const hustleSkin: StudioTokens` — a placeholder skin VISIBLY DISTINCT from default so a skin switch is provable before real Hustle hex arrives (mirrors R2 D-04 / R2-CONTEXT placeholder pattern). Spread the default skin and override the accent family to a clearly different placeholder hue (e.g. a magenta/red `accent: "#E11D48"`, `accentHover: "#BE123C"`, `accentSoft: "#3A0E1A"`). Mark every overridden value with `/* TODO: replace with Hustle brand values */`.

    4. A skin registry + env resolution: `const skins = { default: defaultSkin, hustle: hustleSkin } as const;` and resolve the active skin from `process.env.EXPO_PUBLIC_STUDIO_SKIN` at module load, defaulting to `default` when unset or unknown (D-04, D-10). Example: `const activeSkin = skins[(process.env.EXPO_PUBLIC_STUDIO_SKIN as keyof typeof skins)] ?? skins.default;`

    5. `const ThemeContext = createContext<StudioTokens>(activeSkin);`
       `export function ThemeProvider({ children }: { children: React.ReactNode }) { return <ThemeContext.Provider value={activeSkin}>{children}</ThemeContext.Provider>; }`
       `export function useTheme(): StudioTokens { return useContext(ThemeContext); }`

    This file is the ONE file in the package permitted to contain hex literals (the token definitions). All `app/**` consumers reference `theme.colors.*` etc.

    Note for downstream: `useTheme()` returns the token object directly; consumers build StyleSheet objects inside the component body from theme values (RN StyleSheet.create cannot read context, so either inline style objects or a `makeStyles(theme)` factory called in-render — document the chosen pattern in a top-of-file comment so R5-02/03/04 follow it consistently). Recommend the inline/`useMemo`-derived styles pattern.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('packages/mobile-app/lib/theme.ts','utf8'); for(const t of ['export function useTheme','export function ThemeProvider','EXPO_PUBLIC_STUDIO_SKIN','hustle','#F97316']){ if(!s.includes(t)) throw new Error('missing: '+t);} console.log('theme.ts contracts present')"</automated>
  </verify>
  <done>theme.ts exports useTheme + ThemeProvider, defines default + hustle skins, resolves EXPO_PUBLIC_STUDIO_SKIN, uses #F97316 accent, and is dark-first.</done>
</task>

<task type="auto">
  <name>Task 3: Wire ThemeProvider + useFonts render-gate into app/_layout.tsx</name>
  <read_first>
    - packages/mobile-app/app/_layout.tsx (current root: QueryProvider > GestureRoot > AuthGate > Stack; 8 hardcoded hex: AuthGate loader #111/#fff, fab #3b82f6/#000/#fff, Stack screenOptions #111111/#ffffff)
    - packages/mobile-app/lib/theme.ts (the ThemeProvider + useTheme created in Task 2)
    - .planning/research/STACK.md (useFonts snippet: const [loaded] = useFonts({ "Inter-Regular": require("../assets/fonts/Inter-Regular.otf"), ... }))
    - .planning/phases/R5-member-mobile-app-redesign/R5-CONTEXT.md (D-10: ThemeContext wraps root layout; useFonts gate lives there too)
  </read_first>
  <files>packages/mobile-app/app/_layout.tsx</files>
  <action>
    Modify `app/_layout.tsx`:

    1. Import `useFonts` from `expo-font` and `ThemeProvider`, `useTheme` from `../lib/theme`.

    2. In `RootLayout`, load fonts and gate render:
    ```typescript
    const [fontsLoaded] = useFonts({
      "Inter-Regular": require("../assets/fonts/Inter-Regular.otf"),
      "Inter-SemiBold": require("../assets/fonts/Inter-SemiBold.otf"),
      "Inter-Bold": require("../assets/fonts/Inter-Bold.otf"),
    });
    if (!fontsLoaded) {
      return <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.colors.accent} /></View>;
    }
    ```
    Because the gate needs theme colors but `useTheme` must be inside `ThemeProvider`, structure as an outer `RootLayout` that renders `<ThemeProvider><ThemedRoot/></ThemeProvider>`, and put the `useFonts` gate + the rest inside `ThemedRoot` where `useTheme()` is valid. ThemeProvider wraps everything (above QueryProvider is fine, or just inside it — wrap at the outermost so all screens get context).

    3. Replace ALL 8 hardcoded hex with `theme.colors.*`:
       - AuthGate loader: `backgroundColor: "#111"` → `theme.colors.background`; `ActivityIndicator color="#fff"` → `theme.colors.foreground` (AuthGate is rendered inside ThemeProvider so it can call useTheme()).
       - FAB styles: `backgroundColor: "#3b82f6"` → `theme.colors.accent`; `shadowColor: "#000"` → keep as a token `theme.colors.overlay`-adjacent black or add no new token (use `"#000"` only inside theme.ts — here reference a token; if no black token exists, the shadowColor can use `theme.colors.background` is wrong for shadow — instead add a `shadow: "#000000"` value to the theme palette in Task 2 if needed, OR since shadowColor black is universal, expose `theme.colors.overlay` is rgba; cleanest: keep shadow color out of the grep by referencing a token). Add a `shadow` token if required so no bare `#000` remains.
       - FAB icon `color="#fff"` → `theme.colors.accentForeground`.
       - Stack/StatusBar `screenOptions` headerStyle/contentStyle `#111111` → `theme.colors.background` (or `theme.colors.card` for header if you want header contrast); `headerTintColor: "#ffffff"` → `theme.colors.foreground`. The `fabStyles` StyleSheet.create cannot read theme — convert FAB styles to an inline style object or a `makeFabStyles(theme)` factory called in `AgentFabAndSheet` (which is inside ThemeProvider). Apply the same pattern documented in theme.ts Task 2.

    4. Keep StatusBar `style="light"` (correct for dark-first).

    After this task, `grep -E "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/_layout.tsx` MUST return zero results.
  </action>
  <verify>
    <automated>test "$(grep -cE '#[0-9a-fA-F]{3,8}' packages/mobile-app/app/_layout.tsx)" = "0" && grep -q "useFonts" packages/mobile-app/app/_layout.tsx && grep -q "ThemeProvider" packages/mobile-app/app/_layout.tsx && echo "OK: zero hex, useFonts + ThemeProvider present"</automated>
  </verify>
  <done>_layout.tsx wraps the tree in ThemeProvider, gates render on useFonts (3 Inter weights), references theme tokens only, and contains zero bare hex.</done>
</task>

</tasks>

<verification>
- `grep -rE "#[0-9a-fA-F]{3,8}" packages/mobile-app/app/_layout.tsx` returns zero (this plan's owned app/ file is hex-clean).
- `theme.ts` exports `useTheme`, `ThemeProvider`, defines `default` + `hustle` skins, resolves `EXPO_PUBLIC_STUDIO_SKIN`.
- Three Inter OTF files present in `assets/fonts/`; `expo-font` in package.json.
- HUMAN-UAT (deferred to EAS build): app opens dark with orange accent; Inter renders; setting EXPO_PUBLIC_STUDIO_SKIN=hustle shows the placeholder accent. Not verifiable now (no local dev server / Expo Go SDK mismatch / 401-gated API per D-12).
</verification>

<success_criteria>
- ROADMAP R5 criterion 3 (dark default) — token foundation in place (visual confirmation deferred to EAS UAT).
- ROADMAP R5 criterion 7 (Inter via useFonts + EXPO_PUBLIC_STUDIO_SKIN) — code-complete.
- ROADMAP R5 criterion 1 (theme.ts exists) — satisfied for _layout.tsx; full app/** coverage completed by R5-02/03/04.
</success_criteria>

<output>
After completion, create `.planning/phases/R5-member-mobile-app-redesign/R5-01-SUMMARY.md`
</output>
