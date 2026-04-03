import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import {
  RESEARCHER_PROMPT,
  TREND_TIMER_PROMPT,
  SCRIPTWRITER_PROMPT,
  THUMBNAIL_PROMPT,
  REVIEWER_PROMPT,
} from "./agents/prompts";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResearchOutput {
  topic: string;
  trend_status: "rising" | "peak" | "saturated";
  runway_hours: number;
  top_hooks: {
    hook_text: string;
    hook_score: number;
    why_it_works: string;
    source_views: number;
  }[];
  ideal_length_seconds: number;
  hashtags: string[];
  competitor_patterns: string;
  avoid: string;
}

interface TrendDecision {
  decision: "GO" | "WAIT" | "PIVOT";
  reason: string;
  urgency: string;
  pivot_angles: string[] | null;
}

interface ScriptOutput {
  hook_variants: { hook: string; formula_used: string; why: string }[];
  chosen_hook: number;
  script: {
    hook_text_onscreen: string;
    hook_spoken: string;
    voiceover_text: string;
    overlays: { second: number; text: string; position: string }[];
    caption: string;
    hashtags: string[];
  };
  estimated_length_seconds: number;
  rewatch_hook: string;
}

interface ThumbnailOutput {
  formula_chosen: string;
  imagen_prompt: string;
  thumbnail_text_overlay: string;
  focal_subject: string;
  ctm_prediction: string;
}

interface VoiceoverOutput {
  voiceover_path: string;
  duration_seconds: number;
  duration_match: "ok" | "over" | "under";
  flags: string[];
}

interface ReviewOutput {
  scores: {
    hook: { score: number; reason: string };
    completion: { score: number; reason: string };
    thumbnail: { score: number; reason: string };
    caption_seo: { score: number; reason: string };
  };
  total: number;
  decision: "APPROVE" | "CONDITIONAL" | "DENY";
  revision_notes: string;
  revision_target: "scriptwriter" | "thumbnail_prompter" | "both" | null;
  approved_package_path: string | null;
  post_timing_recommendation: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const log = (agent: string, msg: string) =>
  console.log(`\n[${new Date().toISOString()}] [${agent.toUpperCase()}] ${msg}`);

const slugify = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function runAgent<T>(
  agentName: string,
  systemPrompt: string,
  userMessage: string,
  context: Record<string, unknown> = {}
): Promise<T> {
  log(agentName, "Starting...");

  const contextStr =
    Object.keys(context).length
      ? `\n\nCONTEXT FROM PREVIOUS AGENTS:\n${JSON.stringify(context, null, 2)}`
      : "";

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(userMessage + contextStr);
  const raw = result.response.text();
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as T;
    log(agentName, "Complete");
    return parsed;
  } catch {
    log(agentName, `JSON parse failed. Raw:\n${raw}`);
    throw new Error(`${agentName} returned invalid JSON`);
  }
}

async function generateVoiceover(
  text: string,
  outputPath: string
): Promise<VoiceoverOutput> {
  log("VOICEOVER", "Calling ElevenLabs...");

  const res = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB",
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  log("VOICEOVER", `Saved to ${outputPath}`);

  return {
    voiceover_path: outputPath,
    duration_seconds: 0,
    duration_match: "ok",
    flags: [],
  };
}

async function generateThumbnail(
  prompt: string,
  outputPath: string
): Promise<void> {
  log("THUMBNAIL", "Calling Gemini Imagen 4...");

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

  if (!res.ok) {
    const err = await res.text();
    log("THUMBNAIL", `Gemini error ${res.status}: ${err}`);
    log("THUMBNAIL", "Saving prompt to thumbnail_prompt.txt for manual generation");
    return;
  }

  const data = (await res.json()) as {
    predictions: { bytesBase64Encoded: string }[];
  };
  const imageData = data.predictions[0]?.bytesBase64Encoded;
  if (imageData) {
    fs.writeFileSync(outputPath, Buffer.from(imageData, "base64"));
    log("THUMBNAIL", `Saved to ${outputPath}`);
  }
}

function setupJobFolder(slug: string): string {
  const jobPath = path.join(process.cwd(), "output", "jobs", slug);
  fs.mkdirSync(jobPath, { recursive: true });
  return jobPath;
}

