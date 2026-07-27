/**
 * End-to-end, against a running Acme (port 3001), of the AGENT-TO-AGENT ops flow
 * WITH the resolver in the path. Deterministic mode (no LLM):
 *   query → (gap check + resolver grant + call_external) → escalate → manager
 *   approves a tariff → apply (grant reused) → Acme applies the change.
 *
 * Run Acme first, then: ACME_URL=http://localhost:3001 pnpm dlx tsx examples/verify-a2a-live.ts
 */
import { scriptedProvider } from "@ail/agent-core";
import { runOpsChatA2A } from "../src/agent";
import { createTicket, getTicket, reset as resetTickets } from "../src/tickets";
import { forTicket, decideEscalation, reset as resetEsc, type TariffOption } from "../src/escalations";

const icon: Record<string, string> = {
  user: "🧑", agent: "🤖", tool: "🔧", mcp: "🔌", http: "🌐", policy: "🛑",
  assistant: "💬", boundary: "🚧", resolver: "🛂", reason: "🧠", hook: "⚙️", panel: "🔑",
};
const show = (e: { channel: string; text: string }) => console.log(`${icon[e.channel] ?? " "} [${e.channel}] ${e.text}`);

resetTickets();
resetEsc();

const ticket = createTicket({
  subscriber: "Jordan Blake",
  line_id: "GLX-4471",
  operator_name: "Acme Telecom",
  operator_domain: process.env.ACME_URL ?? "http://localhost:3001",
  request: "Upgrade my plan — I keep running out of data.",
});

console.log("── 1) OPS asks for options (agent-to-agent) ──");
await runOpsChatA2A({ ticketId: ticket.id, message: "which tariffs are available?", onLog: show });

console.log("\n── 2) OPS escalates to a manager with the options ──");
await runOpsChatA2A({ ticketId: ticket.id, message: "escalate this to a manager", onLog: show });

const esc = forTicket(ticket.id);
const options = (esc?.options ?? []) as TariffOption[];
const chosen = options.at(-1); // the manager picks the top option
console.log(`\n── 3) MANAGER approves → ${chosen?.name} (${chosen?.id}) ──`);
decideEscalation(esc!.id, "approve", chosen?.id);

console.log("\n── 4) OPS applies the change (grant reused, agent-to-agent) ──");
await runOpsChatA2A({ ticketId: ticket.id, message: "apply the upgrade", onLog: show });

const done = getTicket(ticket.id);
const happyOk = done?.status === "done";
console.log(`\n${happyOk ? "PASS" : "FAIL"}: ticket ${done?.id} status=${done?.status} — ${done?.resolution ?? ""}`);

// Negative: an agent that skips authorization and reaches out anyway is blocked
// at the boundary — no grant, no call.
console.log("\n── 5) NEGATIVE: reach out with no grant → blocked ──");
const t2 = createTicket({
  subscriber: "Jordan Blake",
  line_id: "GLX-4471",
  operator_name: "Acme Telecom",
  operator_domain: process.env.ACME_URL ?? "http://localhost:3001",
  request: "Upgrade my plan.",
});
let blocked = false;
let fetched = false;
const skipAuth = scriptedProvider("skip-auth", (ctx) => {
  const calls = ctx.messages.filter((m) => m.role === "tool").length;
  if (calls === 0) return { toolCall: { tool: "query_available_tariffs", args: {} } };
  return { text: "gave up — I was blocked." };
});
await runOpsChatA2A({
  ticketId: t2.id,
  message: "which tariffs are available?",
  provider: skipAuth,
  onLog: (e) => {
    show(e);
    if (e.channel === "hook" && /BLOCKED/.test(e.text)) blocked = true;
    if (e.channel === "http" && /queried/.test(e.text)) fetched = true;
  },
});
const negOk = blocked && !fetched;
console.log(`\n${negOk ? "PASS" : "FAIL"}: unauthorized reach ${blocked ? "was blocked" : "was NOT blocked"}${fetched ? " but options were fetched!" : ""}`);

process.exit(happyOk && negOk ? 0 : 1);
