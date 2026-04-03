import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";
import { SceneAsset, log } from "../state";

// ── Playwright Screenshots ───────────────────────────────────────────────────

export async function takeScreenshot(
  url: string,
  outputPath: string,
  options: { darkMode?: boolean; viewport?: { width: number; height: number } } = {}
): Promise<SceneAsset | null> {
  const { darkMode = true, viewport = { width: 1080, height: 1920 } } = options;

  log("asset-gen", `Screenshotting ${url}...`);

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport,
      colorScheme: darkMode ? "dark" : "light",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    await page.waitForTimeout(1000); // let animations settle

    await page.screenshot({ path: outputPath, type: "png" });
    await browser.close();

    log("asset-gen", `Screenshot saved: ${path.basename(outputPath)}`);
    return { type: "screenshot", path: outputPath, url };
  } catch (err) {
    log("asset-gen", `Screenshot failed for ${url}: ${(err as Error).message}`);
    return null;
  }
}

export async function takeMultipleScreenshots(
  urls: string[],
  publicDir: string,
  slug: string
): Promise<(SceneAsset | null)[]> {
  if (urls.length === 0) return [];

  log("asset-gen", `Taking ${urls.length} screenshots...`);

  const browser = await chromium.launch({ headless: true });
  const results: (SceneAsset | null)[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const filename = `screenshot-${slug}-${i}.png`;
    const outputPath = path.join(publicDir, filename);

    try {
      const context = await browser.newContext({
        viewport: { width: 1080, height: 1920 },
        colorScheme: "dark",
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: outputPath, type: "png" });
      await context.close();

      results.push({ type: "screenshot", path: filename, url });
      log("asset-gen", `  [${i + 1}/${urls.length}] ${url} → ${filename}`);
    } catch (err) {
      log("asset-gen", `  [${i + 1}/${urls.length}] FAILED: ${(err as Error).message}`);
      results.push(null);
    }
  }

  await browser.close();
  return results;
}

// ── Imagen 4 Scene Images ────────────────────────────────────────────────────

export async function generateSceneImage(
  prompt: string,
  outputPath: string
): Promise<SceneAsset | null> {
  log("asset-gen", `Generating scene image...`);

  try {
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
      log("asset-gen", `Imagen error ${res.status}: ${err}`);
      return null;
    }

    const data = (await res.json()) as {
      predictions: { bytesBase64Encoded: string }[];
    };

    const imageData = data.predictions[0]?.bytesBase64Encoded;
    if (!imageData) return null;

    fs.writeFileSync(outputPath, Buffer.from(imageData, "base64"));
    log("asset-gen", `Scene image saved: ${path.basename(outputPath)}`);
    return { type: "imagen", path: outputPath, prompt };
  } catch (err) {
    log("asset-gen", `Imagen failed: ${(err as Error).message}`);
    return null;
  }
}

export async function generateSceneImages(
  prompts: string[],
  publicDir: string,
  slug: string
): Promise<(SceneAsset | null)[]> {
  log("asset-gen", `Generating ${prompts.length} scene images...`);

  const results: (SceneAsset | null)[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const filename = `scene-${slug}-${i}.png`;
    const outputPath = path.join(publicDir, filename);
    const asset = await generateSceneImage(prompts[i], outputPath);

    if (asset) {
      asset.path = filename; // relative for Remotion staticFile()
    }
    results.push(asset);
  }

  return results;
}

// ── Pexels Stock Video ───────────────────────────────────────────────────────

interface PexelsVideoFile {
  id: number;
  quality: "hd" | "sd" | "hls";
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
  fps: number | null;
}

interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  videos: PexelsVideo[];
}

export interface PexelsSearchOptions {
  query: string;
  orientation?: "portrait" | "landscape" | "square";
  size?: "large" | "medium" | "small";
  minDuration?: number;
  maxDuration?: number;
  perPage?: number;
  page?: number;
}

// Universal tech fallbacks — used when the LLM query returns no Pexels results
const TECH_FALLBACKS = [
  "code on computer screen dark",
  "hands typing keyboard dark",
  "programming laptop night",
  "terminal command line code",
  "server room lights",
  "mechanical keyboard typing",
  "multiple monitors code",
  "circuit board macro",
  "neon lights dark",
  "data center cables",
  "developer desk night",
  "code editor dark screen",
];

const FALLBACK_QUERIES: Record<string, string[]> = {
  coding: ["programming code screen", "code editor dark"],
  programming: ["coding screen dark", "developer laptop"],
  "computer screen": ["laptop screen dark", "monitor code display"],
  digital: ["circuit board macro", "neon grid lines"],
  "technology abstract": ["circuit board", "neon lights dark"],
  "data visualization": ["digital data screen", "code terminal"],
  "keyboard typing": ["mechanical keyboard dark", "hands typing code"],
  "server room": ["data center", "server rack lights"],
  "circuit board": ["microchip closeup", "electronics macro"],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectBestVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | null {
  // Prefer portrait HD mp4 files, then any HD, then best available
  const mp4Files = files.filter((f) => f.file_type === "video/mp4");
  const pool = mp4Files.length > 0 ? mp4Files : files.filter((f) => f.quality !== "hls");

  if (pool.length === 0) return null;

  // Prefer portrait (height > width) HD files
  const portraitHd = pool.filter(
    (f) => f.quality === "hd" && f.height && f.width && f.height > f.width
  );
  if (portraitHd.length > 0) {
    return portraitHd.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  }

  // Any HD file
  const hd = pool.filter((f) => f.quality === "hd" && (f.height ?? 0) >= 720);
  if (hd.length > 0) {
    return hd.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
  }

  // Fallback to highest resolution available
  return pool.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];
}

