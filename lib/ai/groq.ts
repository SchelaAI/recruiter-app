import "server-only";
import Groq from "groq-sdk";

export const MODEL = "openai/gpt-oss-120b";

/**
 * Lazily constructed — importing this module must never throw just because
 * GROQ_API_KEY isn't set yet. The groq-sdk client throws immediately in its
 * constructor if the key is missing, and since this module is imported
 * (directly or transitively) by ordinary API routes like /api/ask, an
 * eager `export const groq = new Groq(...)` would fail Next.js's build-time
 * page-data collection for the WHOLE APP the moment the key is absent —
 * not just degrade the AI feature, but break auth, candidates, everything.
 * Constructing on first real use means a missing key only breaks the AI
 * call that actually needs it, with a clear error at that point instead.
 */
let _client: Groq | null = null;
export function getGroqClient(): Groq {
  if (!_client) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set — add it to your environment to use AI features.");
    }
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _client;
}
