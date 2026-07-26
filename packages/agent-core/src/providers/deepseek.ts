import OpenAI from "openai";
import type { LLMProvider, Msg, ToolDef, Turn, TurnContext } from "../types";

/**
 * DeepSeek (OpenAI-compatible API). The cheap option for the public demo. Same
 * LLMProvider interface — swappable with Anthropic via one admin setting.
 *
 * Needs DEEPSEEK_API_KEY at runtime. Compile-checked; verify live with a key.
 */
export function deepseekProvider(opts?: { model?: string; apiKey?: string }): LLMProvider {
  const client = new OpenAI({
    apiKey: opts?.apiKey ?? process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  const model = opts?.model ?? "deepseek-chat";

  return {
    name: `deepseek:${model}`,
    async turn(ctx: TurnContext): Promise<Turn> {
      const res = await client.chat.completions.create({
        model,
        messages: [
          { role: "system", content: ctx.system },
          ...ctx.messages.map(toOpenAIMessage),
        ],
        tools: ctx.tools.map(toOpenAITool),
      });

      const choice = res.choices[0]?.message;
      const call = choice?.tool_calls?.[0];
      if (call && call.type === "function") {
        return {
          toolCall: {
            id: call.id,
            tool: call.function.name,
            args: JSON.parse(call.function.arguments || "{}") as Record<string, unknown>,
          },
        };
      }
      return { text: choice?.content ?? "" };
    },
  };
}

function toOpenAITool(t: ToolDef): OpenAI.Chat.Completions.ChatCompletionTool {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const [name, f] of Object.entries(t.input)) {
    properties[name] = { type: jsonType(f.type), description: f.description };
    if (f.required) required.push(name);
  }
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties, required },
    },
  };
}

function toOpenAIMessage(m: Msg): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (m.role === "user") return { role: "user", content: m.content };
  if (m.role === "assistant") {
    if (m.toolCall) {
      return {
        role: "assistant",
        content: m.content ?? null,
        tool_calls: [
          {
            id: m.toolCall.id,
            type: "function",
            function: { name: m.toolCall.tool, arguments: JSON.stringify(m.toolCall.args) },
          },
        ],
      };
    }
    return { role: "assistant", content: m.content ?? "" };
  }
  return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
}

function jsonType(t: string): string {
  if (t === "integer") return "integer";
  if (t === "boolean") return "boolean";
  if (t === "number") return "number";
  return "string";
}
