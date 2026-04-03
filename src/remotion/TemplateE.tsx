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

export const TemplateE: React.FC<TemplateProps> = ({
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

  // Slow background drift
  const bgShift = interpolate(frame, [0, totalFrames], [0, 30]);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% ${50 + bgShift}%, ${p.accent}15 0%, ${p.bg} 70%)`,
      }}
    >
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

      {/* Hook — giant cinematic uppercase text */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <CinematicLine
          text={script.hook_text_onscreen}
          color={p.text}
          accent={p.accent}
          fontSize={110}
          delay={0}
        />
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

const CinematicLine: React.FC<{
  text: string;
  color: string;
  accent: string;
  fontSize: number;
  delay: number;
}> = ({ text, color, accent, fontSize, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = spring({
    frame: frame - delay,
    fps,
    from: 0,
    to: 1,
    config: { damping: 16, stiffness: 140, mass: 0.9 },
    durationInFrames: 12,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 80px",
      }}
    >
      <p
        style={{
          color,
          fontSize,
          fontFamily: "Anton, 'Bebas Neue', Impact, sans-serif",
          fontWeight: 400,
          textAlign: "center",
          textTransform: "uppercase",
          letterSpacing: 3,
          lineHeight: 1.1,
          opacity: entry,
          transform: `translateY(${interpolate(entry, [0, 1], [20, 0])}px) scale(${interpolate(entry, [0, 1], [0.95, 1])})`,
          textShadow: `0 0 80px ${accent}25, 0 4px 16px rgba(0,0,0,0.7)`,
          maxWidth: 900,
        }}
      >
        {text}
      </p>
    </div>
  );
};
