import { openAICompatibleProvider } from "./openai-compatible";
import type { LLMProvider } from "../types";

/**
 * DeepSeek (OpenAI-compatible API). The cheap option for the public demo.
 * Needs DEEPSEEK_API_KEY at runtime.
 */
export function deepseekProvider(opts?: { model?: string; apiKey?: string }): LLMProvider {
  return openAICompatibleProvider({
    label: "deepseek",
    model: opts?.model ?? "deepseek-chat",
    apiKey: opts?.apiKey ?? process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
}
