import React from "react";
import {
  Img,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import { SceneAssetProp } from "../palettes";

interface SceneBackgroundProps {
  asset: SceneAssetProp;
  accentColor: string;
}

export const SceneBackground: React.FC<SceneBackgroundProps> = ({
  asset,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Fade in
  const opacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 20, stiffness: 150 },
    durationInFrames: 10,
  });

  // Subtle slow zoom (Ken Burns) — only for images
  const scale = interpolate(frame, [0, 300], [1, 1.05], {
    extrapolateRight: "clamp",
  });

  if (asset.type === "code-typing" || asset.type === "none" || !asset.path) {
    return null;
  }

  const isVideo = asset.type === "stock-video";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        opacity,
        overflow: "hidden",
      }}
    >
      {isVideo ? (
        <OffthreadVideo
          src={staticFile(asset.path)}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <Img
          src={staticFile(asset.path)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
          }}
        />
      )}
      {/* Dark overlay for text readability */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: `linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 40%, rgba(0,0,0,0.7) 100%)`,
        }}
      />
      {/* Subtle accent glow at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 400,
          background: `linear-gradient(0deg, ${accentColor}15 0%, transparent 100%)`,
        }}
      />
    </div>
  );
};
