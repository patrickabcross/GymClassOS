---
"@agent-native/core": patch
---

Add `showSettingsGear` prop (default true) to AgentSidebar/AgentPanel to gate the agent-chat settings gear; add opt-in `AGENT_NATIVE_SINGLE_TENANT` deploy flag so deploy-env credentials count for signed-in users on single-tenant deploys; fix env-status to always count app_secrets presence for provider keys; revert the prior settings-panel trim so the full settings panel renders again.
