import type { LLMProvider, Msg, OnAgentEvent, PreToolUse, ToolDef, Turn, TurnContext } from "./types";

let seq = 0;
const nextId = () => `call_${Date.now()}_${seq++}`;

/**
 * The agent loop, provider-agnostic. Ask the provider what to do; if it calls a
 * tool, run the (always-real) tool and feed the result back; otherwise return
 * its reply. Every step is emitted for the log panel.
 */
export async function runAgent(opts: {
  provider: LLMProvider;
  system: string;
  tools: ToolDef[];
  message: string;
  /** Prior conversation turns (text only), so the agent has continuity. */
  history?: { role: "user" | "assistant"; text: string }[];
  /** A gate run before each tool call — can block, and makes the check visible. */
  preToolUse?: PreToolUse;
  onEvent?: OnAgentEvent;
  maxSteps?: number;
}): Promise<string> {
  const emit = opts.onEvent ?? (() => {});
  const messages: Msg[] = [
    ...(opts.history ?? []).map((h) =>
      h.role === "user"
        ? ({ role: "user", content: h.text } as const)
        : ({ role: "assistant", content: h.text } as const),
    ),
    { role: "user", content: opts.message },
  ];
  emit({ type: "user", text: opts.message });

  const maxSteps = opts.maxSteps ?? 10;
  for (let step = 0; step < maxSteps; step++) {
    const turn = await opts.provider.turn({ system: opts.system, messages, tools: opts.tools });

    if (turn.toolCall) {
      const id = turn.toolCall.id ?? nextId();
      const { tool, args } = turn.toolCall;
      // The model's own reasoning that came alongside the tool call (live models).
      if (turn.text?.trim()) emit({ type: "reasoning", text: turn.text.trim() });
      // PreToolUse gate — visible, and can block.
      const gate = opts.preToolUse?.(tool, args);
      const allowed = gate ? gate.allow : true;
      emit({ type: "pre-tool", tool, args, allowed, reason: gate?.reason });
      emit({ type: "tool-call", tool, args });
      let result: unknown;
      if (!allowed) {
        result = { blocked: true, reason: gate?.reason ?? "blocked by policy" };
      } else {
        const def = opts.tools.find((t) => t.name === tool);
        result = def ? await def.run(args) : { error: `unknown tool ${tool}` };
      }
      emit({ type: "tool-result", tool, result });
      messages.push({ role: "assistant", toolCall: { id, tool, args } });
      messages.push({ role: "tool", toolCallId: id, content: JSON.stringify(result) });
      continue;
    }

    const text = turn.text ?? "";
    emit({ type: "assistant", text });
    return text;
  }

  const msg = "Stopped: reached the step limit.";
  emit({ type: "assistant", text: msg });
  return msg;
}

/**
 * The deterministic / "off" provider. No LLM, no cost. A script decides the next
 * turn from the conversation so far — the same tool calls a real model would
 * make, but scripted. The tools it triggers are still the real ones.
 */
export function scriptedProvider(
  name: string,
  script: (ctx: TurnContext) => Promise<Turn> | Turn,
): LLMProvider {
  return {
    name,
    async turn(ctx) {
      return script(ctx);
    },
  };
}

/** How many tool results are already in the conversation — handy for scripts. */
export function toolResultCount(messages: Msg[]): number {
  return messages.filter((m) => m.role === "tool").length;
}
