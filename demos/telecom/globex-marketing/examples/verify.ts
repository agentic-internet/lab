/** The whole Demo B chain through Globex's agent. Run Acme first, then:
 *  pnpm dlx tsx examples/verify.ts */
import { runTelecomAgent } from "../src/agent";

const icon: Record<string, string> = {
  user: "🧑", agent: "🤖", tool: "🔧", mcp: "🔌", http: "🌐", policy: "🛑", assistant: "💬",
};

await runTelecomAgent({
  subscriber: "Globex Marketing",
  message: "My mobile internet keeps running out — I need a bigger plan.",
  onLog: (e) => console.log(`${icon[e.channel] ?? " "} [${e.channel}] ${e.text}`),
});
