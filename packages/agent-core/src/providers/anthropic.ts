import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Msg, ToolDef, Turn, TurnContext } from "../types";

/**
 * Claude, via the Anthropic SDK. The default for the internal demo (on-brand, and it
 * matches the certs). Built to the same LLMProvider interface as everything else.
 *
 * Needs ANTHROPIC_API_KEY at runtime. Compile-checked here; verify live with a key.
 */
export function anthropicProvider(opts?: { model?: string; apiKey?: string }): LLMProvider {
  const client = new Anthropic({ apiKey: opts?.apiKey ?? process.env.ANTHROPIC_API_KEY });
  const model = opts?.model ?? "claude-sonnet-5";

  return {
    name: `anthropic:${model}`,
    async turn(ctx: TurnContext): Promise<Turn> {
      const res = await client.messages.create({
        model,
        max_tokens: 1024,
        system: ctx.system,
        tools: ctx.tools.map(toAnthropicTool),
        messages: ctx.messages.map(toAnthropicMessage),
      });

      const toolUse = res.content.find((b) => b.type === "tool_use");
      if (toolUse && toolUse.type === "tool_use") {
        return {
          toolCall: {
            id: toolUse.id,
            tool: toolUse.name,
            args: (toolUse.input ?? {}) as Record<string, unknown>,
          },
        };
      }
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      return { text };
    },
  };
}

function toAnthropicTool(t: ToolDef): Anthropic.Tool {
  const properties: Record<string, { type: string; description?: string }> = {};
  const required: string[] = [];
  for (const [name, f] of Object.entries(t.input)) {
    properties[name] = { type: jsonType(f.type), description: f.description };
    if (f.required) required.push(name);
  }
  return {
    name: t.name,
    description: t.description,
    input_schema: { type: "object", properties, required },
  };
}

function toAnthropicMessage(m: Msg): Anthropic.MessageParam {
  if (m.role === "user") return { role: "user", content: m.content };
  if (m.role === "assistant") {
    const content: Anthropic.ContentBlockParam[] = [];
    if (m.content) content.push({ type: "text", text: m.content });
    if (m.toolCall)
      content.push({ type: "tool_use", id: m.toolCall.id, name: m.toolCall.tool, input: m.toolCall.args });
    return { role: "assistant", content };
  }
  // tool result -> a user turn carrying a tool_result block
  return {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
  };
}

function jsonType(t: string): string {
  if (t === "integer") return "integer";
  if (t === "boolean") return "boolean";
  if (t === "number") return "number";
  if (t === "object") return "object";
  if (t === "array") return "array";
  return "string";
}
