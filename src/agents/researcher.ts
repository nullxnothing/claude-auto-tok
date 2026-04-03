import { GoogleGenerativeAI } from "@google/generative-ai";
import { ResearchOutput, log } from "../state";
import { callClaudeJSON } from "./llm";


const SCRAPECREATORS_BASE = "https://api.scrapecreators.com";

interface TikTokVideoStats {
  play_count: number;
  digg_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
}

interface TikTokVideoItem {
  aweme_id: string;
  desc: string;
  create_time: number;
  statistics: TikTokVideoStats;
  video?: { duration: number };
  author?: { uniqueId: string; nickname: string; follower_count: number };
}

interface KeywordSearchResponse {
  search_item_list: TikTokVideoItem[] | null;
  cursor: number;
}

interface HashtagSearchResponse {
  aweme_list: TikTokVideoItem[] | null;
  cursor: number;
}

// ── ScrapeCreators API helpers ──────────────────────────────────────────────

async function scrapeFetch<T>(endpoint: string, params: Record<string, string>): Promise<T | null> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  if (!apiKey) {
    log("researcher", "No SCRAPECREATORS_API_KEY set — falling back to LLM-only research");
    return null;
  }

  const url = new URL(`${SCRAPECREATORS_BASE}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
    });

    if (!res.ok) {
      log("researcher", `ScrapeCreators ${res.status}: ${res.statusText} for ${endpoint}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    log("researcher", `ScrapeCreators fetch failed: ${(err as Error).message}`);
    return null;
  }
}

async function searchByKeyword(query: string, sortBy: string = "most-liked", datePosted: string = "this-week"): Promise<TikTokVideoItem[]> {
  const data = await scrapeFetch<KeywordSearchResponse>("/v1/tiktok/search/keyword", {
    query,
    sort_by: sortBy,
    date_posted: datePosted,
    trim: "true",
  });
  return data?.search_item_list ?? [];
}

async function searchByHashtag(hashtag: string): Promise<TikTokVideoItem[]> {
  const data = await scrapeFetch<HashtagSearchResponse>("/v1/tiktok/search/hashtag", {
    hashtag,
    trim: "true",
  });
  return data?.aweme_list ?? [];
}

async function getVideoTranscript(videoUrl: string): Promise<string | null> {
  const data = await scrapeFetch<{ transcript: string }>("/v1/tiktok/video/transcript", {
    url: videoUrl,
    language: "en",
  });
  return data?.transcript ?? null;
}

// ── Analysis helpers ────────────────────────────────────────────────────────

function extractHookFromDesc(desc: string): string {
  // First sentence or first 10 words — whichever is shorter
  const firstSentence = desc.split(/[.!?\n]/)[0]?.trim() ?? desc;
  const words = firstSentence.split(/\s+/);
  return words.slice(0, 10).join(" ");
}

