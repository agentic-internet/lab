import { runAgent, scriptedProvider, type ToolDef, type LLMProvider } from "@ail/agent-core";
import { discover, matchCapability, callCapability } from "@ail/capability-client";
import { connectGlobexMcp, mcpCallJson } from "@ail/mcp-servers";
import type { Capability } from "@ail/shared";
import { createTicket, getTicket, resolveTicket, type Ticket } from "./tickets";
import { createEscalation, forTicket } from "./escalations";

/**
 * Two phases, matching the design: a Globex employee can't change their own line.
 *   intake  — employee asks; the assistant finds the line (MCP) and opens a ticket.
 *   resolve — operations approves; the assistant works with the operator's agent.
 *
 * Both emit one unified stream of typed log entries — what the log panel shows.
 */

export type LogChannel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant" | "panel" | "boundary";
export interface LogEntry {
  channel: LogChannel;
  text: string;
  data?: unknown;
}
export type OnLog = (e: LogEntry) => void;

function agentEvents(onLog: OnLog) {
  return (e: import("@ail/agent-core").AgentEvent) => {
    if (e.type === "user") onLog({ channel: "user", text: e.text });
    if (e.type === "tool-call") onLog({ channel: "tool", text: `${e.tool}(${JSON.stringify(e.args)})` });
    if (e.type === "tool-result") onLog({ channel: "tool", text: `${e.tool} -> ${JSON.stringify(e.result)}`, data: e.result });
    if (e.type === "assistant") onLog({ channel: "assistant", text: e.text });
  };
}

/* ---------------------------------------------------------------- intake --- */

interface LinePlan {
  line_id: string;
  operator_name: string;
  operator_domain: string;
  current?: { tariff: string; data_gb?: number; mins?: number; price_usd?: number } | null;
}

/** Rough intent read for the deterministic script: is the user asking to act? */
function wantsUpgrade(text: string): boolean {
  return (
    /\b(upgrade|increase|bigger|more data|change|switch|raise|bump|yes|yeah|yep|sure|ok|okay|go ahead|proceed|do it|please)\b/i.test(text) ||
    /(yüksel|art[ıi]r|değiştir|evet|olur|tamam|yap)/i.test(text)
  );
}

export async function runIntake(opts: {
  subscriber: string;
  message: string;
  history?: { role: "user" | "assistant"; text: string }[];
  onLog: OnLog;
  provider?: LLMProvider;
}): Promise<Ticket | undefined> {
  const { subscriber, message, onLog } = opts;
  const mcp = await connectGlobexMcp();
  const s: { line?: LinePlan; ticket?: Ticket } = {};

  async function lookup(): Promise<LinePlan> {
    onLog({ channel: "mcp", text: `call lookup_line({"subscriber":"${subscriber}"})` });
    const rec = (await mcpCallJson(mcp, "lookup_line", { subscriber })) as LinePlan;
    onLog({ channel: "mcp", text: `response ${JSON.stringify(rec)}`, data: rec });
    s.line = rec;
    return rec;
  }

  const tools: ToolDef[] = [
    {
      name: "lookup_line",
      description:
        "Look up the employee's mobile line, operator, and current package (data, minutes, price). " +
        "Use this to answer questions about their current plan before doing anything.",
      input: { subscriber: { type: "string", required: true } },
      run: async () => lookup(),
    },
    {
      name: "open_ticket",
      description:
        "Log an upgrade request for operations to review. Only call this once the employee has " +
        "clearly asked to change/upgrade their plan. Employees cannot change the line themselves.",
      input: { request: { type: "string", required: true } },
      run: async (args) => {
        const line = s.line ?? (await lookup());
        s.ticket = createTicket({
          subscriber,
          line_id: line.line_id,
          operator_name: line.operator_name,
          operator_domain: line.operator_domain,
          request: String(args.request),
        });
        return { ticket_id: s.ticket.id, status: s.ticket.status };
      },
    },
  ];

  const provider = opts.provider ??
    scriptedProvider("deterministic", (ctx) => {
      const lastUser =
        [...ctx.messages].reverse().find((m) => m.role === "user")?.content ?? message;
      if (!s.line) return { toolCall: { tool: "lookup_line", args: { subscriber } } };
      if (wantsUpgrade(lastUser) && !s.ticket) {
        return { toolCall: { tool: "open_ticket", args: { request: lastUser } } };
      }
      if (s.ticket) {
        return {
          text: `Done — logged as ${s.ticket.id} for operations to review. You can't change the line yourself, but they'll take it from here.`,
        };
      }
      const c = s.line.current;
      const plan = c?.data_gb
        ? `${c.tariff} — ${c.data_gb} GB and ${c.mins} minutes for $${c.price_usd}/mo`
        : c?.tariff
          ? `${c.tariff}`
          : "your current plan";
      return {
        text: `You're on ${plan}, on line ${s.line.line_id} with ${s.line.operator_name}. Want me to request an upgrade for you?`,
      };
    });

  await runAgent({
    provider,
    history: opts.history,
    system:
      `You are Globex Marketing's internal assistant, helping the signed-in employee "${subscriber}" with their company mobile line. ` +
      `Use "${subscriber}" as the subscriber for lookups; never ask who they are. Keep replies short and natural. ` +
      "If they say their plan is insufficient or ask about their current plan, call lookup_line and tell them their current package (data, minutes) plainly, then ask whether they'd like an upgrade. " +
      "Only when they clearly ask to upgrade/increase/change the plan, call open_ticket to log a request for operations. Employees cannot change the line themselves. " +
      "You can answer basic questions directly without any tool.",
    tools,
    message,
    onEvent: agentEvents(onLog),
    maxSteps: 8,
  });

  await mcp.close();
  return s.ticket;
}

