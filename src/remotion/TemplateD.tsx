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

export const TemplateD: React.FC<TemplateProps> = ({
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

      {/* Countdown items slide in from alternating sides */}
      {(scenes ?? []).map((scene, i) => {
        const startFrame = Math.round((scene.startMs / 1000) * FPS);
        const endFrame = Math.round((scene.endMs / 1000) * FPS);
        const dur = Math.max(endFrame - startFrame, FPS);

        if (startFrame < hookFrames || startFrame >= ctaStart) return null;

        const itemNumber = (scenes?.length ?? 0) - i;

        return (
          <Sequence key={i} from={startFrame} durationInFrames={dur}>
            <CountdownItem
              number={itemNumber}
              text={scene.overlayText}
              yPosition={CONTENT.y + 80 + (i % 3) * 200}
              fromRight={i % 2 === 1}
              accent={p.accent}
              textColor={p.text}
            />
          </Sequence>
        );
      })}

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

const CountdownItem: React.FC<{
  number: number;
  text: string;
  yPosition: number;
  fromRight: boolean;
  accent: string;
  textColor: string;
}> = ({ number, text, yPosition, fromRight, accent, textColor }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 12, stiffness: 160, mass: 0.7 },
    durationInFrames: 10,
  });

  const slideFrom = fromRight ? 60 : -60;
  const translateX = interpolate(entry, [0, 1], [slideFrom, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: yPosition,
        left: CONTENT.x + 20,
        width: CONTENT.width - 40,
        display: "flex",
        alignItems: "center",
        gap: 24,
        opacity: entry,
        transform: `translateX(${translateX}px)`,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 24px ${accent}40`,
        }}
      >
        <span
          style={{
            color: "#000",
            fontSize: 38,
            fontFamily: "'IBM Plex Sans', sans-serif",
            fontWeight: 900,
          }}
        >
          {number}
        </span>
      </div>
      <p
        style={{
          color: textColor,
          fontSize: 48,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontWeight: 700,
          lineHeight: 1.2,
          margin: 0,
          textShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {text}
      </p>
    </div>
  );
};