async function pexelsFetch(
  endpoint: string,
  apiKey: string
): Promise<PexelsSearchResponse | null> {
  try {
    const res = await fetch(`https://api.pexels.com${endpoint}`, {
      headers: { Authorization: apiKey },
    });

    if (res.status === 429) {
      log("asset-gen", "Pexels rate limited — backing off");
      return null;
    }

    if (!res.ok) {
      log("asset-gen", `Pexels API ${res.status}: ${res.statusText}`);
      return null;
    }

    return (await res.json()) as PexelsSearchResponse;
  } catch (err) {
    log("asset-gen", `Pexels fetch error: ${(err as Error).message}`);
    return null;
  }
}

function buildSearchUrl(opts: PexelsSearchOptions): string {
  const params = new URLSearchParams();
  params.set("query", opts.query);
  params.set("orientation", opts.orientation ?? "portrait");
  params.set("size", opts.size ?? "medium");
  params.set("per_page", String(opts.perPage ?? 15));
  if (opts.page) params.set("page", String(opts.page));
  if (opts.minDuration) params.set("min_duration", String(opts.minDuration));
  if (opts.maxDuration) params.set("max_duration", String(opts.maxDuration));
  return `/videos/search?${params.toString()}`;
}

export async function searchPexelsVideo(
  query: string,
  outputPath: string,
  options: Partial<PexelsSearchOptions> = {}
): Promise<SceneAsset | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    log("asset-gen", "No PEXELS_API_KEY set — skipping stock video");
    return null;
  }

  log("asset-gen", `Searching Pexels for "${query}"...`);

  const searchOpts: PexelsSearchOptions = {
    query,
    orientation: "portrait",
    size: "medium",
    minDuration: options.minDuration ?? 5,
    maxDuration: options.maxDuration ?? 30,
    perPage: 15,
    ...options,
  };

  let data = await pexelsFetch(buildSearchUrl(searchOpts), apiKey);

  // Try specific fallback queries if no results
  if (!data?.videos?.length) {
    const fallbacks = FALLBACK_QUERIES[query.toLowerCase()] ?? [];
    for (const fallback of fallbacks) {
      log("asset-gen", `No results for "${query}", trying "${fallback}"...`);
      data = await pexelsFetch(
        buildSearchUrl({ ...searchOpts, query: fallback }),
        apiKey
      );
      if (data?.videos?.length) break;
    }
  }

  // Last resort — use a random tech fallback
  if (!data?.videos?.length) {
    const techFallback = TECH_FALLBACKS[Math.floor(Math.random() * TECH_FALLBACKS.length)];
    log("asset-gen", `All fallbacks failed for "${query}", using tech default: "${techFallback}"`);
    data = await pexelsFetch(
      buildSearchUrl({ ...searchOpts, query: techFallback }),
      apiKey
    );
  }

  if (!data?.videos?.length) {
    log("asset-gen", `No Pexels videos found for "${query}" or fallbacks`);
    return null;
  }

  // Pick a random video from top results for variety across pipeline runs
  const video = pickRandom(data.videos);
  const file = selectBestVideoFile(video.video_files);

  if (!file) {
    log("asset-gen", "No suitable video file found in results");
    return null;
  }

  log(
    "asset-gen",
    `Selected: ${video.id} (${file.width}x${file.height}, ${video.duration}s, ${file.quality})`
  );

  // Download the video file
  try {
    const videoRes = await fetch(file.link);
    if (!videoRes.ok) {
      log("asset-gen", `Download failed: ${videoRes.status}`);
      return null;
    }

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);

    log("asset-gen", `Pexels video saved: ${path.basename(outputPath)} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return { type: "stock-video", path: path.basename(outputPath), searchQuery: query };
  } catch (err) {
    log("asset-gen", `Download failed: ${(err as Error).message}`);
    return null;
  }
}

// ── Kling AI Video Generation ───────────────────────────────────────────────

import * as jwt from "jsonwebtoken";

const KLING_BASE = "https://api.klingai.com";

function generateKlingToken(): string | null {
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;
  if (!ak || !sk) return null;

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: ak, exp: now + 1800, nbf: now - 5 },
    sk,
    { algorithm: "HS256", header: { alg: "HS256", typ: "JWT" } }
  );
}

async function generateKlingVideo(
  prompt: string,
  outputPath: string,
  modelName: string = "kling-v2-master",
  duration: string = "5"
): Promise<SceneAsset | null> {
  const token = generateKlingToken();
  if (!token) {
    log("asset-gen", "No KLING_ACCESS_KEY/KLING_SECRET_KEY set");
    return null;
  }

  log("asset-gen", `Kling generating: "${prompt.slice(0, 80)}..."`);

  try {
    // Submit task
    const submitRes = await fetch(`${KLING_BASE}/v1/videos/text2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model_name: modelName,
        prompt,
        negative_prompt: "text, watermark, deformed, blurry, low quality",
        mode: "std",
        aspect_ratio: "9:16",
        duration,
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      log("asset-gen", `Kling submit failed (${submitRes.status}): ${err.slice(0, 200)}`);
      return null;
    }

    const submitData = (await submitRes.json()) as {
      code: number;
      data: { task_id: string; task_status: string };
    };

    if (submitData.code !== 0) {
      log("asset-gen", `Kling error code: ${submitData.code}`);
      return null;
    }

    const taskId = submitData.data.task_id;
    log("asset-gen", `Kling task: ${taskId} — polling...`);

    // Poll for completion (max 8 minutes for 5s video)
    const maxWait = 480_000;
    const pollInterval = 8_000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;

      // Regenerate token in case it's close to expiry
      const pollToken = generateKlingToken()!;
      const resultRes = await fetch(`${KLING_BASE}/v1/videos/text2video/${taskId}`, {
        headers: { Authorization: `Bearer ${pollToken}` },
      });

      if (!resultRes.ok) continue;

      const resultData = (await resultRes.json()) as {
        code: number;
        data: {
          task_status: string;
          task_status_msg: string;
          task_result?: { videos: { url: string; duration: string }[] };
        };
      };

      const status = resultData.data.task_status;

      if (status === "succeed" && resultData.data.task_result?.videos?.[0]) {
        const videoUrl = resultData.data.task_result.videos[0].url;
        log("asset-gen", `Kling video ready — downloading...`);

        const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) {
          log("asset-gen", `Download failed: ${videoRes.status}`);
          return null;
        }

        const buffer = Buffer.from(await videoRes.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
        log("asset-gen", `Kling video saved: ${path.basename(outputPath)} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

        return { type: "stock-video", path: path.basename(outputPath), searchQuery: prompt };
      } else if (status === "failed") {
        log("asset-gen", `Kling failed: ${resultData.data.task_status_msg}`);
        return null;
      }

      if (elapsed % 30_000 === 0) {
        log("asset-gen", `Kling still generating... (${elapsed / 1000}s)`);
      }
    }

    log("asset-gen", "Kling generation timed out");
    return null;
  } catch (err) {
    log("asset-gen", `Kling error: ${(err as Error).message}`);
    return null;
  }
}

export async function generateAIVideos(
  queries: { idx: number; query: string }[],
  publicDir: string,
  slug: string
): Promise<(SceneAsset | null)[]> {
  if (queries.length === 0) return [];

  const modelName = process.env.KLING_MODEL ?? "kling-v2-master";
  log("asset-gen", `Generating ${queries.length} AI videos with Kling (${modelName})...`);

  // Generate in parallel batches of 3
  const BATCH_SIZE = 3;
  const results: (SceneAsset | null)[] = new Array(queries.length).fill(null);

  for (let batch = 0; batch < queries.length; batch += BATCH_SIZE) {
    const batchQueries = queries.slice(batch, batch + BATCH_SIZE);
    log("asset-gen", `Batch ${Math.floor(batch / BATCH_SIZE) + 1}: generating ${batchQueries.length} clips...`);

    const batchResults = await Promise.all(
      batchQueries.map((q, batchIdx) => {
        const globalIdx = batch + batchIdx;
        const filename = `ai-${slug}-${globalIdx}.mp4`;
        const outputPath = path.join(publicDir, filename);
        return generateKlingVideo(q.query, outputPath, modelName);
      })
    );

    batchResults.forEach((result, batchIdx) => {
      results[batch + batchIdx] = result;
    });
  }

  // Count successes and failures
  const successes = results.filter(Boolean).length;
  const failures = results.length - successes;
  log("asset-gen", `Kling done: ${successes} generated, ${failures} failed`);

  return results;
}

export async function searchPexelsVideos(
  queries: { idx: number; query: string }[],
  publicDir: string,
  slug: string,
  options: Partial<PexelsSearchOptions> = {}
): Promise<(SceneAsset | null)[]> {
  if (queries.length === 0) return [];

  log("asset-gen", `Fetching ${queries.length} Pexels videos...`);
  const results: (SceneAsset | null)[] = [];

  for (let i = 0; i < queries.length; i++) {
    const { query } = queries[i];
    const filename = `stock-${slug}-${i}.mp4`;
    const outputPath = path.join(publicDir, filename);

    const asset = await searchPexelsVideo(query, outputPath, options);
    results.push(asset);

    // Small delay between requests to respect rate limits
    if (i < queries.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
