# TikTok Content Pipeline Automation Strategy

## 1. TikTok Content Posting API

**OAuth Setup:** TikTok uses OAuth 2.0 with PKCE. You redirect the user to TikTok's authorization URL with your `client_key`, scope (`video.publish`), and `redirect_uri`. After consent, exchange the auth code for an `access_token` (24-hour TTL) and `refresh_token` (365-day TTL). You will need a small web server or serverless function to handle the OAuth callback and persist tokens with automatic refresh.

**Drafts vs Direct Publish:** The API supports both modes. Draft mode (`MEDIA_UPLOAD`) uploads the video to the creator's TikTok inbox but does NOT allow setting captions, privacy, or metadata via API -- the creator must finish publishing manually inside the TikTok app. Direct Post mode sets title, caption, privacy level, and interaction toggles at upload time, enabling fully hands-free posting. For full automation, Direct Post is required.

**Privacy Levels:** Options are `SELF_ONLY`, `MUTUAL_FOLLOW_FRIENDS`, `FOLLOWER_OF_CREATOR`, and `PUBLIC_TO_EVERYONE`. However, your app must query the `/creator_info/` endpoint first and only present the options TikTok returns for that specific account. Unaudited apps are locked to `SELF_ONLY`.

**Rate Limits:** 6 requests per minute per user token on the publish endpoint. The daily post cap is approximately 15 posts per day per creator account, shared across all API clients using Direct Post. Two posts per day is well within limits.

**App Approval:** There are two gates. First, app review (1-2 weeks) where TikTok reviews your app description, privacy policy, and use case. Second, a Direct Post audit (5-10 business days) where you submit a demo video of your upload flow. Until audited, you are limited to 5 users and `SELF_ONLY` visibility. Plan for 3-4 weeks total from submission to full production access.

## 2. Scheduling and Automation

**Recommended approach: Cron on a lightweight VPS or a GitHub Actions scheduled workflow.**

The pipeline (`pnpm swarm:run "topic"`) takes 10-15 minutes per video (Gemini calls, ElevenLabs TTS, Pexels/Kling asset fetching, Remotion render). This exceeds free-tier GitHub Actions limits (6-hour max, but the real constraint is concurrency and minutes quotas). A small VPS (e.g., Hetzner CX22 at ~$4/month, or a free Oracle Cloud ARM instance) running two cron jobs is the simplest and cheapest option.

**Suggested cron schedule:**
```
0 6 * * *  cd /path/to/tiktok-swarm && node scripts/auto-run.js morning
0 14 * * * cd /path/to/tiktok-swarm && node scripts/auto-run.js afternoon
```

The `auto-run.js` wrapper script should: (1) pull the next topic from the topic queue, (2) invoke the pipeline, (3) on success, call the TikTok Direct Post API to upload the video from `output/ready/`, (4) log the result, (5) on failure, retry once with a fallback topic, then alert via webhook (Discord/Slack/email).

**Error recovery:** The pipeline already has a revision loop (up to 2 retries) and gracefully auto-approves if the reviewer agent fails. The wrapper should catch pipeline-level crashes (API timeouts, ElevenLabs outages) and either retry with exponential backoff or skip to the next scheduled slot and alert. Keep a `failed_jobs/` log for manual review.

## 3. Topic Generation

**ScrapeCreators integration is already built into the researcher agent.** The pipeline searches TikTok by keyword and hashtag, scores hooks, and determines trend status. To automate topic selection:

- **Topic queue file** (`topics.json`): Maintain a rolling list of 14+ topics (one week buffer). Each entry has a topic string, a status (pending/used/failed), and a date-used field.
- **Weekly refill via Gemini:** Run a weekly cron job that calls Gemini with recent performance data and trending signals from ScrapeCreators to generate 14 fresh topics. Append to the queue.
- **Deduplication:** Before adding a topic, check it against all previously used topics (fuzzy match via embedding similarity or simple keyword overlap). The researcher agent already handles PIVOT decisions for saturated topics -- if it returns PIVOT, the wrapper should pop the next topic from the queue and retry.
- **Category rotation:** Tag topics by category (tutorials, tool comparisons, "you won't believe" hooks, myth-busting) and ensure no category appears more than twice consecutively.

## 4. Cost Estimation (2 Videos Per Day)

| Service | Usage per video | Cost per video | Daily (x2) | Monthly (x60) |
|---------|----------------|---------------|------------|----------------|
| **Gemini 2.5 Flash** | ~4 calls (researcher, scriptwriter, visual director, reviewer) at ~2K input + 1K output tokens each | ~$0.01 | $0.02 | $0.60 |
| **ElevenLabs** (eleven_v3) | ~500 chars | $0.06/1K chars = $0.03 | $0.06 | $1.80 |
| **Imagen 4.0** (thumbnail) | 1 image | ~$0.02 | $0.04 | $1.20 |
| **Pexels** | 4-6 stock video downloads | Free (200 req/hr) | $0 | $0 |
| **Kling** (when available) | 4-6 AI video clips | ~$0.20-0.50 per clip | $1.60-6.00 | $48-180 |
| **ScrapeCreators** | 4-7 search calls | Depends on plan (~$0.01/call) | $0.14 | $4.20 |

**Estimated monthly cost WITHOUT Kling:** ~$8-10/month
**Estimated monthly cost WITH Kling:** ~$55-190/month (Kling dominates)

**Optimization tips:** Use Gemini's free tier (15 RPM, 1M TPM) for development/testing. Batch ScrapeCreators calls. Use Pexels as the default background source and reserve Kling for high-priority videos only. The ElevenLabs Starter plan ($5/month, 30K characters) covers ~60 videos per month at 500 chars each -- exactly matching 2/day.

## Summary

The most practical path to full automation is: (1) apply for TikTok Direct Post API access now (expect 3-4 weeks), (2) build a small `auto-run.js` wrapper that reads from a topic queue and uploads finished videos, (3) deploy on a cheap VPS with two daily cron jobs, and (4) add a weekly topic-refill job. Total infrastructure cost is under $15/month excluding Kling, which should be treated as optional.
