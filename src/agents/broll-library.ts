import * as fs from "fs";
import * as path from "path";
import { SceneAsset, log } from "../state";
import { callClaudeJSON } from "./llm";

const BROLL_DIR = path.join(process.cwd(), "public", "broll");

/**
 * Get all available B-roll clips from the library
 */
export function getAvailableClips(): string[] {
  if (!fs.existsSync(BROLL_DIR)) return [];
  return fs.readdirSync(BROLL_DIR)
    .filter((f) => f.endsWith(".mp4") || f.endsWith(".webm"))
    .sort();
}

/**
 * Use Claude to intelligently match clips to script scenes.
 * Claude knows the clip names and the voiceover text for each scene,
 * and picks the best match.
 */
export async function selectBrollForScenes(
  scenes: { startMs: number; endMs: number }[],
  wordTimings: { word: string; startMs: number; endMs: number }[]
): Promise<(SceneAsset | null)[]> {
  const clips = getAvailableClips();

  if (clips.length === 0) {
    log("broll", "No clips in public/broll/ — falling back to Pexels");
    return scenes.map(() => null);
  }

  log("broll", `Found ${clips.length} clips in library`);

  // Build scene descriptions
  const sceneTexts = scenes.map((s, i) => {
    const words = wordTimings
      .filter((w) => w.startMs >= s.startMs && w.startMs < s.endMs)
      .map((w) => w.word)
      .join(" ");
    return `Scene ${i}: "${words}"`;
  });

  // Ask Claude to match clips to scenes
  try {
    const systemPrompt = `You are matching video B-roll clips to script scenes for a TikTok video.

Available clips (filenames describe their content):
${clips.map((c, i) => `${i}: ${c}`).join("\n")}

Rules:
- Each scene gets ONE clip index from the list above.
- NEVER repeat the same clip index. Every scene must use a DIFFERENT clip.
- Match based on what makes visual sense — e.g. "claude-terminal" fits scenes about using Claude, "app-browser" fits scenes about the result working.
- If a clip name contains "terminal" or "streaming", it shows code being generated.
- If a clip name contains "app" or "browser", it shows a finished app.
- If a clip name contains "code", it shows code editing.

Output a JSON array of clip indices (numbers only), one per scene. Length must equal ${scenes.length}.
Example: [0, 2, 1, 3]`;

    const userPrompt = `Match these scenes to the best clip:\n${sceneTexts.join("\n")}`;

    const indices = await callClaudeJSON<number[]>(systemPrompt, userPrompt, "broll");

    // Map indices to SceneAssets
    const results: (SceneAsset | null)[] = [];
    for (let i = 0; i < scenes.length; i++) {
      const clipIdx = indices[i];
      if (clipIdx !== undefined && clipIdx >= 0 && clipIdx < clips.length) {
        const clip = clips[clipIdx];
        results.push({
          type: "stock-video",
          path: `broll/${clip}`,
          searchQuery: clip,
        });
        log("broll", `Scene ${i}: ${clip}`);
      } else {
        results.push(null);
        log("broll", `Scene ${i}: no match`);
      }
    }

    return results;
  } catch (err) {
    log("broll", `Claude matching failed: ${(err as Error).message}. Using sequential order.`);

    // Fallback: assign clips in order
    return scenes.map((_, i) => {
      const clip = clips[i % clips.length];
      return {
        type: "stock-video",
        path: `broll/${clip}`,
        searchQuery: clip,
      };
    });
  }
}
