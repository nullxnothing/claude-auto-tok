import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { callClaudeJSON } from "./llm";
import { selectBrollForScenes, getAvailableClips } from "./broll-library";
import {
  ScriptOutput,
  VoiceProducerOutput,
  VisualPlan,
  ResolvedScene,
  SceneAsset,
  log,
} from "../state";
import {
  takeMultipleScreenshots,
  generateSceneImages,
  searchPexelsVideos,
  generateAIVideos,
} from "./asset-generator";

const FORMULA_TO_TEMPLATE: Record<string, string> = {
  CONTRADICTION: "SplitReveal",
  "KNOWLEDGE GAP": "TerminalReveal",
  "BOLD CLAIM": "TerminalReveal",
  "YOURE DOING IT WRONG": "ScreenRecordSim",
  "YOU RE DOING IT WRONG": "ScreenRecordSim",
  "SPECIFIC NUMBER": "StatCardDrop",
  POV: "CinematicText",
  "POV RELATABLE": "CinematicText",
  RELATABLE: "CinematicText",
  COUNTDOWN: "CountdownList",
  LIST: "CountdownList",
};

const VISUAL_PLAN_SYSTEM_PEXELS = `
You are the Visual Director for a TikTok content pipeline about AI coding tools.

Given scene segments with voiceover text, pick a TECH-FOCUSED stock video for each.

CRITICAL — EVERY query must return TECH/CODING footage. Use ONLY these styles:
- Computer screens with code: "code on screen dark", "programming screen close up"
- Typing/keyboards: "hands typing keyboard dark", "mechanical keyboard typing"
- Terminal/CLI: "terminal command line", "coding dark screen"
- Developer workspace: "developer laptop night", "multiple monitors coding"
- Phone/app: "phone app scrolling", "smartphone screen dark"
- Server/infrastructure: "server room lights", "data center cables"
- Abstract tech: "digital data flowing", "circuit board macro", "neon grid lines"

RULES:
- 2-4 word queries. CONCRETE physical objects, not concepts.
- NEVER use: "person amazed", "AI brain", "futuristic hologram", "person thinking"
- NEVER use abstract emotional queries — Pexels returns garbage for those.
- Every query should contain "dark", "screen", "code", "keyboard", "server", or "neon"
- VARY between close-ups, wide shots, and detail shots.
- Match the ENERGY of what's being said — exciting moment = fast typing, calm = slow pan.

OUTPUT JSON:
{
  "scene_assets": [
    { "type": "stock-video", "searchQuery": "hands typing keyboard dark" },
    ...
  ],
  "thumbnail": { "imagen_prompt": "9:16 vertical, dark background..." }
}

Output valid JSON only. scene_assets array length must match the number of scenes.
`;