/* ------------------------------------------------ ops chat (agent→human) --- */

/**
 * The operations assistant for one ticket, in the AGENT→HUMAN world. It does NOT
 * touch the operator — it only helps a human: raise the change to a manager for
 * confirmation, and close the task once the operator has applied the change by
 * hand in the operator's business portal. Nothing here reaches outward.
 */
export async function runOpsChat(opts: {
  ticketId: string;
  message: string;
  history?: { role: "user" | "assistant"; text: string }[];
  onLog: OnLog;
  provider?: LLMProvider;
}): Promise<void> {
  const { ticketId, message, onLog } = opts;
  const ticket = getTicket(ticketId);
  if (!ticket) {
    onLog({ channel: "policy", text: `unknown ticket ${ticketId}` });
    return;
  }

  const tools: ToolDef[] = [
    {
      name: "escalate_to_manager",
      description:
        "Send this ticket to a manager for confirmation before any change is made. The manager " +
        "approves it in their queue. Use this first — operations cannot approve its own change.",
      input: { reason: { type: "string", required: true } },
      run: async (args) => {
        const e = createEscalation({ ticket_id: ticket.id, employee: ticket.subscriber, summary: ticket.request });
        onLog({ channel: "policy", text: `escalated to manager for confirmation — ${e.id} (${String(args.reason).slice(0, 60)})` });
        return { escalation_id: e.id, status: e.status };
      },
    },
    {
      name: "check_manager_decision",
      description: "Check whether the manager has approved the confirmation for this ticket.",
      input: {},
      run: async () => {
        const e = forTicket(ticket.id);
        onLog({ channel: "policy", text: `manager decision: ${e?.status ?? "none"}` });
        return { status: e?.status ?? "none" };
      },
    },
    {
      name: "close_task",
      description:
        "Close the ticket as done. Only after the manager approved AND the operator has applied the " +
        "change by hand in the operator's business portal. Refused if not yet approved.",
      input: {},
      run: async () => {
        const e = forTicket(ticket.id);
        if (!e || e.status !== "approved") {
          onLog({ channel: "policy", text: "cannot close — manager hasn't approved yet" });
          return { ok: false, reason: "not approved by manager" };
        }
        const done = resolveTicket(ticket.id, "Applied by hand in Acme's business portal (manager-approved).");
        onLog({ channel: "policy", text: `ticket ${ticket.id} closed` });
        return { ok: Boolean(done), status: "done" };
      },
    },
  ];

  const provider = opts.provider ??
    scriptedProvider("deterministic", (ctx) => {
      const last = [...ctx.messages].reverse().find((m) => m.role === "user")?.content ?? message;
      const current = getTicket(ticket.id);
      if (current?.status === "done") {
        return { text: `Ticket ${ticket.id} is closed — nothing more to do.` };
      }
      const esc = forTicket(ticket.id);
      const wantsClose = /\b(close|done|finished|complete|kapat|bitti|tamamla)\b/i.test(last);
      if (wantsClose) {
        if (esc?.status === "approved") return { toolCall: { tool: "close_task", args: {} } };
        return { text: "I can't close this yet — it needs the manager's approval first." };
      }
      if (!esc && /\b(escalate|manager|confirm|approve|onay|yönetici|yükselt)\b/i.test(last)) {
        return { toolCall: { tool: "escalate_to_manager", args: { reason: ticket.request } } };
      }
      if (!esc) {
        return {
          text: `This is ${ticket.subscriber}'s line on ${ticket.operator_name} — operations can't change it directly. Shall I escalate it to a manager for confirmation?`,
        };
      }
      if (esc.status === "approved") {
        return { text: "The manager approved. Apply the change by hand in Acme's business portal, then tell me to close the task." };
      }
      return { text: `Escalated to the manager (${esc.id}). Waiting on their approval before anything is changed.` };
    });

  const escNow = forTicket(ticket.id);
  const statusLine = escNow
    ? escNow.status === "approved"
      ? `CURRENT STATUS: this ticket was escalated (${escNow.id}) and the MANAGER HAS ALREADY APPROVED it. Do NOT escalate again. If the operator says the change is applied or asks to close, call close_task.`
      : `CURRENT STATUS: this ticket is already escalated (${escNow.id}) and is AWAITING the manager's approval. Do NOT escalate again, and you cannot close it yet.`
    : "CURRENT STATUS: not yet escalated. If the operator wants to proceed, call escalate_to_manager.";

  await runAgent({
    provider,
    history: opts.history,
    system:
      `You are Globex operations' assistant for ticket ${ticket.id}: ${ticket.subscriber}, line ${ticket.line_id} on ${ticket.operator_name}, request "${ticket.request}". ` +
      "You CANNOT change the operator's line yourself, and you must not contact the operator. The process is human-driven: " +
      "(1) escalate_to_manager for confirmation; (2) once the manager approves, the operator applies the change by hand in Acme's business portal; (3) close_task when the operator says it's done. " +
      "Trust the CURRENT STATUS below over any assumption — never re-escalate an already-escalated ticket, and if it is already approved you may close it when asked. Keep replies short and plain. " +
      statusLine,
    tools,
    message,
    onEvent: agentEvents(onLog),
    maxSteps: 6,
  });
}

