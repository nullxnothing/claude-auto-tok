import React from "react";
import { useCurrentFrame, useVideoConfig, spring } from "remotion";
import { CONTENT } from "../palettes";

interface HookCardProps {
  text: string;
  accentColor: string;
  textColor: string;
  fontFamily?: string;
  fontSize?: number;
}

export const HookCard: React.FC<HookCardProps> = ({
  text,
  accentColor,
  textColor,
  fontFamily = "'IBM Plex Sans', sans-serif",
  fontSize = 82,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    from: 0.85,
    to: 1,
    config: { damping: 12, stiffness: 200, mass: 0.6 },
    durationInFrames: 6,
  });

  const opacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 20, stiffness: 300 },
    durationInFrames: 4,
  });

  return (
    <div
      style={{
        position: "absolute",
        top: CONTENT.y,
        left: CONTENT.x,
        width: CONTENT.width,
        height: CONTENT.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 40px",
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <h1
        style={{
          color: textColor,
          fontSize,
          fontFamily,
          fontWeight: 900,
          textAlign: "center",
          lineHeight: 1.15,
          textShadow: `0 0 60px ${accentColor}50, 0 4px 12px rgba(0,0,0,0.8)`,
          WebkitTextStroke: "1px rgba(0,0,0,0.3)",
          maxWidth: 800,
        }}
      >
        {text}
      </h1>
    </div>
  );
};
