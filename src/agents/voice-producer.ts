import * as fs from "fs";
import * as path from "path";
import { WordTiming, VoiceProducerOutput, log } from "../state";

const VOICE_ID = "TX3LPaxmHKxFdv7VOQHJ"; // Liam — young, energetic, punchy

interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment: ElevenLabsAlignment;
}

function parseWordTimings(
  text: string,
  alignment: ElevenLabsAlignment
): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  const { characters, character_start_times_seconds, character_end_times_seconds } = alignment;

  const timings: WordTiming[] = [];
  let charIdx = 0;

  for (const word of words) {
    // Skip whitespace characters in alignment
    while (charIdx < characters.length && characters[charIdx].trim() === "") {
      charIdx++;
    }

    if (charIdx >= characters.length) break;

    const wordStartMs = character_start_times_seconds[charIdx] * 1000;
    let wordEndMs = wordStartMs;

    // Walk through characters that make up this word
    let matchedChars = 0;
    while (charIdx < characters.length && matchedChars < word.length) {
      const char = characters[charIdx];
      if (char.trim() === "") {
        charIdx++;
        continue;
      }
      wordEndMs = character_end_times_seconds[charIdx] * 1000;
      charIdx++;
      matchedChars++;
    }

    timings.push({
      word,
      startMs: Math.round(wordStartMs),
      endMs: Math.round(wordEndMs),
    });
  }

  return timings;
}

function fallbackTimings(text: string, durationMs: number): WordTiming[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const msPerWord = durationMs / words.length;
  return words.map((word, i) => ({
    word,
    startMs: Math.round(i * msPerWord),
    endMs: Math.round((i + 1) * msPerWord),
  }));
}

export async function runVoiceProducer(
  voiceoverText: string,
  jobPath: string,
  slug: string,
  publicDir: string
): Promise<VoiceProducerOutput> {
  log("voice-producer", "Calling ElevenLabs /with-timestamps...");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: voiceoverText,
        model_id: "eleven_v3",
        voice_settings: {
          stability: 0.40,
          similarity_boost: 0.80,
          style: 0.35,
          speed: 1.05,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as ElevenLabsTimestampResponse;

  // Decode audio
  const audioBuffer = Buffer.from(data.audio_base64, "base64");
  const voiceoverPath = path.join(jobPath, "voiceover.mp3");
  fs.writeFileSync(voiceoverPath, audioBuffer);

  // Copy to public for Remotion
  fs.mkdirSync(publicDir, { recursive: true });
  const voiceoverPublicName = `voiceover-${slug}.mp3`;
  fs.copyFileSync(voiceoverPath, path.join(publicDir, voiceoverPublicName));

  // Parse word timings
  let wordTimings: WordTiming[];
  const expectedWords = voiceoverText.split(/\s+/).filter(Boolean);

  if (data.alignment?.characters?.length > 0) {
    wordTimings = parseWordTimings(voiceoverText, data.alignment);
    log("voice-producer", `Parsed ${wordTimings.length} word timings from alignment`);

    // Validate
    if (wordTimings.length !== expectedWords.length) {
      log(
        "voice-producer",
        `Word count mismatch: expected ${expectedWords.length}, got ${wordTimings.length}. Using parsed timings anyway.`
      );
    }
  } else {
    log("voice-producer", "No alignment data — falling back to proportional timing");
    const lastChar = data.alignment?.character_end_times_seconds;
    const durationMs = lastChar?.length
      ? lastChar[lastChar.length - 1] * 1000
      : 30000;
    wordTimings = fallbackTimings(voiceoverText, durationMs);
  }

  // Calculate duration from last word
  const durationMs =
    wordTimings.length > 0
      ? wordTimings[wordTimings.length - 1].endMs
      : 30000;

  // Save timings
  fs.writeFileSync(
    path.join(jobPath, "word-timings.json"),
    JSON.stringify(wordTimings, null, 2)
  );

  log("voice-producer", `Done — ${(durationMs / 1000).toFixed(1)}s, ${wordTimings.length} words`);

  return {
    wordTimings,
    voiceoverPath,
    voiceoverPublicName,
    durationMs,
  };
}
