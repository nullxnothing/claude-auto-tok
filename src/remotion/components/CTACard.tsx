import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface CTACardProps {
  ctaText: string;
  accentColor: string;
  textColor: string;
  totalDurationFrames: number;
}

export const CTACard: React.FC<CTACardProps> = ({
  ctaText,
  accentColor,
  textColor,
  totalDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entry = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 14, stiffness: 180 },
    durationInFrames: 10,
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
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: entry,
        backgroundColor: `rgba(0,0,0,${interpolate(frame, [0, 8], [0, 0.6], { extrapolateRight: "clamp" })})`,
      }}
    >
      <p
        style={{
          color: textColor,
          fontSize: 58,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontWeight: 700,
          textAlign: "center",
          padding: "0 100px",
          lineHeight: 1.3,
          textShadow: "0 4px 12px rgba(0,0,0,0.6)",
          transform: `translateY(${interpolate(entry, [0, 1], [30, 0])}px)`,
        }}
      >
        {ctaText}
      </p>
      <p
        style={{
          color: "#7a7a7a",
          fontSize: 32,
          fontFamily: "'IBM Plex Sans', sans-serif",
          fontWeight: 400,
          marginTop: 20,
          opacity: interpolate(frame, [6, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        @nullxnothing
      </p>
    </div>
  );
};
