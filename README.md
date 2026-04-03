```
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
██║     ██║     ███████║██║   ██║██║  ██║█████╗
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
 █████╗ ██╗   ██╗████████╗ ██████╗    ████████╗ ██████╗ ██╗  ██╗
██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗   ╚══██╔══╝██╔═══██╗██║ ██╔╝
███████║██║   ██║   ██║   ██║   ██║      ██║   ██║   ██║█████╔╝
██╔══██║██║   ██║   ██║   ██║   ██║      ██║   ██║   ██║██╔═██╗
██║  ██║╚██████╔╝   ██║   ╚██████╔╝      ██║   ╚██████╔╝██║  ██╗
╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝       ╚═╝    ╚═════╝ ╚═╝  ╚═╝
```

**AI-powered TikTok content factory.** Six autonomous agents research trends, write viral scripts, generate voiceovers, source B-roll, render 9:16 video, and QA the result — all from a single command.

---

## Table of Contents

- [Demo](#demo)
- [How It Works](#how-it-works)
- [Agents](#agents)
- [Quick Start](#quick-start)
- [Video Templates](#video-templates)
- [Remotion Studio](#remotion-studio)
- [Pipeline Architecture](#pipeline-architecture)
- [Revision Loop](#revision-loop)
- [Failure Modes](#failure-modes)
- [Automation (2 Videos/Day)](#automation-2-videosday)
- [Cost Per Video](#cost-per-video)
- [Requirements](#requirements)

---

## Demo

> Sample output from `pnpm swarm:run "build a SaaS in a weekend with Claude Code"`

<video src="https://github.com/nullxnothing/claude-auto-tok/releases/download/v1.0.0/demo.mp4" controls width="320"></video>

[Watch the demo video](https://github.com/nullxnothing/claude-auto-tok/releases/download/v1.0.0/demo.mp4) if the embed doesn't load.

---

## How It Works

```
Topic In ──► Researcher ──► Scriptwriter ──► Voice Producer ──► Visual Director ──► Composer ──► Reviewer ──► Video Out
                │                │                │                  │                │              │
           ScrapeCreators   Claude (OR)     ElevenLabs v3        Pexels/Kling      Remotion     Gemini 2.5
           TikTok trends    Hook formulas   Word-level timing    Stock + AI video   6 templates  Multimodal QA
```

**One command. One topic. One ready-to-post TikTok in ~8 minutes.**

---

## Agents

| # | Agent | Model (pinned) | Job |
|---|-------|----------------|-----|
| 1 | **Researcher** | `gemini-2.5-flash` | Pulls top 20 TikToks via ScrapeCreators, scores hooks, checks trend timing (rising/peak/saturated), gates the pipeline with GO/WAIT/PIVOT |
| 2 | **Scriptwriter** | `claude-sonnet-4-20250514` via OpenRouter | Generates 3 hook variants using proven formulas (contradiction, knowledge gap, bold claim, POV), writes full script with overlays and captions |
| 3 | **Voice Producer** | ElevenLabs v3 (`eleven_multilingual_v2`) | Synthesizes voiceover with word-level timestamps for precise subtitle sync |
| 4 | **Visual Director** | `claude-sonnet-4-20250514` + `imagen-4` | Plans scene backgrounds, fetches B-roll from Pexels (or generates via Kling AI), creates thumbnails, selects color palette and template |
| 5 | **Composer** | Remotion 4.x | Renders final 9:16 video with bold word captions, scene transitions, progress bar, background music, and CTA card |
| 6 | **Reviewer** | `gemini-2.5-pro` | Watches the rendered video, scores hook/completion/thumbnail/SEO on a 20-point rubric, approves or sends back for revision (up to 2 loops) |

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/claude-auto-tok.git
cd claude-auto-tok
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in your API keys:

| Key | Required | Free Tier? |
|-----|----------|------------|
| `OPENROUTER_API_KEY` | Yes | No (~$0.01/video) |
| `GEMINI_API_KEY` | Yes | Yes (15 RPM) |
| `ELEVENLABS_API_KEY` | Yes | Yes (10K chars/mo) |
| `SCRAPECREATORS_API_KEY` | Yes | No (~$0.01/call) |
| `PEXELS_API_KEY` | Yes | Yes (200 req/hr) |
| `KLING_ACCESS_KEY` | No | No (AI video, expensive) |
| `TIKTOK_CLIENT_KEY` | No | Requires app approval |

### 3. Add Background Music

Drop an MP3 into `public/` and set `DEFAULT_BG_MUSIC=your-file.mp3` in `.env`.

### 4. Run

```bash
pnpm swarm:run "why every dev needs an AI IDE"
```

Output lands in `output/ready/<slug>/`:
```
video.mp4           # Final rendered TikTok
caption.txt         # Caption + hashtags
thumbnail.png       # Cover image
script.json         # Full script data
review_score.json   # QA scores
```

---

## Video Templates

Six Remotion templates, auto-selected by the Visual Director:

| Template | Style | Best For |
|----------|-------|----------|
| **A** — Split Reveal | Side-by-side comparison | Before/after, tool comparisons |
| **B** — Terminal Reveal | Dark IDE aesthetic | Code demos, CLI tools |
| **C** — Cinematic Text | Full-screen typography | POV, story-driven hooks |
| **D** — Card Stack | Stacked info cards | Lists, tips, features |
| **E** — Zoom Focus | Ken Burns on assets | Product showcases |
| **F** — Rapid Cut | Fast scene switching | High-energy, trend pieces |

All templates include: bold word captions, progress bar, CTA card, crossfade transitions.

---

## Remotion Studio

Preview and tweak templates in the browser:

```bash
pnpm remotion:studio
```

---

## Pipeline Architecture

```
orchestrator.ts          # Main loop — chains agents, handles revisions
state.ts                 # Shared types (PipelineState, all agent contracts)
agents/
  llm.ts                 # Claude wrapper (OpenRouter)
  prompts.ts             # System prompts for all agents
  researcher.ts          # Trend research + ScrapeCreators
  scriptwriter.ts        # Hook generation + script writing
  voice-producer.ts      # ElevenLabs TTS + word timing
  visual-director.ts     # Asset planning + Pexels/Kling/Imagen
  asset-generator.ts     # Screenshot, stock video, AI image fetching
  broll-library.ts       # Local B-roll clip management
  composer.ts            # Remotion render trigger
  reviewer.ts            # Multimodal QA scoring
remotion/
  Root.tsx               # Composition router
  TemplateA-F.tsx        # Video templates
  components/            # Subtitle, HookCard, CTA, PostEffects, etc.
  palettes.ts            # Color systems
```

---

## Revision Loop

The pipeline self-corrects:

1. Reviewer scores the video on a 20-point rubric
2. Score >= 16 → **APPROVE** (ship it)
3. Score 12-15 → **CONDITIONAL** (one targeted fix, re-score)
4. Score < 12 → **DENY** (full rewrite with specific notes)
5. Max 2 revision loops, then outputs for manual review

Revision targets are specific: "scriptwriter", "visual_director", or "both" — agents only redo their part.

---

## Failure Modes

Things that actually break in production and how the pipeline handles them:

| Failure | Cause | What Happens | Mitigation |
|---------|-------|--------------|------------|
| **Researcher returns WAIT/PIVOT** | Trend is saturated or too niche | Pipeline halts early, no wasted API calls | Retry with a different topic or wait for trend cycle |
| **Hook scoring below threshold** | Claude generates a weak/generic hook | Scriptwriter reruns with tighter constraints | 3 variants are generated — if all score low, pipeline stops with a log |
| **ElevenLabs rate limit** | Free tier: 10K chars/month | Voice producer throws, pipeline exits | Monitor usage in ElevenLabs dashboard, upgrade tier, or queue videos |
| **Pexels returns no results** | Niche topic with bad search terms | Visual director falls back to solid color backgrounds | Kling AI as secondary source (if configured), or manual B-roll in `public/broll/` |
| **Kling AI timeout** | AI video generation takes 2-5 min per clip | Composer hangs waiting for asset | 60s timeout with fallback to Pexels stills; disable Kling for budget runs |
| **Remotion render crash** | Missing assets, corrupt audio, or Chrome OOM | Composer exits with render error log | Check `output/debug/` for frame-level logs; ensure Chrome/Chromium is installed |
| **Audio/subtitle sync drift** | Word-level timestamps misalign with video duration | Captions appear early or late | Voice producer validates total duration against script length before passing to composer |
| **Reviewer scores < 12 twice** | Fundamental issue with topic or script quality | Pipeline exits after 2 revision loops | Output saved to `output/needs-review/` for manual editing; check `review_score.json` for specific failures |
| **ScrapeCreators API down** | Third-party service outage | Researcher fails immediately | Pipeline logs error and exits; no silent fallback to prevent stale trend data |

**General debugging:** Every agent writes structured logs to `output/debug/<agent>.json`. Start there.

---

## Automation (2 Videos/Day)

Set up cron on a VPS for hands-free posting:

```bash
# Morning + afternoon posts
0 6 * * *  cd /path/to/claude-auto-tok && node scripts/auto-run.js morning
0 14 * * * cd /path/to/claude-auto-tok && node scripts/auto-run.js afternoon
```

Requires TikTok Direct Post API access (3-4 week approval process). See `AUTOMATION_STRATEGY.md` for the full deployment guide.

**Estimated cost:** ~$8-10/month without Kling AI video.

---

## Cost Per Video

| Service | Cost | Notes |
|---------|------|-------|
| Claude (OpenRouter) | ~$0.01 | 4 LLM calls per video |
| Gemini 2.5 Flash | ~$0.01 | Research + review (free tier available) |
| ElevenLabs | ~$0.03 | ~500 chars per video |
| Pexels | Free | 200 requests/hour |
| Kling AI (optional) | ~$0.20-0.50/clip | AI-generated video, skip if budget-conscious |
| **Total** | **~$0.05/video** | Without Kling |

---

## Requirements

- Node.js 18+
- pnpm
- Chrome/Chromium (for Remotion rendering)

---

## License

MIT
