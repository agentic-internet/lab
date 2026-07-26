import { openAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "../types";

/**
 * Google Gemini via its OpenAI-compatible endpoint. Needs GEMINI_API_KEY at
 * runtime. Same interface as every other provider.
 */
export function geminiProvider(opts?: { model?: string; apiKey?: string }): LLMProvider {
  return openAICompatibleProvider({
    label: "gemini",
    model: opts?.model ?? "gemini-2.0-flash",
    apiKey: opts?.apiKey ?? process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  });
}