/* --------------------------------------------------------------- resolve --- */

export type ResolveMode = "agent-to-agent" | "agent-to-human";

export async function runResolve(opts: {
  ticketId: string;
  mode?: ResolveMode;
  onLog: OnLog;
  provider?: LLMProvider;
}): Promise<Ticket | undefined> {
  const { ticketId, onLog } = opts;
  const mode: ResolveMode = opts.mode ?? "agent-to-agent";
  const ticket = getTicket(ticketId);
  if (!ticket) {
    onLog({ channel: "policy", text: `unknown ticket ${ticketId}` });
    return undefined;
  }

  if (mode === "agent-to-human") {
    return resolveViaAdminPanel(ticket, onLog);
  }

  // The outward-reaching skill needs Globex's own records to identify who is
  // responsible — the same MCP directory the intake used.
  const mcp = await connectGlobexMcp();
  const s: {
    domain?: string;
    agent_endpoint?: string;
    capabilities?: Capability[];
    options?: { id: string; name: string; price_usd: number }[];
    current?: { id: string; name: string; tier: number };
    reachedOut?: boolean;
    authNoted?: boolean;
    queried?: boolean;
    triedDowngrade?: boolean;
    upgraded?: boolean;
    to?: string;
  } = {};

  const tools: ToolDef[] = [
    {
      name: "lookup_line",
      description:
        "Look up a subscriber in Globex's own records: the line id, the mobile operator that serves it, and that operator's domain. Use this first to find who is responsible for the requested action.",
      input: { subscriber: { type: "string", required: true } },
      run: async (args) => {
        onLog({ channel: "mcp", text: `call lookup_line(${JSON.stringify(args)})` });
        const rec = (await mcpCallJson(mcp, "lookup_line", args)) as {
          line_id: string; operator_name: string; operator_domain: string;
        };
        onLog({ channel: "mcp", text: `response ${JSON.stringify(rec)}`, data: rec });
        s.domain = rec.operator_domain;
        // (b) — who to reach, resolved from data, not hardcoded
        onLog({
          channel: "boundary",
          text: `responsible party: ${rec.operator_name} (${rec.operator_domain}) — read from Globex's own line record, not hardcoded`,
        });
        return rec;
      },
    },
    {
      name: "discover_provider",
      description:
        "Given an external organization's domain, discover its published agent and the capabilities it offers (reads /robots.txt, then /.well-known/agent, then each capability). Use this to learn what an outside company can do before calling it.",
      input: { domain: { type: "string", required: true } },
      run: async (args) => {
        if (!s.reachedOut) {
          s.reachedOut = true;
          // (a) — the boundary: this work isn't Globex's to do internally
          onLog({
            channel: "boundary",
            text: `this action belongs to an external organization, not Globex — reaching its published agent instead of doing it internally`,
          });
        }
        const found = await discover(String(args.domain), {
          onEvent: (e) => {
            if (e.step === "fetch-robots") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "found-agent-path") onLog({ channel: "http", text: `Agent: ${e.agentUrl}` });
            if (e.step === "fetch-manifest") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "manifest") onLog({ channel: "http", text: `${e.manifest.organization.name}: ${e.manifest.capabilities.length} capabilities` });
            if (e.step === "fetch-capability") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "capability") onLog({ channel: "http", text: `${e.capability.id} (costs_money=${e.capability.terms.costs_money}, reversible=${e.capability.terms.reversible})` });
          },
        });
        s.agent_endpoint = found.manifest.agent_endpoint;
        s.capabilities = found.capabilities;
        // Hand the model the discovered contracts so it can choose and call them.
        return {
          agent_endpoint: s.agent_endpoint,
          capabilities: found.capabilities.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            outcome: c.semantics.outcome,
            input: c.input,
            terms: c.terms,
          })),
        };
      },
    },
    {
      name: "call_capability",
      description:
        "Call one of the capabilities you discovered on the external organization's agent. Pass the capability's exact id and the input object it declares. The organization enforces its own terms — for example it refuses a downgrade — so respect the outcome it returns.",
      input: {
        capability_id: { type: "string", required: true, description: "The exact id returned by discover_provider." },
        input: { type: "object", required: true, description: "The input the capability declares, e.g. { line_id, target_tariff_id }." },
      },
      run: async (args) => {
        const capId = String(args.capability_id);
        const input = (args.input ?? {}) as Record<string, unknown>;
        if (!s.authNoted) {
          s.authNoted = true;
          // Reading /.well-known needs no trust; ACTING on the other side does. We
          // don't solve that here — we assume it, and say so out loud. Brainstorm,
          // not a claim: a provider-issued certificate (API-key-like), the way one
          // issuer vouches at scale for Apple's push service — except each provider
          // is the issuer for its own partners. Strangers with no such certificate
          // stay the hard, open part.
          onLog({
            channel: "boundary",
            text: "auth: assumed — Globex presents a certificate Acme issued it out-of-band; Acme trusts its own certificate. Stubbed here. How a provider vouches for a partner's agent (and how parties with no such certificate establish trust) is an open question, not a claim.",
          });
        }
        const res = await callCapability(s.agent_endpoint!, capId, input, {
          onEvent: (e) => { if (e.step === "note") onLog({ channel: "http", text: e.message }); },
        });
        const body = res.body as { tariffs?: typeof s.options; current?: typeof s.current; reason?: string };
        if (res.status === 409) onLog({ channel: "policy", text: `refused: ${body.reason ?? "not allowed"}` });
        if (body.tariffs) s.options = body.tariffs;
        if (body.current) s.current = body.current;
        return { status: res.status, ...(res.body as object) };
      },
    },
  ];

  // Deterministic mode mirrors the same skill with no LLM: identify → discover →
  // (query) → try a downgrade (refused) → upgrade. Capability ids come from what
  // was discovered (matchCapability), never hardcoded.
  const provider = opts.provider ??
    scriptedProvider("deterministic", () => {
      if (!s.domain) return { toolCall: { tool: "lookup_line", args: { subscriber: ticket.subscriber } } };
      if (!s.capabilities) return { toolCall: { tool: "discover_provider", args: { domain: s.domain } } };
      const queryCap = matchCapability(s.capabilities, { outcome: "tariff-options" })[0];
      const changeCap = matchCapability(s.capabilities, { outcome: "tariff-change" })[0];
      if (!s.queried && queryCap) {
        s.queried = true;
        return { toolCall: { tool: "call_capability", args: { capability_id: queryCap.id, input: { line_id: ticket.line_id } } } };
      }
      // Force one downgrade attempt to surface the operator's guardrail. The lower
      // tariff (one tier below current) is always in the visible window, so it exists
      // and gets refused. Demo scaffolding — a real model wouldn't try this.
      const lowerId = s.current ? `PKC-${String(s.current.tier - 1).padStart(2, "0")}` : undefined;
      if (!s.triedDowngrade && changeCap && lowerId) {
        s.triedDowngrade = true;
        return { toolCall: { tool: "call_capability", args: { capability_id: changeCap.id, input: { line_id: ticket.line_id, target_tariff_id: lowerId } } } };
      }
      if (!s.upgraded && changeCap && s.options?.length) {
        s.upgraded = true;
        const pick = s.options.at(-1)!;
        s.to = pick.name;
        return { toolCall: { tool: "call_capability", args: { capability_id: changeCap.id, input: { line_id: ticket.line_id, target_tariff_id: pick.id } } } };
      }
      return { text: `Approved and done. ${ticket.line_id} moved to ${s.to ?? "a higher tariff"} on ${ticket.operator_name}.` };
    });

  const reply = await runAgent({
    provider,
    system:
      "You are Globex Marketing's operations agent, resolving one internal ticket. " +
      "Globex keeps its own records but CANNOT perform actions that belong to another organization — " +
      "changing a mobile line's tariff is the operator's action, not Globex's. When a ticket needs such an action, follow this skill: " +
      "(1) identify the responsible external organization from Globex's records with lookup_line — never assume who it is, read it from the record; " +
      "(2) discover that organization's published agent and capabilities at its domain with discover_provider; " +
      "(3) read the discovered capabilities and their terms, pick the one that matches the request, and call it with call_capability using its exact id. " +
      "Never hardcode a provider or a capability id. Upgrades only — if you attempt a downgrade the operator will refuse it, and that is their rule to enforce. Finish by stating the outcome.",
    tools,
    message: `Resolve ticket ${ticket.id}. Subscriber: ${ticket.subscriber}. Line: ${ticket.line_id}. Request: "${ticket.request}".`,
    onEvent: agentEvents(onLog),
    maxSteps: 12,
  });

  await mcp.close();
  return resolveTicket(ticket.id, reply);
}

