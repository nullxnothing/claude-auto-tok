import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { FPS } from "../palettes";

/**
 * Film grain overlay — adds subtle texture to mask stock footage look
 */
export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.04 }) => {
  const frame = useCurrentFrame();

  // Animated noise using CSS filter + pseudo-random positioning
  const seed = frame * 1.7;
  const x = Math.sin(seed) * 500;
  const y = Math.cos(seed * 0.7) * 500;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        opacity,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        backgroundPosition: `${x}px ${y}px`,
        mixBlendMode: "overlay",
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
};

/**
 * Vignette overlay — darkens edges for cinematic feel
 */
export const Vignette: React.FC<{ intensity?: number }> = ({ intensity = 0.4 }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${intensity}) 100%)`,
        pointerEvents: "none",
        zIndex: 49,
      }}
    />
  );
};

/**
 * Color grade overlay — consistent teal/orange cinematic look
 */
export const ColorGrade: React.FC = () => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1080,
        height: 1920,
        background: "linear-gradient(180deg, rgba(0,30,60,0.08) 0%, transparent 40%, rgba(40,20,0,0.06) 100%)",
        mixBlendMode: "color",
        pointerEvents: "none",
        zIndex: 48,
      }}
    />
  );
};
