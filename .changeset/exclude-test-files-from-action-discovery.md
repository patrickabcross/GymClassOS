---
"@agent-native/core": patch
---

Exclude co-located `*.test.ts` / `*.spec.ts` files from action discovery (both the build-time static registry in `vite/action-types-plugin.ts` and the runtime scan in `server/action-discovery.ts`). Previously a test file in `actions/` was emitted as a static import in `.generated/actions-registry.ts`; because the content gate admits any file mentioning `defineAction`, test files passed through and executed `import { ... } from "vitest"` at bundle load, crashing the serverless function (`Cannot read properties of undefined (reading 'config')`) and 500-ing every route. Co-locating action tests in `actions/` is an established template convention, so the discovery layer now skips them by name.