function copyToReady(slug: string, jobPath: string): string {
  const readyPath = path.join(process.cwd(), "output", "ready", slug);
  fs.mkdirSync(readyPath, { recursive: true });

  const files = [
    "video.mp4",
    "thumbnail.png",
    "thumbnail_prompt.txt",
    "voiceover.mp3",
    "caption.txt",
    "script.json",
    "review_score.json",
  ];

  for (const file of files) {
    const src = path.join(jobPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(readyPath, file));
    }
  }

  return readyPath;
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

async function runPipeline(topic: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TIKTOK SWARM — "${topic}"`);
  console.log(`${"=".repeat(60)}\n`);

  const slug = `${slugify(topic)}-${Date.now()}`;
  const jobPath = setupJobFolder(slug);
  const MAX_REVISIONS = 2;
  let revisionCount = 0;

  // Agent 1: Research
  const research = await runAgent<ResearchOutput>(
    "viral-researcher",
    RESEARCHER_PROMPT,
    `Research TikTok trends for this topic: "${topic}"`
  );

  // Agent 2: Trend Timer
  const trendDecision = await runAgent<TrendDecision>(
    "trend-timer",
    TREND_TIMER_PROMPT,
    `Make GO/WAIT/PIVOT decision`,
    { research }
  );

  if (trendDecision.decision === "PIVOT") {
    log("TREND-TIMER", "PIVOT recommended:");
    trendDecision.pivot_angles?.forEach((a, i) => log("TREND-TIMER", `  ${i + 1}. ${a}`));
    log("PIPELINE", "Halted. Rerun with one of the pivot angles above.");
    return;
  }

  log("TREND-TIMER", `${trendDecision.decision} — ${trendDecision.urgency}`);

  // Revision loop
  let script: ScriptOutput | null = null;
  let thumbnail: ThumbnailOutput | null = null;
  let review: ReviewOutput | null = null;
  let revisionNotes = "";

  while (revisionCount <= MAX_REVISIONS) {
    // Agent 3: Scriptwriter
    if (
      !script ||
      review?.revision_target === "scriptwriter" ||
      review?.revision_target === "both"
    ) {
      script = await runAgent<ScriptOutput>(
        "scriptwriter",
        SCRIPTWRITER_PROMPT,
        `Write a TikTok script for: "${topic}".${
          revisionNotes ? ` REVISION NOTES: ${revisionNotes}` : ""
        }`,
        { research, trend_decision: trendDecision }
      );
      fs.writeFileSync(
        path.join(jobPath, "script.json"),
        JSON.stringify(script, null, 2)
      );
    }

    // Agent 4: Thumbnail
    if (
      !thumbnail ||
      review?.revision_target === "thumbnail_prompter" ||
      review?.revision_target === "both"
    ) {
      thumbnail = await runAgent<ThumbnailOutput>(
        "thumbnail-prompter",
        THUMBNAIL_PROMPT,
        `Generate thumbnail for: "${topic}"`,
        {
          hook: script!.script.hook_text_onscreen,
          hook_formula: script!.hook_variants[script!.chosen_hook].formula_used,
          topic,
        }
      );

      fs.writeFileSync(
        path.join(jobPath, "thumbnail_prompt.txt"),
        thumbnail.imagen_prompt
      );

      await generateThumbnail(
        thumbnail.imagen_prompt,
        path.join(jobPath, "thumbnail.png")
      );
    }

    // Agent 5: Voiceover
    const voiceoverPath = path.join(jobPath, "voiceover.mp3");
    const voiceover = await generateVoiceover(
      script!.script.voiceover_text,
      voiceoverPath
    );

    // Agent 6: Video Render
    const formulaRaw = script!.hook_variants[script!.chosen_hook].formula_used
      .toUpperCase()
      .replace(/[^A-Z]/g, " ")
      .trim();

    const FORMULA_TO_TEMPLATE: Record<string, string> = {
      "CONTRADICTION":    "SplitReveal",
      "KNOWLEDGE GAP":    "TerminalReveal",
      "BOLD CLAIM":       "TerminalReveal",
      "YOURE DOING IT WRONG": "ScreenRecordSim",
      "YOU RE DOING IT WRONG": "ScreenRecordSim",
      "SPECIFIC NUMBER":  "StatCardDrop",
      "POV":              "CinematicText",
      "POV RELATABLE":    "CinematicText",
      "RELATABLE":        "CinematicText",
      "COUNTDOWN":        "CountdownList",
      "LIST":             "CountdownList",
    };

    const templateId =
      Object.entries(FORMULA_TO_TEMPLATE).find(([key]) =>
        formulaRaw.includes(key)
      )?.[1] ?? "TerminalReveal";

    log("VIDEO-RENDERER", `Formula "${formulaRaw}" → Template "${templateId}"`);

    // Copy voiceover to public/ so Remotion can access via staticFile()
    const publicDir = path.join(process.cwd(), "public");
    fs.mkdirSync(publicDir, { recursive: true });
    const voiceoverPublicName = `voiceover-${slug}.mp3`;
    fs.copyFileSync(voiceoverPath, path.join(publicDir, voiceoverPublicName));

    // Get audio duration via ffprobe for accurate frame count
    let audioDuration = script!.estimated_length_seconds;
    try {
      const probeResult = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${voiceoverPath}"`,
        { encoding: "utf-8" }
      ).trim();
      const parsed = parseFloat(probeResult);
      if (!isNaN(parsed) && parsed > 0) {
        audioDuration = Math.ceil(parsed) + 2; // +2s buffer for CTA
        log("VIDEO-RENDERER", `Audio duration: ${parsed.toFixed(1)}s → video: ${audioDuration}s`);
      }
    } catch {
      log("VIDEO-RENDERER", `ffprobe failed, using estimated ${audioDuration}s`);
    }

    const renderProps = {
      script: script!.script,
      duration: audioDuration,
      colorPalette: "daemon",
      voiceoverSrc: voiceoverPublicName,
    };
    const propsPath = path.join(jobPath, "render-props.json");
    fs.writeFileSync(propsPath, JSON.stringify(renderProps, null, 2));

    const videoOutput = path.join(jobPath, "video.mp4");
    try {
      execSync(
        `npx remotion render src/remotion/Root.tsx ${templateId} "${videoOutput}" --props="${propsPath.replace(/\\/g, "/")}"`,
        { cwd: process.cwd(), stdio: "inherit", timeout: 300_000 }
      );
      log("VIDEO-RENDERER", `Rendered → ${videoOutput}`);
    } catch (err) {
      log("VIDEO-RENDERER", `Render failed: ${(err as Error).message}`);
      log("VIDEO-RENDERER", "Continuing pipeline — video can be rendered manually");
    }

    // Save caption
    fs.writeFileSync(
      path.join(jobPath, "caption.txt"),
      `${script!.script.caption}\n\n${script!.script.hashtags.join(" ")}`
    );

    // Agent 7: Reviewer
    review = await runAgent<ReviewOutput>(
      "viral-reviewer",
      REVIEWER_PROMPT,
      `Review this content package for topic: "${topic}"`,
      {
        script: script!.script,
        hook_variants: script!.hook_variants,
        chosen_hook: script!.chosen_hook,
        thumbnail,
        voiceover,
        topic,
      }
    );

    fs.writeFileSync(
      path.join(jobPath, "review_score.json"),
      JSON.stringify(review, null, 2)
    );

    log("VIRAL-REVIEWER", `Score: ${review.total}/10 — ${review.decision}`);
    if (review.revision_notes) {
      log("VIRAL-REVIEWER", `Notes: ${review.revision_notes}`);
    }

    if (review.decision === "APPROVE" || review.decision === "CONDITIONAL") {
      const readyPath = copyToReady(slug, jobPath);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`  APPROVED (${review.total}/10)`);
      console.log(`  ${readyPath}`);
      console.log(`  ${review.post_timing_recommendation}`);
      console.log(`${"=".repeat(60)}\n`);
      return;
    }

    revisionCount++;
    if (revisionCount > MAX_REVISIONS) {
      log("PIPELINE", `FAILED after ${MAX_REVISIONS} revisions.`);
      log("PIPELINE", `Review output/jobs/${slug}/ for details.`);
      break;
    }

    revisionNotes = review.revision_notes;
    log("PIPELINE", `Revision ${revisionCount}/${MAX_REVISIONS} — looping...`);
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const topic = process.argv[2];
if (!topic) {
  console.error('Usage: pnpm swarm:run "your topic here"');
  process.exit(1);
}

runPipeline(topic).catch((err) => {
  console.error("\n[PIPELINE ERROR]", err.message);
  process.exit(1);
});
