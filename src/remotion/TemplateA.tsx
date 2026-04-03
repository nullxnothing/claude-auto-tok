import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { PALETTES, TemplateProps, FPS, SAFE, CONTENT } from "./palettes";
import { WordCaption } from "./components/WordCaption";
import { BackgroundLayer } from "./components/BackgroundLayer";
import { ProgressBar } from "./components/ProgressBar";
import { FilmGrain, Vignette, ColorGrade } from "./components/PostEffects";

export const TemplateA: React.FC<TemplateProps> = ({
  script,
  duration,
  colorPalette,
  voiceoverSrc,
  wordTimings,
  scenes,
  ctaStartMs,
  backgroundMusic,
}) => {
  const p = PALETTES[colorPalette];
  const totalFrames = duration * FPS;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const hookFrames = 3 * FPS;
  const ctaStart = ctaStartMs
    ? Math.round((ctaStartMs / 1000) * FPS)
    : totalFrames - 4 * FPS;

  // Check if we have video backgrounds — if so, skip terminal chrome
  const hasVideoBackgrounds = (scenes ?? []).some(
    (s) => s.background?.type === "stock-video" && s.background?.path
  );

  // Fade to black at end
  const endFade = interpolate(
    frame,
    [totalFrames - 30, totalFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      {/* Audio */}
      {voiceoverSrc && <Audio src={staticFile(voiceoverSrc)} volume={1} />}
      {backgroundMusic && (
        <Audio src={staticFile(backgroundMusic)} volume={0.12} />
      )}

      {/* Continuous background video layer */}
      {scenes && scenes.length > 0 && (
        <BackgroundLayer
          scenes={scenes}
          totalDurationFrames={totalFrames}
          hookFrames={hookFrames}
          ctaStartFrame={totalFrames}
          accentColor={p.accent}
          bgColor={p.bg}
        />
      )}

      {/* Post-processing effects */}
      <ColorGrade />
      <Vignette intensity={0.35} />
      <FilmGrain opacity={0.03} />

      {/* Word-by-word subtitles — these handle all text including the hook */}
      {wordTimings && wordTimings.length > 0 && <WordCaption wordTimings={wordTimings} />}

      <ProgressBar totalDurationFrames={totalFrames} accentColor={p.accent} />

      {/* End fade to black */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1920,
          backgroundColor: "#000",
          opacity: 1 - endFade,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
