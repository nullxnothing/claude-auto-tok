import React from "react";
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { ResolvedSceneProp, FPS } from "../palettes";

interface BackgroundLayerProps {
  scenes: ResolvedSceneProp[];
  totalDurationFrames: number;
  hookFrames: number;
  ctaStartFrame: number;
  accentColor: string;
  bgColor: string;
}

export const BackgroundLayer: React.FC<BackgroundLayerProps> = ({
  scenes,
  totalDurationFrames,
  hookFrames,
  ctaStartFrame,
  accentColor,
  bgColor,
}) => {
  const frame = useCurrentFrame();

  // Collect all scenes with video/image backgrounds
  const bgScenes = scenes.filter(
    (s) => s.background && s.background.path && s.background.type !== "code-typing" && s.background.type !== "none"
  );

  if (bgScenes.length === 0) return null;

  // Build continuous background segments that cover hookFrames → ctaStartFrame
  // Each segment starts where the previous ends (no gaps)
  const segments: {
    startFrame: number;
    durationFrames: number;
    scene: ResolvedSceneProp;
  }[] = [];

  for (let i = 0; i < bgScenes.length; i++) {
    const scene = bgScenes[i];
    const sceneStart = Math.round((scene.startMs / 1000) * FPS);
    const sceneEnd = Math.round((scene.endMs / 1000) * FPS);

    // Extend this segment to fill gaps — start from frame 0 so hook has background too
    const prevEnd = segments.length > 0
      ? segments[segments.length - 1].startFrame + segments[segments.length - 1].durationFrames
      : 0;

    const actualStart = Math.max(prevEnd, 0);

    // End: either next scene's start or CTA
    const nextScene = bgScenes[i + 1];
    const nextStart = nextScene
      ? Math.round((nextScene.startMs / 1000) * FPS)
      : ctaStartFrame;

    const actualEnd = Math.min(nextStart, ctaStartFrame);
    const dur = actualEnd - actualStart;

    if (dur > 0) {
      segments.push({
        startFrame: actualStart,
        durationFrames: dur,
        scene,
      });
    }
  }

  // If first segment doesn't start at frame 0, extend it back to cover the hook
  if (segments.length > 0 && segments[0].startFrame > 0) {
    const diff = segments[0].startFrame;
    segments[0].startFrame = 0;
    segments[0].durationFrames += diff;
  }

  // If last segment doesn't reach ctaStartFrame, extend it
  if (segments.length > 0) {
    const last = segments[segments.length - 1];
    const lastEnd = last.startFrame + last.durationFrames;
    if (lastEnd < ctaStartFrame) {
      last.durationFrames = ctaStartFrame - last.startFrame;
    }
  }

  const CROSSFADE_FRAMES = 8;

  return (
    <>
      {segments.map((seg, i) => {
        const bg = seg.scene.background!;
        const isVideo = bg.type === "stock-video";

        return (
          <Sequence key={i} from={seg.startFrame} durationInFrames={seg.durationFrames}>
            <CrossfadeSegment
              isVideo={isVideo}
              path={bg.path}
              durationFrames={seg.durationFrames}
              crossfadeFrames={i > 0 ? CROSSFADE_FRAMES : 0}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const CrossfadeSegment: React.FC<{
  isVideo: boolean;
  path: string;
  durationFrames: number;
  crossfadeFrames: number;
}> = ({ isVideo, path, durationFrames, crossfadeFrames }) => {
  const frame = useCurrentFrame();

  // Fade in at start (crossfade from previous segment)
  const fadeIn = crossfadeFrames > 0
    ? interpolate(frame, [0, crossfadeFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // Fade out at end (crossfade into next segment)
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationFrames - 8), durationFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ opacity: fadeIn * fadeOut }}>
      {isVideo ? (
        <OffthreadVideo
          src={staticFile(path)}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <KenBurnsImage path={path} />
      )}

      {/* Dark overlay for readability */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.6) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

const KenBurnsImage: React.FC<{ path: string }> = ({ path }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 300], [1, 1.06], {
    extrapolateRight: "clamp",
  });

  return (
    <Img
      src={staticFile(path)}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${scale})`,
      }}
    />
  );
};
