import * as fs from "fs";
import * as path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ScriptOutput,
  VoiceProducerOutput,
  VisualPlan,
  ReviewOutput,
  log,
} from "../state";

const SYSTEM_PROMPT = `
You are an EXTREMELY harsh TikTok content reviewer. You have seen 10,000 dev TikToks
and know exactly what flops. Your job is to PREVENT mediocre content from being posted.
You would rather DENY 5 good videos than let 1 bad one through.

You are reviewing a programmatically generated TikTok video package.
You have been given the ACTUAL RENDERED VIDEO to watch. Analyze what you SEE and HEAR,
not just the metadata. Pay attention to visual pacing, subtitle timing, transitions,
background quality, and how the audio sounds.

═══════════════════════════════════════════════════════════
SCORING RUBRIC (20 points total — raised bar)
═══════════════════════════════════════════════════════════

HOOK QUALITY (0-5 points) — THE MOST IMPORTANT CATEGORY:
5: Genuinely scroll-stopping. Creates instant cognitive dissonance or curiosity gap.
   First word spoken = first word on screen. Under 8 words. Would make YOU stop scrolling.
   Uses a proven formula (contradiction, knowledge gap, bold claim, specific number, POV).
4: Strong hook but slightly wordy (9-10 words) or takes 0.5s too long to land.
3: Decent curiosity trigger but feels generic. Could apply to any topic.
2: Functional but predictable. "Did you know..." or "Here's how to..." energy.
1: Starts with filler ("So", "Hey", "In this video"). Dead on arrival.
0: No hook at all, or hook requires context to understand.

AUTOMATIC HOOK FAILURES (score 0 regardless):
- Hook text exceeds 8 words
- Hook starts with: "So", "Hey", "In this", "Did you know", "What if I told you"
- Hook is a question without tension ("Want to learn X?")
- Hook text doesn't match hook spoken (first words must align)

SCRIPT PACING (0-4 points):
4: Every sentence earns the next. Max 10 words per sentence. No filler words.
   Voiceover at 2-2.5 words/sec. Clear setup → payoff → CTA structure.
   Rewatch hook present (something that makes sense differently on second viewing).
3: Good pacing but one sentence drags or has filler ("basically", "so", "kind of").
2: Middle section sags. More than 2 sentences over 10 words.
1: Feels like a blog post read aloud. Tutorial pacing (too slow for TikTok).
0: Would lose 50%+ of viewers before 15 seconds.

VISUAL QUALITY (0-4 points) — WATCH THE ACTUAL VIDEO:
4: Backgrounds are engaging and relevant. Smooth transitions between scenes.
   No jarring cuts. Every 2-3 seconds feels visually different but cohesive.
   Dark overlay is balanced — text is readable but backgrounds are visible.
3: Good variety but 1-2 scenes feel off. Minor transition issues.
2: Repetitive backgrounds. Hard cuts between scenes. Some text readability issues.
1: Generic stock footage that doesn't relate to the topic. Static or boring.
0: Mostly black/dark screen. Unwatchable visual quality.

OVERLAY TEXT + SUBTITLES (0-3 points) — WATCH THE ACTUAL VIDEO:
3: Subtitles are perfectly timed to speech. Overlay text appears at right moments.
   Word highlighting works correctly. Text is readable against all backgrounds.
   Subtitle grouping feels natural (3-5 words at a time).
2: Minor timing issues. Some overlay text is hard to read. Grouping is sometimes off.
1: Subtitles lag or lead the audio. Text overlaps or is cut off. Poor grouping.
0: Subtitles are broken or missing. Text is unreadable.

CAPTION + SEO (0-2 points):
2: Keywords in first 15 words. Comment-driving question. 3-5 hashtags.
   Under 150 chars total. Spoken keyword in voiceover within first 5 seconds.
1: Good keywords but wrong hashtag count, too long, or no question.
0: Generic hashtags (#fyp #viral), no keywords, or over 200 chars.

THUMBNAIL (0-2 points):
2: High contrast, single focal point, readable at 60px, upper 75%, proven formula.
1: Mostly good but one element violates the rules.
0: Looks like a default video frame.

═══════════════════════════════════════════════════════════
DECISION THRESHOLDS (stricter)
═══════════════════════════════════════════════════════════

- Total >= 16: APPROVE
- Total 12-15: CONDITIONAL (specific fixes, re-score only changed categories)
- Total < 12: DENY (full revision with detailed notes)
- Hook score < 3: AUTOMATIC DENY regardless of total

═══════════════════════════════════════════════════════════
OUTPUT JSON
═══════════════════════════════════════════════════════════

{
  "scores": {
    "hook": { "score": number, "reason": string },
    "pacing": { "score": number, "reason": string },
    "visual_quality": { "score": number, "reason": string },
    "overlay_subtitles": { "score": number, "reason": string },
    "caption_seo": { "score": number, "reason": string },
    "thumbnail": { "score": number, "reason": string }
  },
  "total": number,
  "decision": "APPROVE" | "CONDITIONAL" | "DENY",
  "revision_notes": string,
  "revision_target": "scriptwriter" | "visual_director" | "both" | null,
  "post_timing_recommendation": string
}

REVIEWER RULES:
- You are WATCHING the video. Comment on what you actually see and hear.
- Be SPECIFIC. "At 0:12 the background cuts to black for 2 seconds" is useful.
  "Could be better" is useless.
- If hook score < 3, write exactly what the hook should be changed to.
- revision_notes must be executable by other agents — include the exact fix.
- Never approve out of generosity. If it's mediocre, DENY it.

Output valid JSON only.
`;

