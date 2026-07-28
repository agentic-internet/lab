/**
 * LIVE smoke test — drives the AGENT-TO-AGENT ops flow with a REAL model
 * (Claude Haiku by default) instead of the deterministic script, to confirm a
 * real model reasons the resolver boundary itself: check_internal_capability →
 * authorize_external → query / escalate / apply, blocked without a grant, and
 * turning an over-cap change into a typed request to a human.
 *
 * Spends real tokens. Run Acme first, then:
 *   ANTHROPIC_API_KEY=... ACME_URL=http://localhost:3001 pnpm dlx tsx examples/smoke-live.ts
 */
import { anthropicProvider } from "@ail/agent-core";
import { runOpsChatA2A } from "../src/agent";
import { createTicket, getTicket, reset as resetTickets } from "../src/tickets";
import { forTicket, decideEscalation, reset as resetEsc, type TariffOption } from "../src/escalations";

const ACME = process.env.ACME_URL ?? "http://localhost:3001";
const CAP = 80;
const MODEL = process.env.SMOKE_MODEL ?? "claude-haiku-4-5";
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — this test needs a real key.");
  process.exit(2);
}
const provider = anthropicProvider({ model: MODEL });

const icon: Record<string, string> = {
  user: "🧑", agent: "🤖", tool: "🔧", mcp: "🔌", http: "🌐", policy: "🛑",
  assistant: "💬", boundary: "🚧", resolver: "🛂", reason: "🧠", hook: "⚙️", panel: "🔑",
};

async function resetAcme() {
  await fetch(`${ACME}/admin/api/reset`, { method: "POST", headers: { "x-admin-token": "demo-panel-token" } }).catch(() => {});
}
function newTicket() {
  return createTicket({
    subscriber: "Jordan Blake", line_id: "GLX-4471", operator_name: "Acme Telecom",
    operator_domain: ACME, request: "Upgrade my plan — I keep running out of data.",
  });
}

// One live turn: feed the running history, print the log, return the seen flags + reply.
async function turn(ticketId: string, message: string, history: { role: "user" | "assistant"; text: string }[]) {
  const seen = { gap: false, authorized: false, blocked: false, typedRequest: false, queried: false };
  let reply = "";
  console.log(`\n🧑 > ${message}`);
  await runOpsChatA2A({
    ticketId, message, history, provider,
    onLog: (e) => {
      console.log(`${icon[e.channel] ?? " "} [${e.channel}] ${e.text}`);
      if (e.channel === "boundary" && /gap check/.test(e.text)) seen.gap = true;
      if (e.channel === "resolver" && /authorized/.test(e.text)) seen.authorized = true;
      if (e.channel === "hook" && /BLOCKED/.test(e.text)) seen.blocked = true;
      if (e.channel === "boundary" && /typed request to a human/.test(e.text)) seen.typedRequest = true;
      if (e.channel === "http" && /queried/.test(e.text)) seen.queried = true;
      if (e.channel === "assistant") reply = e.text;
    },
  });
  history.push({ role: "user", text: message }, { role: "assistant", text: reply });
  return seen;
}

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => { console.log(`\n${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`); if (!ok) fails++; };

console.log(`\n╔══ LIVE smoke (model: ${MODEL}) ══╗`);

// ── WITHIN CAP ──────────────────────────────────────────────────────────────
await resetAcme(); resetTickets(); resetEsc();
const t1 = newTicket();
const h1: { role: "user" | "assistant"; text: string }[] = [];
const a = await turn(t1.id, "Which tariffs can this line move up to?", h1);
await turn(t1.id, "Escalate this to a manager for approval.", h1);
const e1 = forTicket(t1.id);
const cheap = (e1?.options as TariffOption[] ?? []).find((o) => o.price_usd <= CAP);
console.log(`\n   [manager approves ${cheap?.name} $${cheap?.price_usd}, within $${CAP}]`);
decideEscalation(e1!.id, "approve", cheap?.id);
await turn(t1.id, "The manager approved. Apply the upgrade.", h1);
const d1 = getTicket(t1.id);
check("live model: gap-check + resolver grant seen, within-cap change applied", a.gap && a.authorized && d1?.status === "done", `gap=${a.gap} grant=${a.authorized} status=${d1?.status}`);

// ── OVER CAP ────────────────────────────────────────────────────────────────
await resetAcme(); resetTickets(); resetEsc();
const t2 = newTicket();
const h2: { role: "user" | "assistant"; text: string }[] = [];
await turn(t2.id, "Which tariffs can this line move up to?", h2);
await turn(t2.id, "Escalate this to a manager for approval.", h2);
const e2 = forTicket(t2.id);
const pricey = (e2?.options as TariffOption[] ?? []).find((o) => o.price_usd > CAP);
console.log(`\n   [manager approves ${pricey?.name} $${pricey?.price_usd}, OVER $${CAP}]`);
decideEscalation(e2!.id, "approve", pricey?.id);
const b = await turn(t2.id, "The manager approved. Apply the upgrade.", h2);
const d2 = getTicket(t2.id);
check("live model: over-cap change refused, raised as a typed request to a human", b.typedRequest && d2?.status !== "done", `typedRequest=${b.typedRequest} status=${d2?.status}`);

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
