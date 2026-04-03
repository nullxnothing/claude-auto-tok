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
import { PALETTES, TemplateProps, FPS } from "./palettes";
import { CTACard } from "./components/CTACard";
import { WordCaption } from "./components/WordCaption";
import { BackgroundLayer } from "./components/BackgroundLayer";
import { ProgressBar } from "./components/ProgressBar";

export const TemplateC: React.FC<TemplateProps> = ({
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

  // Split reveal animation
  const splitProgress = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 18, stiffness: 100 },
    durationInFrames: hookFrames,
  });

  const splitX = interpolate(splitProgress, [0, 1], [0, 540]);

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
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
          ctaStartFrame={ctaStart}
          accentColor={p.accent}
          bgColor={p.bg}
        />
      )}

      {/* Left — "before" (desaturated, dark) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: splitX,
          height: 1920,
          backgroundColor: "#111",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 500, left: 60 }}>
          <p style={{
            color: "#555",
            fontSize: 42,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 4,
          }}>
            Before
          </p>
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {[280, 200, 320, 160].map((w, i) => (
              <div key={i} style={{
                height: 16,
                width: w,
                backgroundColor: "#333",
                borderRadius: 4,
                opacity: interpolate(splitProgress, [0.3 + i * 0.1, 0.5 + i * 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Right — "after" (accent colored, vibrant) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: splitX,
          width: 1080 - splitX,
          height: 1920,
          backgroundColor: p.bg,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: 500, right: 60 }}>
          <p style={{
            color: p.accent,
            fontSize: 42,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 4,
            textAlign: "right",
          }}>
            After
          </p>
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
            {[280, 200, 320, 160].map((w, i) => (
              <div key={i} style={{
                height: 16,
                width: w,
                backgroundColor: p.accent,
                borderRadius: 4,
                opacity: interpolate(splitProgress, [0.4 + i * 0.1, 0.6 + i * 0.1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Dividing line */}
      <div style={{
        position: "absolute",
        top: 0,
        left: splitX - 2,
        width: 4,
        height: 1920,
        backgroundColor: p.accent,
        boxShadow: `0 0 20px ${p.accent}60`,
      }} />

      {/* Hook text overlay */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <div style={{
          position: "absolute",
          top: 300,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "center",
        }}>
          <h1 style={{
            color: p.text,
            fontSize: 72,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: 700,
            textAlign: "center",
            textShadow: "0 4px 24px rgba(0,0,0,0.9)",
            opacity: spring({ frame, fps, from: 0, to: 1, config: { damping: 15, stiffness: 200 }, durationInFrames: 6 }),
            maxWidth: 800,
          }}>
            {script.hook_text_onscreen}
          </h1>
        </div>
      </Sequence>

      <Sequence from={ctaStart} durationInFrames={totalFrames - ctaStart}>
        <CTACard
          ctaText={script.caption}
          accentColor={p.accent}
          textColor={p.text}
          totalDurationFrames={totalFrames - ctaStart}
        />
      </Sequence>

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
