import { log } from "../state";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "anthropic/claude-sonnet-4";

/**
 * Call Claude via OpenRouter API.
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; json?: boolean } = {}
): Promise<string> {
  const { maxTokens = 4096, json = true } = options;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const messages = [
    { role: "system" as const, content: systemPrompt + (json ? "\n\nOutput valid JSON only. No markdown code fences." : "") },
    { role: "user" as const, content: userPrompt },
  ];

  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
    error?: { message: string };
  };

  if (data.error) {
    throw new Error(`OpenRouter error: ${data.error.message}`);
  }

  const raw = data.choices?.[0]?.message?.content ?? "";
  return raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

/**
 * Call Claude and parse JSON response. Retries up to 3 times.
 */
export async function callClaudeJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  label: string = "llm"
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await callClaude(systemPrompt, userPrompt, { json: true });
      return JSON.parse(raw) as T;
    } catch (err) {
      const msg = (err as Error).message;
      log(label, `Attempt ${attempt + 1}/3 failed: ${msg.slice(0, 150)}`);
      if (attempt < 2) {
        const backoff = (attempt + 1) * 3000;
        log(label, `Retrying in ${backoff / 1000}s...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error(`${label}: failed after 3 attempts`);
}
