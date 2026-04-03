import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  ScriptOutput,
  VoiceProducerOutput,
  VisualPlan,
  log,
} from "../state";

export async function runComposer(
  script: ScriptOutput,
  voice: VoiceProducerOutput,
  visual: VisualPlan,
  jobPath: string,
  projectRoot: string
): Promise<string | null> {
  log("composer", `Rendering ${visual.templateId}...`);

  // Calculate video duration: CTA end + 4s buffer
  // Video ends 2s after last spoken word (clean fade, no CTA card)
  const durationSeconds = Math.ceil(visual.ctaStartMs / 1000) + 2;

  // Build render props with word timings for frame-accurate captions
  const renderProps = {
    script: script.script,
    duration: durationSeconds,
    colorPalette: visual.colorPalette,
    voiceoverSrc: voice.voiceoverPublicName,
    wordTimings: voice.wordTimings,
    scenes: visual.scenes,
    ctaStartMs: visual.ctaStartMs,
    backgroundMusic: visual.backgroundMusic,
  };

  const propsPath = path.join(jobPath, "render-props.json");
  fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

  const videoOutput = path.join(jobPath, "video.mp4");

  try {
    execSync(
      `npx remotion render src/remotion/Root.tsx ${visual.templateId} "${videoOutput}" --props="${propsPath.replace(/\\/g, "/")}"`,
      { cwd: projectRoot, stdio: "inherit", timeout: 300_000 }
    );
    log("composer", `Rendered → ${videoOutput}`);
    return videoOutput;
  } catch (err) {
    log("composer", `Render failed: ${(err as Error).message}`);
    log("composer", "Video can be rendered manually with the saved render-props.json");
    return null;
  }
}
