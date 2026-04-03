export type PaletteName = "daemon" | "highcontrast" | "amber" | "bluetech";

export interface Palette {
  bg: string;
  accent: string;
  text: string;
}

export const PALETTES: Record<PaletteName, Palette> = {
  daemon:       { bg: "#090909", accent: "#4a8c62", text: "#ebebeb" },
  highcontrast: { bg: "#000000", accent: "#ff3b30", text: "#ffffff" },
  amber:        { bg: "#0d0d0d", accent: "#f5a623", text: "#ffffff" },
  bluetech:     { bg: "#050a14", accent: "#4a9eff", text: "#e8eaf0" },
};

export const HIGHLIGHT_COLOR = "#f7c204";

export const FPS = 30;

export interface Overlay {
  second: number;
  text: string;
  position: "upper" | "center";
}

export interface ScriptData {
  hook_text_onscreen: string;
  hook_spoken: string;
  voiceover_text: string;
  overlays: Overlay[];
  caption: string;
  hashtags: string[];
}

export interface WordTimingProp {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SceneAssetProp {
  type: "screenshot" | "imagen" | "stock-video" | "code-typing" | "none";
  path: string;
}

export interface ResolvedSceneProp {
  overlayText: string;
  startMs: number;
  endMs: number;
  position: "upper" | "center";
  background?: SceneAssetProp;
}

export interface TemplateProps {
  script: ScriptData;
  duration: number;
  colorPalette: PaletteName;
  voiceoverSrc?: string;
  wordTimings?: WordTimingProp[];
  scenes?: ResolvedSceneProp[];
  ctaStartMs?: number;
  backgroundMusic?: string;
}

// TikTok safe zones (pixels from edge)
export const SAFE = {
  top: 150,
  bottom: 350,
  right: 164,
  left: 40,
} as const;

// Usable content area
export const CONTENT = {
  x: SAFE.left,
  y: SAFE.top,
  width: 1080 - SAFE.left - SAFE.right,
  height: 1920 - SAFE.top - SAFE.bottom,
} as const;
