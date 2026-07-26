import type { LLMProvider, Msg, OnAgentEvent, ToolDef, TurnContext } from "./types";

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
  onEvent?: OnAgentEvent;
  maxSteps?: number;
}): Promise<string> {
  const emit = opts.onEvent ?? (() => {});
  const messages: Msg[] = [{ role: "user", content: opts.message }];
  emit({ type: "user", text: opts.message });

  const maxSteps = opts.maxSteps ?? 10;
  for (let step = 0; step < maxSteps; step++) {
    const turn = await opts.provider.turn({
      system: opts.system,
      messages,
      tools: opts.tools,
    });

    if (turn.toolCall) {
      const { tool, args } = turn.toolCall;
      emit({ type: "tool-call", tool, args });
      const def = opts.tools.find((t) => t.name === tool);
      const result = def
        ? await def.run(args)
        : { error: `unknown tool ${tool}` };
      emit({ type: "tool-result", tool, result });
      messages.push({ role: "assistant", content: `call ${tool}(${JSON.stringify(args)})` });
      messages.push({ role: "tool", content: JSON.stringify(result) });
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
  script: (ctx: TurnContext) => Promise<import("./types").Turn> | import("./types").Turn,
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
