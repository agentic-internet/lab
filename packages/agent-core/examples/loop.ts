/** Self-test: the agent loop drives a two-step flow with the scripted provider.
 *  Run: pnpm dlx tsx examples/loop.ts */
import { runAgent, scriptedProvider, toolResultCount, type ToolDef } from "../src/index";

const tools: ToolDef[] = [
  {
    name: "lookup_line",
    description: "Look up a subscriber line",
    input: { subscriber: { type: "string", required: true } },
    run: async () => ({ line_id: "GLX-4471", operator: "Acme Telecom", tariff: "Standard" }),
  },
  {
    name: "open_ticket",
    description: "Open a support ticket",
    input: { line_id: { type: "string" }, request: { type: "string" } },
    run: async () => ({ ticket_id: "TKT-1001", status: "open" }),
  },
];

// deterministic script: lookup, then open a ticket, then reply
const provider = scriptedProvider("deterministic", (ctx) => {
  const n = toolResultCount(ctx.messages);
  if (n === 0) return { toolCall: { tool: "lookup_line", args: { subscriber: "Globex Marketing" } } };
  if (n === 1) return { toolCall: { tool: "open_ticket", args: { line_id: "GLX-4471", request: "upgrade tariff" } } };
  return { text: "Your request is logged as TKT-1001. Operations will review it." };
});

await runAgent({
  provider,
  system: "You are Globex's internal assistant.",
  tools,
  message: "My mobile tariff isn't enough anymore.",
  onEvent: (e) => {
    if (e.type === "user") console.log(`user: ${e.text}`);
    if (e.type === "tool-call") console.log(`  → ${e.tool}(${JSON.stringify(e.args)})`);
    if (e.type === "tool-result") console.log(`  ← ${JSON.stringify(e.result)}`);
    if (e.type === "assistant") console.log(`assistant: ${e.text}`);
  },
});
