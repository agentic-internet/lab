import OpenAI from "openai";
import type { LLMProvider, Msg, ToolDef, Turn, TurnContext } from "../types";

/**
 * One provider for any OpenAI-compatible chat API — OpenAI itself, DeepSeek, and
 * Gemini's OpenAI-compatible endpoint all speak this. A turn is one
 * chat.completions call carrying the tools; swappable with Anthropic behind the
 * same LLMProvider interface.
 */
export function openAICompatibleProvider(opts: {
  label: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
}): LLMProvider {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  return {
    name: `${opts.label}:${opts.model}`,
    async turn(ctx: TurnContext): Promise<Turn> {
      const res = await client.chat.completions.create({
        model: opts.model,
        messages: [{ role: "system", content: ctx.system }, ...ctx.messages.map(toOpenAIMessage)],
        tools: ctx.tools.length ? ctx.tools.map(toOpenAITool) : undefined,
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
          text: choice?.content ?? undefined,
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
  if (t === "object") return "object";
  if (t === "array") return "array";
  return "string";
}
