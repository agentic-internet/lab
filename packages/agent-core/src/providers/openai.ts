import { openAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "../types";

/** OpenAI (GPT). Needs OPENAI_API_KEY at runtime. */
export function openaiProvider(opts?: { model?: string; apiKey?: string }): LLMProvider {
  return openAICompatibleProvider({
    label: "openai",
    model: opts?.model ?? "gpt-4o-mini",
    apiKey: opts?.apiKey ?? process.env.OPENAI_API_KEY,
  });
}
