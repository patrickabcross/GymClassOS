---
"@agent-native/core": patch
---

Fix env-status reporting a saved provider key as not-configured when it exists in both process.env and app_secrets. The app_secrets presence check no longer short-circuits on env presence, so a stored studio key always counts (clears the false "AI assistant not configured" chat gate).
