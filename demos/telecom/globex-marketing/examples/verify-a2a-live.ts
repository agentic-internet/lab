/**
 * End-to-end, against a running Acme (port 3001), of the AGENT-TO-AGENT ops flow
 * WITH the resolver in the path. Deterministic mode (no LLM). Covers:
 *   1) within the spend cap → gap check + grant + call_external → change applied
 *   2) over the spend cap    → resolver's limit → "no" → typed request to a human
 *   3) skip authorization     → blocked at the boundary (no grant, no call)
 *
 * Run Acme first, then: ACME_URL=http://localhost:3001 pnpm dlx tsx examples/verify-a2a-live.ts
 */
import { scriptedProvider } from "@ail/agent-core";
import { runOpsChatA2A } from "../src/agent";
import { createTicket, getTicket, reset as resetTickets } from "../src/tickets";
import { forTicket, decideEscalation, reset as resetEsc, type TariffOption } from "../src/escalations";

const ACME = process.env.ACME_URL ?? "http://localhost:3001";
const CAP = 50; // must match the resolver's max_price_usd for Acme

const icon: Record<string, string> = {
  user: "🧑", agent: "🤖", tool: "🔧", mcp: "🔌", http: "🌐", policy: "🛑",
  assistant: "💬", boundary: "🚧", resolver: "🛂", reason: "🧠", hook: "⚙️", panel: "🔑",
};
const show = (e: { channel: string; text: string }) => console.log(`${icon[e.channel] ?? " "} [${e.channel}] ${e.text}`);

async function resetAcme() {
  await fetch(`${ACME}/admin/api/reset`, { method: "POST", headers: { "x-admin-token": "demo-panel-token" } }).catch(() => {});
}

function newTicket() {
  return createTicket({
    subscriber: "Jordan Blake",
    line_id: "GLX-4471",
    operator_name: "Acme Telecom",
    operator_domain: ACME,
    request: "Upgrade my plan — I keep running out of data.",
  });
}

let fails = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`\n${ok ? "PASS" : "FAIL"}: ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fails++;
};

// ── 1) WITHIN CAP: change goes through agent-to-agent ────────────────────────
await resetAcme();
resetTickets();
resetEsc();
const t1 = newTicket();
console.log("── 1) WITHIN CAP ── ask options");
await runOpsChatA2A({ ticketId: t1.id, message: "which tariffs are available?", onLog: show });
console.log("\n   escalate");
await runOpsChatA2A({ ticketId: t1.id, message: "escalate this to a manager", onLog: show });
const e1 = forTicket(t1.id);
const cheap = (e1?.options as TariffOption[] ?? []).find((o) => o.price_usd <= CAP);
console.log(`\n   MANAGER approves ${cheap?.name} ($${cheap?.price_usd}, within $${CAP})`);
decideEscalation(e1!.id, "approve", cheap?.id);
console.log("   apply");
await runOpsChatA2A({ ticketId: t1.id, message: "apply the upgrade", onLog: show });
const d1 = getTicket(t1.id);
check("within-cap change is applied agent-to-agent", d1?.status === "done", d1?.resolution ?? "");

// ── 2) OVER CAP: resolver's limit turns it into a request to a human ─────────
await resetAcme();
resetTickets();
resetEsc();
const t2 = newTicket();
console.log("\n── 2) OVER CAP ── ask options");
await runOpsChatA2A({ ticketId: t2.id, message: "which tariffs are available?", onLog: show });
console.log("\n   escalate");
await runOpsChatA2A({ ticketId: t2.id, message: "escalate this to a manager", onLog: show });
const e2 = forTicket(t2.id);
const pricey = (e2?.options as TariffOption[] ?? []).find((o) => o.price_usd > CAP);
console.log(`\n   MANAGER approves ${pricey?.name} ($${pricey?.price_usd}, OVER $${CAP})`);
decideEscalation(e2!.id, "approve", pricey?.id);
console.log("   apply (expect a typed request to a human, not a change)");
let typedRequest = false;
await runOpsChatA2A({
  ticketId: t2.id,
  message: "apply the upgrade",
  onLog: (e) => {
    show(e);
    if (e.channel === "boundary" && /typed request to a human/.test(e.text)) typedRequest = true;
  },
});
const d2 = getTicket(t2.id);
check("over-cap change is NOT applied and raises a typed request to a human", typedRequest && d2?.status !== "done", `status=${d2?.status}, typedRequest=${typedRequest}`);

// ── 3) SKIP AUTH: reaching out with no grant is blocked at the boundary ──────
await resetAcme();
resetTickets();
resetEsc();
const t3 = newTicket();
console.log("\n── 3) SKIP AUTH ── reach out with no grant");
let blocked = false;
let fetched = false;
const skipAuth = scriptedProvider("skip-auth", (ctx) => {
  const calls = ctx.messages.filter((m) => m.role === "tool").length;
  if (calls === 0) return { toolCall: { tool: "query_available_tariffs", args: {} } };
  return { text: "gave up — I was blocked." };
});
await runOpsChatA2A({
  ticketId: t3.id,
  message: "which tariffs are available?",
  provider: skipAuth,
  onLog: (e) => {
    show(e);
    if (e.channel === "hook" && /BLOCKED/.test(e.text)) blocked = true;
    if (e.channel === "http" && /queried/.test(e.text)) fetched = true;
  },
});
check("unauthorized reach is blocked (no grant, no call)", blocked && !fetched, `blocked=${blocked}, fetched=${fetched}`);

console.log(`\n${fails === 0 ? "ALL PASS" : `${fails} FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
