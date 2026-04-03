// ── Inter-Agent JSON Contracts ────────────────────────────────────────────────

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

// ── Agent 1: Researcher ──────────────────────────────────────────────────────

export interface ResearchOutput {
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
  trend_decision: "GO" | "WAIT" | "PIVOT";
  trend_reason: string;
  urgency: "normal" | "post within 6hrs" | "post within 2hrs";
  pivot_angles: string[] | null;
}

// ── Agent 2: Scriptwriter ────────────────────────────────────────────────────

export interface OverlayByIndex {
  startWordIndex: number;
  endWordIndex: number;
  text: string;
  position: "upper" | "center";
}

export interface ScriptOutput {
  hook_variants: { hook: string; formula_used: string; why: string }[];
  chosen_hook: number;
  script: {
    hook_text_onscreen: string;
    hook_spoken: string;
    voiceover_text: string;
    overlays: OverlayByIndex[];
    caption: string;
    hashtags: string[];
  };
  estimated_length_seconds: number;
  rewatch_hook: string;
  self_review_score: number;
}

// ── Agent 3: Voice Producer ──────────────────────────────────────────────────

export interface VoiceProducerOutput {
  wordTimings: WordTiming[];
  voiceoverPath: string;
  voiceoverPublicName: string;
  durationMs: number;
}

// ── Agent 4: Visual Director ─────────────────────────────────────────────────

export interface SceneAsset {
  type: "screenshot" | "imagen" | "stock-video" | "code-typing" | "none";
  path: string;
  prompt?: string;
  url?: string;
  searchQuery?: string;
}

export interface ResolvedScene {
  overlayText: string;
  startMs: number;
  endMs: number;
  position: "upper" | "center";
  background?: SceneAsset;
}

export interface VisualPlan {
  templateId: string;
  colorPalette: "daemon" | "highcontrast" | "amber" | "bluetech";
  scenes: ResolvedScene[];
  ctaStartMs: number;
  thumbnailPath: string | null;
  thumbnailPrompt: string;
  backgroundMusic: string | null;
}

// ── Agent 6: Reviewer ────────────────────────────────────────────────────────

export interface ReviewOutput {
  scores: {
    hook: { score: number; reason: string };
    completion: { score: number; reason: string };
    thumbnail: { score: number; reason: string };
    caption_seo: { score: number; reason: string };
  };
  total: number;
  decision: "APPROVE" | "CONDITIONAL" | "DENY";
  revision_notes: string;
  revision_target: "scriptwriter" | "visual_director" | "both" | null;
  post_timing_recommendation: string;
}

// ── Pipeline State ───────────────────────────────────────────────────────────

export interface PipelineState {
  topic: string;
  slug: string;
  jobPath: string;
  research: ResearchOutput | null;
  script: ScriptOutput | null;
  voice: VoiceProducerOutput | null;
  visual: VisualPlan | null;
  videoPath: string | null;
  review: ReviewOutput | null;
  revisionCount: number;
  previousVoiceoverText: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const log = (agent: string, msg: string) =>
  console.log(`\n[${new Date().toISOString()}] [${agent.toUpperCase()}] ${msg}`);

export const slugify = (str: string) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