const VISUAL_PLAN_SYSTEM_AI = `
You are a Cinematic Director creating a shot list for an AI video generator (Kling).
The video is a 9:16 vertical TikTok about AI coding tools for beginners.

Given the voiceover text broken into timed scenes, create a CINEMATIC PROMPT for each scene.
These prompts will be sent to Kling AI to generate 5-second video clips.

CRITICAL — PROMPT FORMAT:
Structure each prompt as: [Subject] + [Action] + [Environment] + [Lighting] + [Camera] + [Style]
Keep each prompt 150-250 characters. Kling works best with this length.

VISUAL STYLE (maintain across ALL scenes for consistency):
- Dark moody environments with blue/cyan/purple neon accents
- Cinematic shallow depth of field
- Professional color grading
- Modern tech aesthetic — real devices, real people, glowing screens
- NO abstract blobs, NO generic "AI brain" imagery
- NO text or words in the video (captions are added separately)

PROMPT ENGINEERING FOR KLING:
- Start with the subject (Kling prioritizes first words)
- Specify ONE camera movement per prompt (not multiple)
- Use: "cinematic", "shallow depth of field", "volumetric lighting"
- Use: "slow dolly in", "slow push in", "tracking shot", "orbit shot", "static shot"
- Say "scrolling code" or "blurred code" not readable text
- "Professional color grading" dramatically improves output

EXAMPLE PROMPTS FOR AI CODING CONTENT:
- "A developer sits at a minimalist desk, hands moving through floating holographic code. Blue and cyan volumetric lighting, shallow depth of field, slow dolly in, cinematic."
- "Close-up of a person's face illuminated by a glowing screen, code reflected in their glasses. Dark room, blue light, slow zoom in, cinematic mood."
- "Extreme close-up of fingers typing on a mechanical keyboard, screen glow reflecting. Warm desk lamp, shallow depth of field, slow tracking shot, cinematic."
- "Over-the-shoulder shot of a person at a desk, holographic AI interface suggesting code on a floating display. Cool and warm lighting contrast, slow push in, cinematic."
- "A person holding a smartphone showing a glowing app interface. Dark background, blue neon glow, shallow depth of field, slow zoom in, cinematic."

SCENE MATCHING:
- Match the FEELING of what's being said, not literally
- "I can't code" → frustrated/confused person at computer
- "AI built it for me" → person watching code auto-generate on screen
- "It actually works" → person smiling at a polished app on their phone
- Setup/intro → developer workspace reveal or person at desk
- Payoff/result → app working, screen showing success

OUTPUT JSON:
{
  "scene_assets": [
    { "type": "stock-video", "searchQuery": "<full Kling prompt here>" },
    ...
  ],
  "thumbnail": { "imagen_prompt": "9:16 vertical, dark background..." }
}

Output valid JSON only. scene_assets array length must match the number of scenes.
IMPORTANT: Generate FEWER scenes (4-6 max). Each clip will be stretched to fill its time slot.
`;

function resolveScenes(
  script: ScriptOutput,
  voice: VoiceProducerOutput
): ResolvedScene[] {
  const { wordTimings } = voice;
  const overlays = script.script.overlays;

  // If overlays exist, use them for scene timing (legacy behavior)
  if (overlays && overlays.length > 0) {
    const scenes: ResolvedScene[] = [];
    for (const overlay of overlays) {
      const startIdx = Math.max(0, Math.min(overlay.startWordIndex, wordTimings.length - 1));
      const endIdx = Math.max(startIdx, Math.min(overlay.endWordIndex, wordTimings.length - 1));
      scenes.push({
        overlayText: overlay.text,
        startMs: wordTimings[startIdx].startMs,
        endMs: wordTimings[endIdx].endMs,
        position: overlay.position,
      });
    }
    return scenes;
  }

  // No overlays — generate time-based scene segments
  // Cap scene count to available B-roll clips to prevent reuse
  const brollCount = getAvailableClips().length;
  const totalDurationMs = voice.durationMs;
  const maxScenes = brollCount > 0 ? Math.min(brollCount, 6) : 6;
  const sceneCount = Math.max(1, Math.min(maxScenes, Math.ceil(totalDurationMs / 5000)));
  const actualSegmentMs = totalDurationMs / sceneCount;
  const scenes: ResolvedScene[] = [];

  for (let i = 0; i < sceneCount; i++) {
    const startMs = Math.round(i * actualSegmentMs);
    const endMs = Math.round((i + 1) * actualSegmentMs);
    scenes.push({
      overlayText: "",
      startMs,
      endMs,
      position: i % 2 === 0 ? "upper" : "center",
    });
  }

  return scenes;
}

function selectTemplate(formulaUsed: string): string {
  const normalized = formulaUsed
    .toUpperCase()
    .replace(/[^A-Z]/g, " ")
    .trim();

  const match = Object.entries(FORMULA_TO_TEMPLATE).find(([key]) =>
    normalized.includes(key)
  );

  return match?.[1] ?? "TerminalReveal";
}

