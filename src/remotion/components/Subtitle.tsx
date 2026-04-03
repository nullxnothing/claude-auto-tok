import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { HIGHLIGHT_COLOR, SAFE } from "../palettes";

interface SubtitleProps {
  voiceoverText: string;
  totalDurationFrames: number;
}

interface WordTiming {
  word: string;
  startFrame: number;
  endFrame: number;
}

function buildWordTimings(text: string, totalFrames: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const wordsPerSecond = 2.5;
  const fps = 30;
  const framesPerWord = Math.floor(fps / wordsPerSecond);
  const timings: WordTiming[] = [];

  for (let i = 0; i < words.length; i++) {
    const start = Math.min(i * framesPerWord, totalFrames - framesPerWord);
    timings.push({
      word: words[i],
      startFrame: start,
      endFrame: Math.min(start + framesPerWord, totalFrames),
    });
  }

  return timings;
}

function chunkWords(timings: WordTiming[], wordsPerChunk: number) {
  const chunks: WordTiming[][] = [];
  for (let i = 0; i < timings.length; i += wordsPerChunk) {
    chunks.push(timings.slice(i, i + wordsPerChunk));
  }
  return chunks;
}

export const Subtitle: React.FC<SubtitleProps> = ({
  voiceoverText,
  totalDurationFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const timings = buildWordTimings(voiceoverText, totalDurationFrames);
  const chunks = chunkWords(timings, 4);

  const activeChunk = chunks.find(
    (chunk) =>
      frame >= chunk[0].startFrame &&
      frame < chunk[chunk.length - 1].endFrame + 6
  );

  if (!activeChunk) return null;

  const chunkEntry = spring({
    frame: frame - activeChunk[0].startFrame,
    fps,
    config: { damping: 15, stiffness: 200, mass: 0.8 },
    from: 0,
    to: 1,
    durationInFrames: 8,
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: SAFE.bottom + 200,
        left: 60,
        right: 60 + SAFE.right,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${interpolate(chunkEntry, [0, 1], [12, 0])}px)`,
        opacity: chunkEntry,
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.8)",
          borderRadius: 14,
          padding: "14px 28px",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 10px",
        }}
      >
        {activeChunk.map((wt, i) => {
          const isActive = frame >= wt.startFrame && frame < wt.endFrame;
          const isPast = frame >= wt.endFrame;

          return (
            <span
              key={`${wt.startFrame}-${i}`}
              style={{
                color: isActive ? HIGHLIGHT_COLOR : isPast ? "#ffffff" : "#999999",
                fontSize: 54,
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontWeight: 700,
                textShadow: isActive
                  ? `0 0 20px ${HIGHLIGHT_COLOR}60`
                  : "0 2px 4px rgba(0,0,0,0.5)",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                transition: "none",
                display: "inline-block",
              }}
            >
              {wt.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