/* ------------------------------------------------ agent-to-human (Demo A) --- */

/**
 * Today's path. There is no published agent to talk to, so operations goes into
 * the operator's OWN admin panel. That only works because Acme handed Globex a
 * token and an engineer hardcoded Acme's private admin API. No discovery — just
 * bespoke, brittle, pre-arranged knowledge of one operator's internal panel.
 */
const ACME_ADMIN_TOKEN = "demo-panel-token"; // shared out-of-band, per partner

async function resolveViaAdminPanel(ticket: Ticket, onLog: OnLog): Promise<Ticket | undefined> {
  onLog({ channel: "user", text: `Resolve ticket ${ticket.id}: ${ticket.request}` });
  onLog({
    channel: "panel",
    text: "no published agent — operations opens the operator's admin panel by hand",
  });

  const base = ticket.operator_domain;
  // A human "logs in" to Acme's panel — a separate account, a shared secret.
  onLog({ channel: "panel", text: `open ${base}/admin (login as pre-arranged partner)` });

  // The human reads the panel's own line list to see the current plan and the
  // options — no discovery, just a hardcoded private endpoint they were told about.
  onLog({ channel: "panel", text: `GET ${base}/admin/api/lines (hardcoded private endpoint)` });
  type PanelTariff = { id: string; name: string; tier: number };
  const view = (await fetch(`${base}/admin/api/lines`).then((r) => r.json()).catch(() => ({}))) as {
    lines?: { line_id: string; tariff_id: string }[];
    tariffs?: PanelTariff[];
  };
  const line = (view.lines ?? []).find((l) => l.line_id === ticket.line_id);
  const tariffs = view.tariffs ?? [];
  const currentTier = tariffs.find((t) => t.id === line?.tariff_id)?.tier ?? 0;
  const target = tariffs.filter((t) => t.tier > currentTier).sort((a, b) => a.tier - b.tier)[0];

  if (!target) {
    const reply = "No higher tariff visible in Acme's panel.";
    onLog({ channel: "policy", text: reply });
    onLog({ channel: "assistant", text: reply });
    return resolveTicket(ticket.id, reply);
  }

  onLog({ channel: "panel", text: `POST ${base}/admin/api/change → ${target.id} (hardcoded endpoint + token)` });
  const res = await fetch(`${base}/admin/api/change`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": ACME_ADMIN_TOKEN },
    body: JSON.stringify({ line_id: ticket.line_id, target_tariff_id: target.id }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; to?: string; reason?: string };
  onLog({ channel: "panel", text: `${res.status} ${JSON.stringify(body)}` });

  onLog({
    channel: "policy",
    text: "if Acme changes its panel, renames the endpoint, or rotates the token, this breaks",
  });

  const reply = body.ok
    ? `Done via Acme's admin panel. ${ticket.line_id} → ${body.to}.`
    : `Failed in Acme's admin panel: ${body.reason ?? res.status}`;
  onLog({ channel: "assistant", text: reply });
  return resolveTicket(ticket.id, reply);
}
