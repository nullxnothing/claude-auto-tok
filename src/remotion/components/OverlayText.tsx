import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface OverlayTextProps {
  text: string;
  textColor: string;
  accentColor: string;
  position: "upper" | "center";
  fontSize?: number;
  fontFamily?: string;
  durationInFrames?: number;
}

export const OverlayText: React.FC<OverlayTextProps> = ({
  text,
  textColor,
  accentColor,
  position,
  fontSize = 64,
  fontFamily = "'IBM Plex Sans', sans-serif",
  durationInFrames = 30,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scale-up entry (0.85 → 1.0 over 7 frames)
  const entry = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 14, stiffness: 200, mass: 0.7 },
    durationInFrames: 7,
  });

  const scale = interpolate(entry, [0, 1], [0.85, 1]);

  // Fade out over last 6 frames
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 6), durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const topPosition = position === "upper" ? 260 : 860;

  return (
    <div
      style={{
        position: "absolute",
        top: topPosition,
        left: 60,
        right: 60 + 164, // SAFE.right
        display: "flex",
        justifyContent: "center",
        opacity: entry * fadeOut,
        transform: `scale(${scale})`,
      }}
    >
      <p
        style={{
          color: textColor,
          fontSize,
          fontFamily,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.2,
          textTransform: "uppercase",
          letterSpacing: 1,
          // Text stroke for readability over any background
          WebkitTextStroke: "3px rgba(0,0,0,0.8)",
          paintOrder: "stroke fill",
          textShadow: `0 4px 12px rgba(0,0,0,0.7), 0 0 40px ${accentColor}30`,
          margin: 0,
          maxWidth: 800,
        }}
      >
        {text}
      </p>
    </div>
  );
};
