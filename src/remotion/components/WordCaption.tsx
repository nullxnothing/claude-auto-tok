import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";

interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

interface WordCaptionProps {
  wordTimings: WordTiming[];
}

// Bold style — inspired by claude-shorts Bold preset
const ACTIVE_COLOR = "#f7c204"; // yellow highlight
const TEXT_COLOR = "#ffffff";
const CAPTION_BOTTOM = 350; // TikTok safe zone

export const WordCaption: React.FC<WordCaptionProps> = ({ wordTimings }) => {
  if (!wordTimings || wordTimings.length === 0) return null;

  const captions = wordTimings.map((wt) => ({
    text: wt.word,
    startMs: wt.startMs,
    endMs: wt.endMs,
    timestampMs: wt.startMs,
    confidence: 1,
  }));

  const { pages: rawPages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 800,
  });

  // Cap each page to 3 words max — tight, punchy groups
  const pages: typeof rawPages = [];
  for (const page of rawPages) {
    if (page.tokens.length <= 3) {
      pages.push(page);
    } else {
      for (let i = 0; i < page.tokens.length; i += 3) {
        const chunk = page.tokens.slice(i, i + 3);
        const chunkStart = chunk[0].fromMs;
        const chunkEnd = chunk[chunk.length - 1].toMs;
        pages.push({
          ...page,
          tokens: chunk,
          startMs: chunkStart,
          durationMs: chunkEnd - chunkStart,
        });
      }
    }
  }

  return (
    <>
      {pages.map((page, pageIdx) => {
        const startFrame = Math.round((page.startMs / 1000) * 30);
        const durationFrames = Math.max(Math.round((page.durationMs / 1000) * 30), 1);

        return (
          <Sequence key={pageIdx} from={startFrame} durationInFrames={durationFrames}>
            <CaptionPage tokens={page.tokens} pageStartMs={page.startMs} />
          </Sequence>
        );
      })}
    </>
  );
};

interface CaptionPageProps {
  tokens: { text: string; fromMs: number; toMs: number }[];
  pageStartMs: number;
}

const CaptionPage: React.FC<CaptionPageProps> = ({ tokens, pageStartMs }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Pop-in spring (claude-shorts Bold style)
  const pageScale = spring({
    frame,
    fps,
    from: 0.7,
    to: 1,
    config: { mass: 1, damping: 12, stiffness: 200 },
    durationInFrames: 8,
  });

  const pageOpacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: { damping: 20, stiffness: 300 },
    durationInFrames: 5,
  });

  const currentMs = pageStartMs + (frame / fps) * 1000;

  return (
    <div
      style={{
        position: "absolute",
        bottom: CAPTION_BOTTOM,
        left: 40,
        right: 40,
        display: "flex",
        justifyContent: "center",
        opacity: pageOpacity,
        transform: `scale(${pageScale})`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 12px",
        }}
      >
        {tokens.map((token, i) => {
          const isActive = currentMs >= token.fromMs && currentMs < token.toMs;

          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{
                color: isActive ? ACTIVE_COLOR : TEXT_COLOR,
                fontSize: 72,
                fontFamily: "'Montserrat', 'Inter', 'Helvetica Neue', sans-serif",
                fontWeight: 800,
                textTransform: "uppercase",
                display: "inline-block",
                textShadow: `
                  -3px -3px 0 #000,
                   3px -3px 0 #000,
                  -3px  3px 0 #000,
                   3px  3px 0 #000,
                   0 4px 8px rgba(0,0,0,0.6)
                `,
                letterSpacing: 1,
              }}
            >
              {token.text.trim()}
            </span>
          );
        })}
      </div>
    </div>
  );
};
