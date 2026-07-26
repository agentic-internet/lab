/** The two-phase flow: employee intake opens a ticket, operations resolves it
 *  agent-to-agent. Run Acme first, then: pnpm dlx tsx examples/verify.ts */
import { runIntake, runResolve } from "../src/agent";

const icon: Record<string, string> = {
  user: "🧑", agent: "🤖", tool: "🔧", mcp: "🔌", http: "🌐", policy: "🛑", assistant: "💬",
};
const show = (e: { channel: string; text: string }) =>
  console.log(`${icon[e.channel] ?? " "} [${e.channel}] ${e.text}`);

console.log("── EMPLOYEE INTAKE ──");
const ticket = await runIntake({
  subscriber: "Globex Marketing",
  message: "My mobile internet keeps running out — I need a bigger plan.",
  onLog: show,
});

console.log(`\n── OPERATIONS RESOLVE (${ticket?.id}) ──`);
await runResolve({ ticketId: ticket!.id, onLog: show });
