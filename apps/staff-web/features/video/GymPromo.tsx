// GymPromo.tsx — CV3-01
//
// ONE deterministic Remotion composition component that renders a VideoSpec
// via <Sequence> blocks with simple fade-in/out transitions.
//
// Props: { spec: VideoSpec } — received as Remotion inputProps from <Player>.
// Pure/deterministic — no Date.now(), no random, no fetch.
// Handles empty/invalid spec.scenes gracefully (shows a placeholder frame).
//
// Used by VideoPreviewPlayer.tsx via:
//   <Player component={GymPromo} inputProps={{ spec }} ... />
//
// DO NOT import @remotion/renderer or @remotion/lambda here (or anywhere).
// DO NOT import registerRoot or Composition (those are for render bundles).

import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";
import type { VideoSpec, VideoScene } from "../../server/lib/video-spec";

// Load Poppins via @remotion/google-fonts — synchronous, module-level.
// Remotion injects the font into the composition via a <style> tag on mount.
const { fontFamily: poppinsFamily } = loadFont("normal", {
  weights: ["400", "700"],
});

// ─── SceneView ────────────────────────────────────────────────────────────────

function SceneView({ scene, durationInFrames }: { scene: VideoScene; durationInFrames: number }) {
  const frame = useCurrentFrame();

  // Fade-in over first 15 frames, fade-out over last 15 frames
  const fadeInEnd = Math.min(15, Math.floor(durationInFrames * 0.2));
  const fadeOutStart = Math.max(0, durationInFrames - 15);

  const opacity = interpolate(
    frame,
    [0, fadeInEnd, fadeOutStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const bgColor = scene.bgColor || "#0F172A";

  if (scene.type === "title" || scene.type === "outro") {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: bgColor,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
          opacity,
        }}
      >
        <div
          style={{
            color: "#F8FAFC",
            fontSize: "72px",
            fontWeight: 700,
            fontFamily: poppinsFamily,
            textAlign: "center",
            lineHeight: 1.15,
            marginBottom: scene.subtitle ? "32px" : 0,
            textShadow: "0 2px 16px rgba(0,0,0,0.4)",
            letterSpacing: "-0.02em",
          }}
        >
          {scene.text}
        </div>
        {scene.subtitle && (
          <div
            style={{
              color: "#94A3B8",
              fontSize: "36px",
              fontWeight: 400,
              fontFamily: poppinsFamily,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {scene.subtitle}
          </div>
        )}
      </AbsoluteFill>
    );
  }

  // textOverImage
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor, opacity }}>
      {/* Background image (best-effort — imageUrl may be absent) */}
      {scene.imageUrl ? (
        <AbsoluteFill>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scene.imageUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {/* Semi-opaque scrim for text legibility */}
          <AbsoluteFill style={{ backgroundColor: "rgba(0,0,0,0.45)" }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ backgroundColor: bgColor }} />
      )}

      {/* Text overlay */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "60px",
        }}
      >
        <div
          style={{
            color: "#F8FAFC",
            fontSize: "64px",
            fontWeight: 700,
            fontFamily: poppinsFamily,
            textAlign: "center",
            lineHeight: 1.15,
            marginBottom: scene.subtitle ? "28px" : 0,
            textShadow: "0 2px 20px rgba(0,0,0,0.6)",
            letterSpacing: "-0.02em",
          }}
        >
          {scene.text}
        </div>
        {scene.subtitle && (
          <div
            style={{
              color: "#E2E8F0",
              fontSize: "32px",
              fontWeight: 400,
              fontFamily: poppinsFamily,
              textAlign: "center",
              lineHeight: 1.4,
              textShadow: "0 1px 8px rgba(0,0,0,0.6)",
            }}
          >
            {scene.subtitle}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ─── GymPromo ─────────────────────────────────────────────────────────────────

/**
 * GymPromo — deterministic Remotion composition driven by a VideoSpec.
 * The <Player> passes this component the spec via inputProps={{ spec }}.
 * Each scene is rendered inside its own <Sequence> with frame offsets derived
 * from the preceding scenes' durationInFrames.
 */
export function GymPromo({ spec }: { spec: VideoSpec }) {
  // Guard against an empty/invalid scenes array — show a neutral placeholder
  if (!spec?.scenes?.length) {
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "#0F172A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "#64748B",
            fontSize: "36px",
            fontFamily: poppinsFamily,
          }}
        >
          No scenes
        </div>
      </AbsoluteFill>
    );
  }

  // Compute cumulative frame offsets
  const offsets: number[] = [];
  let running = 0;
  for (const scene of spec.scenes) {
    offsets.push(running);
    running += scene.durationInFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#0F172A" }}>
      {spec.scenes.map((scene, i) => (
        <Sequence
          key={i}
          from={offsets[i]}
          durationInFrames={scene.durationInFrames}
        >
          <SceneView scene={scene} durationInFrames={scene.durationInFrames} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
