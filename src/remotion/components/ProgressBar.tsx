import React from "react";
import { useCurrentFrame, interpolate } from "remotion";

interface ProgressBarProps {
  totalDurationFrames: number;
  accentColor: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  totalDurationFrames,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, totalDurationFrames], [0, 100], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.1)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          backgroundColor: accentColor,
          boxShadow: `0 0 8px ${accentColor}80`,
          opacity: 0.8,
        }}
      />
    </div>
  );
};
