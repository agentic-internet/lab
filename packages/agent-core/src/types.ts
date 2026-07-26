/** A pluggable agent runtime. The LLM is one provider behind an interface; the
 *  mechanics (tools) are always real and independent of which provider runs. */

export type Role = "user" | "assistant" | "tool";

export interface Msg {
  role: Role;
  content: string;
}

export interface ToolField {
  type: string;
  required?: boolean;
  description?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  input: Record<string, ToolField>;
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** What one provider turn produces: either a tool call or a final reply. */
export interface Turn {
  toolCall?: ToolCall;
  text?: string;
}

export interface TurnContext {
  system: string;
  messages: Msg[];
  tools: ToolDef[];
}

/**
 * The pluggable seam. AnthropicProvider / DeepSeekProvider (real LLMs) and
 * scriptedProvider (deterministic, zero-cost) all satisfy this.
 */
export interface LLMProvider {
  name: string;
  turn(ctx: TurnContext): Promise<Turn>;
}

/** Everything that happens, in order — the log panel subscribes to this. */
export type AgentEvent =
  | { type: "user"; text: string }
  | { type: "tool-call"; tool: string; args: Record<string, unknown> }
  | { type: "tool-result"; tool: string; result: unknown }
  | { type: "assistant"; text: string }
  | { type: "note"; text: string };

export type OnAgentEvent = (e: AgentEvent) => void;
