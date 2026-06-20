// VideoPreviewPlayer.tsx — CV3-01
//
// Client-only <Player> wrapper driven by inputProps={{ spec }}.
// Passing a fresh inputProps object on each spec change causes Remotion's
// <Player> to re-render the GymPromo composition live — this is the
// controlled live-preview mechanism (no reload, no server render).
//
// IMPORTANT: This file MUST be imported inside a <ClientOnly> wrapper in any
// route. The @remotion/player <Player> requires a browser environment —
// importing it directly in an SSR route causes a 500 on Vercel.
//
// Pattern used in gymos.video_.$id.tsx:
//   <ClientOnly fallback={<DefaultSpinner />}>
//     <VideoPreviewPlayer spec={spec} />
//   </ClientOnly>
//
// DO NOT import @remotion/renderer or @remotion/lambda (server-side render).
// Use Remotion's built-in `controls` prop — do NOT copy the heavy custom
// transport bar from templates/videos/VideoPlayer.tsx.

import { Player } from "@remotion/player";
import { GymPromo } from "./GymPromo";
import { DIMENSIONS } from "../../server/lib/video-spec";
import type { VideoSpec } from "../../server/lib/video-spec";

interface VideoPreviewPlayerProps {
  spec: VideoSpec;
}

/**
 * VideoPreviewPlayer — lightweight <Player> wrapper.
 * Passing `inputProps={{ spec }}` causes Remotion to re-render the composition
 * whenever the spec state changes in the editor route.
 */
export function VideoPreviewPlayer({ spec }: VideoPreviewPlayerProps) {
  const { width, height } = DIMENSIONS[spec.format] ?? DIMENSIONS.square;

  return (
    <Player
      component={GymPromo}
      inputProps={{ spec }}
      compositionWidth={width}
      compositionHeight={height}
      durationInFrames={Math.max(1, spec.durationInFrames)}
      fps={spec.fps}
      controls
      loop
      style={{ width: "100%" }}
    />
  );
}