// ── Gemini File API: upload video for multimodal review ─────────────────────

async function uploadVideoToGemini(videoPath: string): Promise<{ uri: string; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const fileBuffer = fs.readFileSync(videoPath);
  const fileSizeBytes = fileBuffer.length;

  log("reviewer", `Uploading video (${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB) to Gemini File API...`);

  try {
    // Step 1: Initiate resumable upload
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(fileSizeBytes),
          "X-Goog-Upload-Header-Content-Type": "video/mp4",
        },
        body: JSON.stringify({
          file: { displayName: path.basename(videoPath) },
        }),
      }
    );

    if (!initRes.ok) {
      log("reviewer", `File API init failed: ${initRes.status}`);
      return null;
    }

    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      log("reviewer", "No upload URL returned");
      return null;
    }

    // Step 2: Upload the file bytes
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(fileSizeBytes),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: fileBuffer,
    });

    if (!uploadRes.ok) {
      log("reviewer", `File upload failed: ${uploadRes.status}`);
      return null;
    }

    const fileInfo = (await uploadRes.json()) as {
      file: { uri: string; mimeType: string; state: string };
    };

    // Step 3: Wait for processing
    let fileState = fileInfo.file.state;
    const fileName = fileInfo.file.uri.split("/").pop();
    let attempts = 0;

    while (fileState === "PROCESSING" && attempts < 30) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/files/${fileName}?key=${apiKey}`
      );
      if (statusRes.ok) {
        const status = (await statusRes.json()) as { state: string };
        fileState = status.state;
      }
      attempts++;
    }

    if (fileState !== "ACTIVE") {
      log("reviewer", `Video processing stalled in state: ${fileState}`);
      return null;
    }

    log("reviewer", "Video uploaded and processed successfully");
    return { uri: fileInfo.file.uri, mimeType: "video/mp4" };
  } catch (err) {
    log("reviewer", `Video upload failed: ${(err as Error).message}`);
    return null;
  }
}

// ── Main reviewer ───────────────────────────────────────────────────────────

export async function runReviewer(
  topic: string,
  script: ScriptOutput,
  voice: VoiceProducerOutput,
  visual: VisualPlan,
  jobPath: string,
  genAI: GoogleGenerativeAI
): Promise<ReviewOutput> {
  log("reviewer", "Reviewing content package (multimodal mode)...");

  // Count actual metrics for context
  const wordCount = voice.wordTimings.length;
  const voiceoverDurationSec = (voice.durationMs / 1000).toFixed(1);
  const wordsPerSec = (wordCount / (voice.durationMs / 1000)).toFixed(1);
  const sceneCount = visual.scenes.length;
  const overlayCount = script.script.overlays.length;
  const hookWordCount = script.script.hook_text_onscreen.split(/\s+/).length;
  const captionLength = script.script.caption.length;
  const hashtagCount = script.script.hashtags.length;

  const stockVideoCount = visual.scenes.filter(
    (s) => s.background?.type === "stock-video"
  ).length;

  const metadataContext = {
    topic,
    hook_text_onscreen: script.script.hook_text_onscreen,
    hook_spoken: script.script.hook_spoken,
    hook_word_count: hookWordCount,
    hook_formula: script.hook_variants[
      Math.min(script.chosen_hook, script.hook_variants.length - 1)
    ].formula_used,
    voiceover_text: script.script.voiceover_text,
    voiceover_word_count: wordCount,
    voiceover_duration_seconds: voiceoverDurationSec,
    words_per_second: wordsPerSec,
    scene_count: sceneCount,
    stock_video_scenes: stockVideoCount,
    overlay_count: overlayCount,
    overlay_texts: script.script.overlays.map((o) => o.text),
    caption: script.script.caption,
    caption_length: captionLength,
    hashtag_count: hashtagCount,
    hashtags: script.script.hashtags,
    has_thumbnail: visual.thumbnailPath !== null,
    thumbnail_prompt: visual.thumbnailPrompt,
    template: visual.templateId,
    self_review_score: script.self_review_score,
  };

  // Try to upload the rendered video for multimodal review
  const videoPath = path.join(jobPath, "video.mp4");
  const thumbnailPath = path.join(jobPath, "thumbnail.png");

  let videoFile: { uri: string; mimeType: string } | null = null;
  if (fs.existsSync(videoPath)) {
    videoFile = await uploadVideoToGemini(videoPath);
  }

  // Build the content parts (using any[] because Gemini SDK types don't cover all part types)
  const contentParts: any[] = [];

  if (videoFile) {
    contentParts.push({
      fileData: { mimeType: videoFile.mimeType, fileUri: videoFile.uri },
    });
    contentParts.push({
      text: `WATCH this video carefully. Then review it using the metadata below.\n\nMETADATA:\n${JSON.stringify(metadataContext, null, 2)}`,
    });
    log("reviewer", "Reviewing with VIDEO + metadata (multimodal)");
  } else {
    contentParts.push({
      text: `Review this TikTok content package. You do NOT have the video file — review based on metadata only. Count everything. Be brutal.\n\n${JSON.stringify(metadataContext, null, 2)}`,
    });
    log("reviewer", "Reviewing with metadata only (video upload failed)");
  }

  // Upload thumbnail as inline image if available
  if (fs.existsSync(thumbnailPath)) {
    try {
      const thumbBuffer = fs.readFileSync(thumbnailPath);
      contentParts.push({
        text: "\n\nHere is the thumbnail image — evaluate it for readability, contrast, and CTR potential:",
      });
      // @ts-ignore — inline data part
      contentParts.push({
        inlineData: {
          mimeType: "image/png",
          data: thumbBuffer.toString("base64"),
        },
      });
    } catch {
      // Thumbnail read failed, skip
    }
  }

  // Use gemini-2.5-pro for multimodal review (better video understanding)
  const modelName = videoFile ? "gemini-2.5-pro" : "gemini-2.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: {
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(contentParts as any);
  const raw = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const review = JSON.parse(raw) as ReviewOutput;

    fs.writeFileSync(
      path.join(jobPath, "review_score.json"),
      JSON.stringify(review, null, 2)
    );

    log("reviewer", `Score: ${review.total}/20 — ${review.decision} (${modelName})`);
    if (review.revision_notes) {
      log("reviewer", `Notes: ${review.revision_notes}`);
    }

    return review;
  } catch {
    log("reviewer", `JSON parse failed: ${raw.slice(0, 300)}`);
    throw new Error("Reviewer returned invalid JSON");
  }
}
