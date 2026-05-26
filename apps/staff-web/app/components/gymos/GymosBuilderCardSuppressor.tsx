// GymClassOS Builder.io card suppressor.
//
// The framework's AgentSidebar renders a "Turn on the AI assistant — One click
// to connect Builder for free hosted access" empty-state card whenever its
// configured-LLM-provider gate (`missingApiKey`) is true. See
// packages/core/src/client/AssistantChat.tsx `BuilderSetupCard`.
//
// In the GymClassOS pilot deploy we never want the customer to see Builder.io
// branding — the platform is white-labelled as a gym product. The proper fix
// is to set `ANTHROPIC_API_KEY` (or any provider) on the deployment so the
// framework's gate flips closed naturally; this component is defence in depth
// for the moment the env var hasn't propagated yet.
//
// It injects a tiny `<style>` tag that hides any descendant of
// `[data-gymos-agent-sidebar]` whose visible structure matches the Builder
// setup card. We deliberately target the framework's class tree + a `:has()`
// text predicate (Chromium 105+, Safari 15.4+, Firefox 121+) so this stays
// inert for non-card content and degrades to "card visible" on older browsers
// (which the coach demographic does not use — but the env-var path is the
// real fix anyway).
//
// When the framework moves the card to a different markup, this becomes a
// no-op rather than a wrong-element-hidden bug.

import { useEffect } from "react";

const STYLE_ID = "gymos-builder-card-suppressor";

const CSS = `
/* Hide the framework's BuilderSetupCard (full-pane empty state) on /gymos/*.
   The card's stable class trio + an h3 text predicate keeps the match narrow. */
[data-gymos-agent-sidebar] .agent-sidebar-panel
  div.mx-4.my-6.rounded-lg.border:has(> div > div > h3) {
  display: none !important;
}

/* Hide the inline BuilderSetupCard variant that renders below messages when
   the gate trips mid-conversation. Same shape, no mx-4/my-6 margins. */
[data-gymos-agent-sidebar] .agent-sidebar-panel
  .agent-thread-content > div.rounded-lg.border.border-border.bg-card.p-5:has(h3) {
  display: none !important;
}
`;

export function GymosBuilderCardSuppressor() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    // Note: we intentionally do not remove the style on unmount. AppLayout
    // re-mounts this on every gymos route change, and removing the style
    // would briefly flash the Builder card between navigations.
  }, []);
  return null;
}
