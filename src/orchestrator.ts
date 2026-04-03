import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { PipelineState, log, slugify } from "./state";
import { runResearcher } from "./agents/researcher";
import { runScriptwriter } from "./agents/scriptwriter";
import { runVoiceProducer } from "./agents/voice-producer";
import { runVisualDirector } from "./agents/visual-director";
import { runComposer } from "./agents/composer";
import { runReviewer } from "./agents/reviewer";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const PROJECT_ROOT = process.cwd();
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const MAX_REVISIONS = 2;

function setupJobFolder(slug: string): string {
  const jobPath = path.join(PROJECT_ROOT, "output", "jobs", slug);
  fs.mkdirSync(jobPath, { recursive: true });
  return jobPath;
}

function copyToReady(slug: string, jobPath: string): string {
  const readyPath = path.join(PROJECT_ROOT, "output", "ready", slug);
  fs.mkdirSync(readyPath, { recursive: true });

  const files = [
    "video.mp4", "thumbnail.png", "thumbnail_prompt.txt",
    "voiceover.mp3", "caption.txt", "script.json",
    "review_score.json", "word-timings.json", "visual-plan.json",
  ];

  for (const file of files) {
    const src = path.join(jobPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(readyPath, file));
    }
  }

  return readyPath;
}

async function runPipeline(topic: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TIKTOK SWARM v2 — "${topic}"`);
  console.log(`${"=".repeat(60)}\n`);

  const slug = `${slugify(topic)}-${Date.now()}`;
  const jobPath = setupJobFolder(slug);

  const state: PipelineState = {
    topic,
    slug,
    jobPath,
    research: null,
    script: null,
    voice: null,
    visual: null,
    videoPath: null,
    review: null,
    revisionCount: 0,
    previousVoiceoverText: null,
  };

  // ── Checkpoint helper ────────────────────────────────────────────────────
  const statePath = path.join(jobPath, "pipeline-state.json");
  const saveCheckpoint = () => {
    const serializable = { ...state, research: state.research, script: state.script, voice: state.voice ? { ...state.voice } : null, visual: state.visual, review: state.review, revisionCount: state.revisionCount };
    fs.writeFileSync(statePath, JSON.stringify(serializable, null, 2));
  };

  // ── Agent 1: Researcher ──────────────────────────────────────────────────
  state.research = await runResearcher(topic, genAI);
  saveCheckpoint();

  if (state.research.trend_decision === "PIVOT") {
    log("pipeline", "PIVOT recommended:");
    state.research.pivot_angles?.forEach((a, i) => log("pipeline", `  ${i + 1}. ${a}`));
    log("pipeline", "Halted. Rerun with a pivot angle.");
    return;
  }

  // ── Revision Loop ────────────────────────────────────────────────────────
  let revisionNotes = "";

  while (state.revisionCount <= MAX_REVISIONS) {
    // Agent 2: Scriptwriter
    const needsScript =
      !state.script ||
      state.review?.revision_target === "scriptwriter" ||
      state.review?.revision_target === "both";

    if (needsScript) {
      state.script = await runScriptwriter(topic, state.research!, genAI, revisionNotes || undefined);
      fs.writeFileSync(
        path.join(jobPath, "script.json"),
        JSON.stringify(state.script, null, 2)
      );
      saveCheckpoint();
    }

    // Agent 3: Voice Producer (skip if voiceover_text unchanged)
    const currentVoiceoverText = state.script!.script.voiceover_text;
    const needsVoice = !state.voice || currentVoiceoverText !== state.previousVoiceoverText;

    if (needsVoice) {
      state.voice = await runVoiceProducer(
        currentVoiceoverText,
        jobPath,
        slug,
        PUBLIC_DIR
      );
      state.previousVoiceoverText = currentVoiceoverText;
      saveCheckpoint();
    }

    // Agent 4: Visual Director (skip if only script changed and voice is same)
    const needsVisuals =
      !state.visual ||
      needsVoice ||
      state.review?.revision_target === "visual_director" ||
      state.review?.revision_target === "both";

    if (needsVisuals) {
      state.visual = await runVisualDirector(
        state.script!,
        state.voice!,
        topic,
        jobPath,
        PUBLIC_DIR,
        slug,
        genAI
      );
      saveCheckpoint();
    } else {
      log("pipeline", "Skipping visual director (script-only revision)");
    }

    // Agent 5: Composer
    state.videoPath = await runComposer(
      state.script!,
      state.voice!,
      state.visual!,
      jobPath,
      PROJECT_ROOT
    );

    if (!state.videoPath) {
      log("pipeline", "Composer failed to render video. Skipping review.");
      state.revisionCount++;
      if (state.revisionCount > MAX_REVISIONS) {
        log("pipeline", `FAILED after ${MAX_REVISIONS} revisions — no video rendered.`);
        break;
      }
      revisionNotes = "Video render failed. Simplify the visual plan and retry.";
      log("pipeline", `Revision ${state.revisionCount}/${MAX_REVISIONS}...`);
      continue;
    }

    // Save caption
    fs.writeFileSync(
      path.join(jobPath, "caption.txt"),
      `${state.script!.script.caption}\n\n${state.script!.script.hashtags.join(" ")}`
    );

    // Agent 6: Reviewer (graceful fallback if Gemini is unavailable)
    try {
      state.review = await runReviewer(
        topic,
        state.script!,
        state.voice!,
        state.visual!,
        jobPath,
        genAI
      );
    } catch (reviewErr) {
      log("pipeline", `Reviewer failed: ${(reviewErr as Error).message}`);
      log("pipeline", "Auto-approving since video rendered successfully.");
      const readyPath = copyToReady(slug, jobPath);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`  AUTO-APPROVED (reviewer unavailable)`);
      console.log(`  ${readyPath}`);
      console.log(`${"=".repeat(60)}\n`);
      return;
    }

    if (state.review.decision === "APPROVE" || state.review.decision === "CONDITIONAL") {
      const readyPath = copyToReady(slug, jobPath);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`  APPROVED (${state.review.total}/20)`);
      console.log(`  ${readyPath}`);
      console.log(`  ${state.review.post_timing_recommendation}`);
      console.log(`${"=".repeat(60)}\n`);
      return;
    }

    state.revisionCount++;
    if (state.revisionCount > MAX_REVISIONS) {
      log("pipeline", `FAILED after ${MAX_REVISIONS} revisions.`);
      log("pipeline", `Review output/jobs/${slug}/ for details.`);
      break;
    }

    revisionNotes = state.review.revision_notes;
    log("pipeline", `Revision ${state.revisionCount}/${MAX_REVISIONS}...`);
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