async function generateThumbnail(
  prompt: string,
  outputPath: string
): Promise<boolean> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: "9:16" },
      }),
    }
  );

  if (!res.ok) return false;

  const data = (await res.json()) as {
    predictions: { bytesBase64Encoded: string }[];
  };
  const imageData = data.predictions[0]?.bytesBase64Encoded;
  if (imageData) {
    fs.writeFileSync(outputPath, Buffer.from(imageData, "base64"));
    return true;
  }
  return false;
}

interface LLMSceneAsset {
  type: "screenshot" | "imagen" | "stock-video" | "code-typing";
  url?: string;
  prompt?: string;
  searchQuery?: string;
}

export async function runVisualDirector(
  script: ScriptOutput,
  voice: VoiceProducerOutput,
  topic: string,
  jobPath: string,
  publicDir: string,
  slug: string,
  genAI: GoogleGenerativeAI
): Promise<VisualPlan> {
  log("visual-director", "Planning visuals + generating assets...");

  // Resolve overlay timing from word indices
  const scenes = resolveScenes(script, voice);

  // Always use TerminalReveal (TemplateA) — it's the cleanest template with post-effects
  const templateId = "TerminalReveal";
  const hookIdx = Math.min(script.chosen_hook, script.hook_variants.length - 1);
  const formula = script.hook_variants[hookIdx].formula_used;
  log("visual-director", `Template: ${templateId} (forced — has post-effects)`);

  // CTA timing
  const lastWordEnd = voice.wordTimings[voice.wordTimings.length - 1]?.endMs ?? voice.durationMs;
  const ctaStartMs = lastWordEnd + 1500;

  // Check if we're using AI video or Pexels stock
  const useAIVideo = !!process.env.KLING_ACCESS_KEY;

  // Build scene descriptions from voiceover text
  const voiceoverWords = voice.wordTimings;
  const sceneDescriptions = scenes.map((s, i) => {
    const wordsInScene = voiceoverWords
      .filter((w) => w.startMs >= s.startMs && w.startMs < s.endMs)
      .map((w) => w.word)
      .join(" ");
    return `Scene ${i} (${(s.startMs / 1000).toFixed(1)}s-${(s.endMs / 1000).toFixed(1)}s): "${wordsInScene || s.overlayText}"`;
  }).join("\n");

  let sceneAssets: LLMSceneAsset[] = [];
  let thumbnailPrompt = "";

  // Use Claude CLI for visual planning (Max subscription)
  const visualSystemPrompt = useAIVideo ? VISUAL_PLAN_SYSTEM_AI : VISUAL_PLAN_SYSTEM_PEXELS;
  const visualUserPrompt = `Topic: "${topic}"\nHook: "${script.script.hook_text_onscreen}"\nFormula: ${formula}\nVoiceover: "${script.script.voiceover_text}"\n\nEach scene shows what the voiceover is SAYING at that moment. Pick stock video that VISUALLY MATCHES the spoken content:\n${sceneDescriptions}`;

  try {
    const parsed = await callClaudeJSON<{
      scene_assets: LLMSceneAsset[];
      thumbnail: { imagen_prompt: string };
    }>(visualSystemPrompt, visualUserPrompt, "visual-director");
    sceneAssets = parsed.scene_assets ?? [];
    thumbnailPrompt = parsed.thumbnail?.imagen_prompt ?? "";
  } catch (err) {
    log("visual-director", `LLM plan failed: ${(err as Error).message}. Using defaults.`);
  }

  // Pad/trim scene_assets to match scenes length
  while (sceneAssets.length < scenes.length) {
    sceneAssets.push({ type: "imagen", prompt: `Dark abstract tech visualization, 9:16 vertical, high contrast, coding theme, no text, ${topic}` });
  }
  sceneAssets = sceneAssets.slice(0, scenes.length);

  // ── Generate assets in parallel batches ─────────────────────────────────

  // Collect asset requests by type
  const screenshotUrls: { idx: number; url: string }[] = [];
  const imagenPrompts: { idx: number; prompt: string }[] = [];
  const videoQueries: { idx: number; query: string }[] = [];

  for (let i = 0; i < sceneAssets.length; i++) {
    const asset = sceneAssets[i];
    if (asset.type === "screenshot" && asset.url) {
      screenshotUrls.push({ idx: i, url: asset.url });
    } else if (asset.type === "imagen" && asset.prompt) {
      imagenPrompts.push({ idx: i, prompt: asset.prompt });
    } else if (asset.type === "stock-video" && asset.searchQuery) {
      videoQueries.push({ idx: i, query: asset.searchQuery });
    }
  }

  // ── Step 1: Check for local B-roll library first ────────────────────────
  const brollClips = getAvailableClips();
  let videoResults: (SceneAsset | null)[];

  if (brollClips.length > 0) {
    log("visual-director", `Using local B-roll library (${brollClips.length} clips)`);
    videoResults = await selectBrollForScenes(scenes, voice.wordTimings);
  } else if (useAIVideo) {
    log("visual-director", "Using Kling AI video generation");
    videoResults = await generateAIVideos(videoQueries, publicDir, slug);
    // Fall back to Pexels for any failed Kling generations
    const failedIndices = videoResults
      .map((r, i) => r === null ? i : -1)
      .filter((i) => i >= 0);
    if (failedIndices.length > 0) {
      log("visual-director", `${failedIndices.length} Kling clips failed — falling back to Pexels`);
      const fallbackQueries = failedIndices.map((i) => videoQueries[i]);
      const fallbackResults = await searchPexelsVideos(fallbackQueries, publicDir, slug);
      fallbackResults.forEach((result, j) => {
        videoResults[failedIndices[j]] = result;
      });
    }
  } else {
    videoResults = await searchPexelsVideos(videoQueries, publicDir, slug);
  }

  const [screenshotResults, imagenResults] = await Promise.all([
    takeMultipleScreenshots(screenshotUrls.map((s) => s.url), publicDir, slug),
    generateSceneImages(imagenPrompts.map((s) => s.prompt), publicDir, slug),
  ]);

  // Map results back to scenes
  let ssIdx = 0;
  let imgIdx = 0;
  let vidIdx = 0;

  for (let i = 0; i < scenes.length; i++) {
    const asset = sceneAssets[i];
    let resolved: SceneAsset | null = null;

    if (asset.type === "screenshot") {
      resolved = screenshotResults[ssIdx] ?? null;
      ssIdx++;
    } else if (asset.type === "imagen") {
      resolved = imagenResults[imgIdx] ?? null;
      imgIdx++;
    } else if (asset.type === "stock-video") {
      resolved = videoResults[vidIdx] ?? null;
      vidIdx++;
    } else if (asset.type === "code-typing") {
      resolved = { type: "code-typing", path: "" };
    }

    if (resolved) {
      scenes[i].background = resolved;
    }
  }

  // ── Thumbnail ───────────────────────────────────────────────────────────

  let thumbnailPath: string | null = null;
  if (thumbnailPrompt) {
    fs.writeFileSync(path.join(jobPath, "thumbnail_prompt.txt"), thumbnailPrompt);
    const thumbPath = path.join(jobPath, "thumbnail.png");
    log("visual-director", "Generating thumbnail...");
    const success = await generateThumbnail(thumbnailPrompt, thumbPath);
    thumbnailPath = success ? thumbPath : null;
  }

  const plan: VisualPlan = {
    templateId,
    colorPalette: "daemon",
    scenes,
    ctaStartMs,
    thumbnailPath,
    thumbnailPrompt,
    backgroundMusic: process.env.DEFAULT_BG_MUSIC || null,
  };

  fs.writeFileSync(
    path.join(jobPath, "visual-plan.json"),
    JSON.stringify(plan, null, 2)
  );

  const assetSummary = scenes
    .map((s) => s.background?.type ?? "none")
    .reduce((acc, t) => { acc[t] = (acc[t] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  log("visual-director", `Done — ${scenes.length} scenes (${JSON.stringify(assetSummary)}), CTA at ${(ctaStartMs / 1000).toFixed(1)}s`);
  return plan;
}
