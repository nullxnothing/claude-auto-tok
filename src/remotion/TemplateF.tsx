import React from "react";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { PALETTES, TemplateProps, FPS } from "./palettes";
import { WordCaption } from "./components/WordCaption";
import { BackgroundLayer } from "./components/BackgroundLayer";
import { ProgressBar } from "./components/ProgressBar";

export const TemplateF: React.FC<TemplateProps> = ({
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

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {voiceoverSrc && <Audio src={staticFile(voiceoverSrc)} volume={1} />}
      {backgroundMusic && (
        <Audio src={staticFile(backgroundMusic)} volume={0.12} />
      )}

      {scenes && scenes.length > 0 && (
        <BackgroundLayer
          scenes={scenes}
          totalDurationFrames={totalFrames}
          hookFrames={0}
          ctaStartFrame={totalFrames}
          accentColor={p.accent}
          bgColor={p.bg}
        />
      )}

      {wordTimings && wordTimings.length > 0 && <WordCaption wordTimings={wordTimings} />}

      <ProgressBar totalDurationFrames={totalFrames} accentColor={p.accent} />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1080,
          height: 1920,
          backgroundColor: "#000",
          opacity: 1 - interpolate(
            frame,
            [totalFrames - 30, totalFrames],
            [1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          ),
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