function scoreHook(hookText: string): number {
  let score = 0;
  const lower = hookText.toLowerCase();
  const wordCount = hookText.split(/\s+/).length;

  // Contradiction / bold claim / "you're doing it wrong"
  if (/wrong|can't|won't|don't|never|stop|killed|dead|replaced/i.test(lower)) score += 3;
  // Knowledge gap
  if (/secret|nobody|hidden|most.*don't|99%|didn't know|no one/i.test(lower)) score += 3;
  // Addresses "you"
  if (/\byou\b/i.test(lower)) score += 2;
  // Under 8 words
  if (wordCount <= 8) score += 2;
  // Specific number
  if (/\$?\d+[kKmM]?\b/.test(hookText)) score += 2;

  return Math.min(score, 12);
}

function determineTrendStatus(videos: TikTokVideoItem[]): {
  status: "rising" | "peak" | "saturated";
  runwayHours: number;
} {
  if (videos.length === 0) return { status: "rising", runwayHours: 48 }; // No data = assume opportunity

  const now = Date.now() / 1000;
  const recentVideos = videos.filter((v) => now - v.create_time < 48 * 3600);
  const peakVideos = videos.filter(
    (v) => now - v.create_time >= 48 * 3600 && now - v.create_time < 96 * 3600
  );

  // High velocity = many recent videos with good engagement
  const recentHighEngagement = recentVideos.filter(
    (v) => v.statistics.play_count > 10000
  );

  if (recentHighEngagement.length >= 3) {
    return { status: "rising", runwayHours: 48 };
  } else if (recentVideos.length >= 2 || peakVideos.length >= 3) {
    const avgAge = videos
      .slice(0, 10)
      .reduce((sum, v) => sum + (now - v.create_time), 0) / Math.min(videos.length, 10);
    const hoursLeft = Math.max(0, 96 - avgAge / 3600);
    return { status: "peak", runwayHours: Math.round(hoursLeft) };
  }

  return { status: "saturated", runwayHours: 0 };
}

// ── Main researcher ─────────────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `
You are the Viral Researcher agent analyzing REAL TikTok data for a content pipeline
targeting new AI coding users aged 18-30.

You are given REAL video data scraped from TikTok — view counts, engagement metrics,
video descriptions, and hook extractions. This data is REAL. Do not fabricate additional data.

Your job: analyze the provided data and produce a research output that will guide
the scriptwriter to create a video with maximum viral potential.

ANALYSIS TASKS:
1. From the real hooks provided, score and rank the top 3 by viral potential
2. Identify patterns in what's working (format, length, hook style, topics)
3. Determine ideal video length from the top performers
4. Extract the best-performing hashtags from the data
5. Identify what to avoid (patterns from low-performing videos)
6. Make a GO/WAIT/PIVOT decision based on trend timing data provided

OUTPUT JSON:
{
  "topic": string,
  "trend_status": "rising" | "peak" | "saturated",
  "runway_hours": number,
  "top_hooks": [{ "hook_text": string, "hook_score": number, "why_it_works": string, "source_views": number }],
  "ideal_length_seconds": number,
  "hashtags": string[],
  "competitor_patterns": string,
  "avoid": string,
  "trend_decision": "GO" | "WAIT" | "PIVOT",
  "trend_reason": string,
  "urgency": "normal" | "post within 6hrs" | "post within 2hrs",
  "pivot_angles": string[] | null
}

DECISION LOGIC:
- "rising" AND runway_hours > 24 → GO, urgency "normal"
- "peak" AND runway_hours > 12 → GO, urgency "post within 6hrs"
- "peak" AND runway_hours < 12 → WAIT, urgency "post within 2hrs"
- "saturated" → PIVOT, provide 3 alternative angles

Output valid JSON only. No markdown.
`;

export async function runResearcher(
  topic: string,
  genAI: GoogleGenerativeAI
): Promise<ResearchOutput> {
  log("researcher", "Starting research with ScrapeCreators + Gemini analysis...");

  // ── Step 1: Gather real TikTok data ───────────────────────────────────────

  // Generate search queries from the topic
  const topicWords = topic.toLowerCase();
  const searchQueries = [
    topic,
    // Adjacent terms for broader signal
    ...(topicWords.includes("claude") ? ["claude code tutorial", "ai coding"] : []),
    ...(topicWords.includes("cursor") ? ["cursor ai coding", "vibe coding cursor"] : []),
    ...(topicWords.includes("coding") || topicWords.includes("code") ? ["vibe coding", "ai coding beginner"] : []),
    ...(topicWords.includes("solana") ? ["solana dev tools", "solana coding"] : []),
  ].slice(0, 4); // Max 4 queries to conserve credits

  const hashtagQueries = [
    topic.replace(/\s+/g, "").toLowerCase(),
    "aicoding",
    "vibecoding",
  ].slice(0, 3);

  log("researcher", `Searching: ${searchQueries.join(", ")}`);

  // Run all searches in parallel
  const [keywordResults, hashtagResults] = await Promise.all([
    Promise.all(searchQueries.map((q) => searchByKeyword(q))),
    Promise.all(hashtagQueries.map((h) => searchByHashtag(h))),
  ]);

  // Deduplicate and merge all videos
  const allVideos = new Map<string, TikTokVideoItem>();
  for (const batch of [...keywordResults, ...hashtagResults]) {
    for (const video of batch) {
      if (video.aweme_id && !allVideos.has(video.aweme_id)) {
        allVideos.set(video.aweme_id, video);
      }
    }
  }

  const videos = Array.from(allVideos.values());
  log("researcher", `Found ${videos.length} unique videos from TikTok`);

  // If no TikTok data available (API down or no credits), proceed with LLM-only analysis
  if (videos.length === 0) {
    log("researcher", "No TikTok data — proceeding with LLM-only trend analysis");
  }

  // ── Step 2: Pre-process data for LLM ──────────────────────────────────────

  // Sort by play count, take top 30
  const topVideos = videos
    .sort((a, b) => (b.statistics?.play_count ?? 0) - (a.statistics?.play_count ?? 0))
    .slice(0, 30);

  // Extract hooks and score them
  const videoAnalysis = topVideos.map((v) => {
    const hook = extractHookFromDesc(v.desc);
    return {
      hook,
      hookScore: scoreHook(hook),
      description: v.desc?.slice(0, 200) ?? "",
      views: v.statistics?.play_count ?? 0,
      likes: v.statistics?.digg_count ?? 0,
      comments: v.statistics?.comment_count ?? 0,
      shares: v.statistics?.share_count ?? 0,
      saves: v.statistics?.collect_count ?? 0,
      duration: v.video?.duration ?? 0,
      ageHours: Math.round((Date.now() / 1000 - v.create_time) / 3600),
      creator: v.author?.uniqueId ?? "unknown",
      creatorFollowers: v.author?.follower_count ?? 0,
    };
  });

  // Get trend timing
  const trendInfo = determineTrendStatus(topVideos);

  // Extract hashtags from descriptions
  const hashtagCounts = new Map<string, number>();
  for (const v of topVideos) {
    const tags = v.desc?.match(/#\w+/g) ?? [];
    for (const tag of tags) {
      hashtagCounts.set(tag.toLowerCase(), (hashtagCounts.get(tag.toLowerCase()) ?? 0) + 1);
    }
  }
  const topHashtags = Array.from(hashtagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag]) => tag);

  // Try to get transcript of the top video for hook analysis
  let topTranscript: string | null = null;
  if (topVideos[0]?.aweme_id) {
    topTranscript = await getVideoTranscript(
      `https://www.tiktok.com/@${topVideos[0].author?.uniqueId ?? "user"}/video/${topVideos[0].aweme_id}`
    );
  }

  // ── Step 3: LLM analysis of real data ─────────────────────────────────────

  // Slim payload — only send top 5 hooks + aggregate stats to avoid hitting content filters
  const topHooks = videoAnalysis
    .sort((a, b) => b.hookScore - a.hookScore)
    .slice(0, 5)
    .map((v) => ({ hook: v.hook, score: v.hookScore, views: v.views, duration: v.duration }));

  const dataPayload = {
    topic,
    total_videos_found: videos.length,
    trend_timing: trendInfo,
    top_hashtags: topHashtags,
    top_hooks: topHooks,
    average_duration: videoAnalysis.length > 0
      ? Math.round(videoAnalysis.reduce((s, v) => s + v.duration, 0) / videoAnalysis.length)
      : 30,
    average_views: videoAnalysis.length > 0
      ? Math.round(videoAnalysis.reduce((s, v) => s + v.views, 0) / videoAnalysis.length)
      : 0,
  };

  const userPrompt = `Analyze this TikTok trend data for "${topic}" and produce your research output. Keep top_hooks to 3 entries max and keep all string fields concise:\n\n${JSON.stringify(dataPayload, null, 2)}`;

  const parsed = await callClaudeJSON<ResearchOutput>(ANALYSIS_SYSTEM, userPrompt, "researcher");

  // Force GO when no real TikTok data — LLM can't reliably judge trends without data
  if (videos.length === 0 && parsed.trend_decision === "PIVOT") {
    log("researcher", "No real data to justify PIVOT — overriding to GO");
    parsed.trend_decision = "GO";
    parsed.trend_reason = "No TikTok data available; proceeding with topic as-is.";
  }

  log("researcher", `Done — ${parsed.trend_decision} (${parsed.urgency}) | ${videos.length} real videos analyzed`);
  return parsed;

  throw new Error("Researcher failed after 3 attempts");
}
