import React from "react";
import { Composition, registerRoot } from "remotion";
import { TemplateA } from "./TemplateA";
import { TemplateB } from "./TemplateB";
import { TemplateC } from "./TemplateC";
import { TemplateD } from "./TemplateD";
import { TemplateE } from "./TemplateE";
import { TemplateF } from "./TemplateF";
import { TemplateProps, FPS } from "./palettes";

// Generate mock word timings for studio preview
const DEMO_TEXT = "I built my own IDE. Cursor can't do this. It runs Solana programs natively. No extensions needed. Just open a file and deploy. The terminal is built in. Every tool in one place. Would you switch?";
const demoWords = DEMO_TEXT.split(/\s+/);
const msPerWord = 400;
const mockWordTimings = demoWords.map((word, i) => ({
  word,
  startMs: i * msPerWord,
  endMs: (i + 1) * msPerWord,
}));

const DEFAULT_PROPS: TemplateProps = {
  script: {
    hook_text_onscreen: "I built my own IDE",
    hook_spoken: "I built my own IDE",
    voiceover_text: DEMO_TEXT,
    overlays: [
      { second: 4, text: "Runs Solana natively", position: "upper" },
      { second: 9, text: "No extensions needed", position: "center" },
      { second: 15, text: "Built-in terminal", position: "upper" },
      { second: 21, text: "Deploy from editor", position: "center" },
    ],
    caption: "Would you switch from VS Code?",
    hashtags: ["#coding", "#solana", "#ide", "#devtools"],
  },
  duration: 30,
  colorPalette: "daemon",
  wordTimings: mockWordTimings,
};

const templates = [
  { id: "TerminalReveal", Component: TemplateA },
  { id: "StatCardDrop", Component: TemplateB },
  { id: "SplitReveal", Component: TemplateC },
  { id: "CountdownList", Component: TemplateD },
  { id: "CinematicText", Component: TemplateE },
  { id: "ScreenRecordSim", Component: TemplateF },
] as const;

const RemotionRoot: React.FC = () => {
  return (
    <>
      {templates.map(({ id, Component }) => (
        <Composition
          key={id}
          id={id}
          component={Component as unknown as React.FC<Record<string, unknown>>}
          durationInFrames={DEFAULT_PROPS.duration * FPS}
          fps={FPS}
          width={1080}
          height={1920}
          defaultProps={DEFAULT_PROPS as unknown as Record<string, unknown>}
        />
      ))}
    </>
  );
};

registerRoot(RemotionRoot);
