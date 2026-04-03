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
import { PALETTES, TemplateProps, FPS, CONTENT } from "./palettes";
import { CTACard } from "./components/CTACard";
import { WordCaption } from "./components/WordCaption";
import { BackgroundLayer } from "./components/BackgroundLayer";
import { ProgressBar } from "./components/ProgressBar";


export const TemplateB: React.FC<TemplateProps> = ({
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

  // Hook: big number/stat drops in with spring scale
  const statScale = spring({
    frame,
    fps,
    from: 0.5,
    to: 1,
    config: { damping: 8, stiffness: 120, mass: 0.8 },
    durationInFrames: 10,
  });

  const statOpacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 20, stiffness: 300 },
    durationInFrames: 6,
  });

  // Glow pulse during hook
  const glowIntensity = frame < hookFrames
    ? interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 0.8])
    : 0;

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

      {/* Hook — big stat number */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1080,
            height: 1920,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
          }}
        >
          <h1
            style={{
              color: p.accent,
              fontSize: 160,
              fontFamily: "Inter, 'IBM Plex Sans', sans-serif",
              fontWeight: 900,
              transform: `scale(${statScale})`,
              opacity: statOpacity,
              textShadow: `0 0 ${60 * glowIntensity}px ${p.accent}80, 0 0 120px ${p.accent}30`,
              letterSpacing: -4,
            }}
          >
            {script.hook_text_onscreen}
          </h1>
        </div>
      </Sequence>

      {/* Body — stat cards dropping in sequence */}
      {(scenes ?? []).map((scene, i) => {
        const startFrame = Math.round((scene.startMs / 1000) * FPS);
        const endFrame = Math.round((scene.endMs / 1000) * FPS);
        const dur = Math.max(endFrame - startFrame, FPS);

        if (startFrame < hookFrames || startFrame >= ctaStart) return null;

        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur}>
            <StatCard
              text={scene.overlayText}
              index={i}
              accent={p.accent}
              textColor={p.text}
              bg={p.bg}
            />
          </Sequence>
        );
      })}

      {/* CTA */}
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

const StatCard: React.FC<{
  text: string;
  index: number;
  accent: string;
  textColor: string;
  bg: string;
}> = ({ text, index, accent, textColor, bg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 12, stiffness: 180, mass: 0.6 },
    durationInFrames: 10,
  });

  const yPos = CONTENT.y + 100 + index * 180;

  return (
    <div
      style={{
        position: "absolute",
        top: yPos,
        left: CONTENT.x + 20,
        width: CONTENT.width - 40,
        opacity: entry,
        transform: `translateX(${interpolate(entry, [0, 1], [-40, 0])}px)`,
      }}
    >
      <div
        style={{
          backgroundColor: `${accent}10`,
          border: `2px solid ${accent}25`,
          borderRadius: 20,
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            width: 8,
            height: 60,
            backgroundColor: accent,
            borderRadius: 4,
            flexShrink: 0,
          }}
        />
        <p
          style={{
            color: textColor,
            fontSize: 48,
            fontFamily: "Inter, 'IBM Plex Sans', sans-serif",
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {text}
        </p>
      </div>
    </div>
  );
};
