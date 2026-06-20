Video feature (CV3). @remotion/player in-browser composition editor + agent
tools. Backed by video_compositions (db.ts v21). Copy agent-native
templates/videos here in CV3 (player only; NO @remotion/renderer/lambda).

@remotion/player@4.0.481 + remotion@4.0.481 are already installed in
apps/staff-web/package.json (added in CV1). Do NOT add @remotion/renderer or
@remotion/lambda — those require headless Chromium and are gated to the separate
CV-RENDER phase. In-browser preview via @remotion/player has no server dependency.

GymosNavBridge (app/components/gymos/GymosNavBridge.tsx) is the gymos navigate
consumer to reuse/extend for video tab navigation.
