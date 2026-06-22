---
"@agent-native/core": patch
---

Broaden the operator-chrome gate: rename the `showSettingsGear` prop on AgentSidebar/AgentPanel to `showOperatorChrome` (default true, upstream-safe). When false it now hides not just the settings gear but also the Workspace button, the Feedback button, and the composer model picker (the Act mode picker, attachment, mic, and send stay visible; the server falls back to the App Default Model). Used by white-labelled deploys (e.g. RunStudio gym staff) to show non-operators a clean chat surface.
