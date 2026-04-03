# TikTok Video Generator

Generate a TikTok video from a topic using the Claude Auto Tok pipeline.

## Usage
/tiktok "your topic here"

## What it does
1. Researches trending TikTok data for the topic (ScrapeCreators + Claude via OpenRouter)
2. Writes a viral script with hook, voiceover, and captions
3. Generates voice with ElevenLabs v3
4. Finds matching B-roll from Pexels (or Kling AI if configured)
5. Renders a 9:16 vertical video with Remotion (bold subtitles, crossfades, progress bar, bg music)
6. Reviews with multimodal Gemini (watches the actual video)
7. Copies final video + caption + thumbnail to output/ready/

## Instructions

The user wants to generate a TikTok video. Run the following steps:

1. Run the pipeline:
```bash
cd <project-root> && npx ts-node src/orchestrator.ts "$ARGUMENTS" 2>&1
```

2. When complete, find the latest job folder:
```bash
LATEST=$(ls -t <project-root>/output/ready/ | head -1)
echo "Video ready: output/ready/$LATEST/"
cat "<project-root>/output/ready/$LATEST/caption.txt"
```

3. Tell the user the video path and show them the caption text.

## Notes
- Pipeline takes ~5-8 minutes per video
- Uses OpenRouter (Claude Sonnet) for LLM calls
- Uses ElevenLabs v3 for voice — needs credits (~500 chars per video)
- If Kling API has credits, set KLING_ACCESS_KEY in .env for AI-generated B-roll
- Background music plays automatically if DEFAULT_BG_MUSIC is set in .env
- Run videos one at a time — parallel Remotion renders can fail on memory
