import { runAgent, scriptedProvider, type ToolDef, type LLMProvider } from "@ail/agent-core";
import { discover, matchCapability, callCapability, callExternal, isRefused } from "@ail/capability-client";
import { connectGlobexMcp, connectGlobexResolver, mcpCallJson } from "@ail/mcp-servers";
import { resolverSecret, verifyGrant, type Capability, type Grant } from "@ail/shared";
import { createTicket, getTicket, resolveTicket, type Ticket } from "./tickets";
import { createEscalation, forTicket, type TariffOption } from "./escalations";

/**
 * Two phases, matching the design: a Globex employee can't change their own line.
 *   intake  — employee asks; the assistant finds the line (MCP) and opens a ticket.
 *   resolve — operations approves; the assistant works with the operator's agent.
 *
 * Both emit one unified stream of typed log entries — what the log panel shows.
 */

export type LogChannel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant" | "panel" | "boundary" | "reason" | "hook" | "resolver";
export interface LogEntry {
  channel: LogChannel;
  text: string;
  data?: unknown;
}
export type OnLog = (e: LogEntry) => void;

function agentEvents(onLog: OnLog) {
  return (e: import("@ail/agent-core").AgentEvent) => {
    if (e.type === "user") onLog({ channel: "user", text: e.text });
    if (e.type === "reasoning") onLog({ channel: "reason", text: e.text });
    if (e.type === "pre-tool")
      onLog({
        channel: "hook",
        text: `pre-tool-use: ${e.tool}(${JSON.stringify(e.args)}) — ${e.allowed ? "allowed" : "BLOCKED: " + (e.reason ?? "policy")}`,
        data: { tool: e.tool, args: e.args, allowed: e.allowed, reason: e.reason },
      });
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

  const mcp = await connectGlobexMcp();
  const s: { line?: LinePlan } = {};

  const tools: ToolDef[] = [
    {
      name: "lookup_line",
      description:
        "Look up the employee's line, operator, and current package (data, minutes, price). " +
        "Use this to answer questions about their current plan.",
      input: {},
      run: async () => {
        onLog({ channel: "mcp", text: `call lookup_line({"subscriber":"${ticket.subscriber}"})` });
        const rec = (await mcpCallJson(mcp, "lookup_line", { subscriber: ticket.subscriber })) as LinePlan;
        onLog({ channel: "mcp", text: `response ${JSON.stringify(rec)}`, data: rec });
        s.line = rec;
        return rec;
      },
    },
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
      const wantsInfo = /\b(package|plan|tariff|paket|current|data|minute|dakika|how much|ne kadar|hangi)\b/i.test(last);
      if (wantsInfo) {
        if (!s.line) return { toolCall: { tool: "lookup_line", args: {} } };
        const c = s.line.current;
        const plan = c?.data_gb
          ? `${c.tariff} — ${c.data_gb} GB and ${c.mins} minutes for $${c.price_usd}/mo`
          : c?.tariff ?? "their current plan";
        const tail = esc
          ? esc.status === "approved"
            ? " The manager has approved the upgrade."
            : " It's escalated and awaiting the manager's approval."
          : " Shall I escalate the upgrade to a manager?";
        return { text: `${ticket.subscriber} is on ${plan}, line ${ticket.line_id}.${tail}` };
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
    preToolUse: (tool) => {
      if (tool === "close_task") {
        const e = forTicket(ticket.id);
        if (!e || e.status !== "approved") return { allow: false, reason: "manager approval required before closing" };
        return { allow: true, reason: "manager-approved" };
      }
    },
    system:
      `You are Globex operations' assistant for ticket ${ticket.id}: ${ticket.subscriber}, line ${ticket.line_id} on ${ticket.operator_name}, request "${ticket.request}". ` +
      "You CANNOT change the operator's line yourself, and you must not contact the operator. The process is human-driven: " +
      "(1) escalate_to_manager for confirmation; (2) once the manager approves, the operator applies the change by hand in Acme's business portal; (3) close_task when the operator says it's done. " +
      "If asked about the employee's current package/plan, call lookup_line and answer plainly (data, minutes, price). " +
      "Trust the CURRENT STATUS below over any assumption — never re-escalate an already-escalated ticket, and if it is already approved you may close it when asked. Keep replies short and plain. " +
      statusLine,
    tools,
    message,
    onEvent: agentEvents(onLog),
    maxSteps: 6,
  });

  await mcp.close();
}

/* ---------------------------------------------- ops chat (agent→agent) --- */

/**
 * The operations assistant for the AGENT→AGENT flow. Same human gate (manager
 * approval), but the operator's own agent is reached for everything: it fetches
 * the available tariffs from the operator, escalates to a manager WITH those
 * options, and — once approved with a chosen tariff — performs the change
 * agent-to-agent. Every hop is logged with its request/response.
 */
export async function runOpsChatA2A(opts: {
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

  // Globex's own MCPs: the internal directory (gap detection reads its tools) and
  // the private policy resolver (the governed permission to reach outside).
  const dirMcp = await connectGlobexMcp();
  const resolverMcp = await connectGlobexResolver();

  const s: { options?: TariffOption[]; endpoint?: string; caps?: Capability[]; grant?: Grant; gapChecked?: boolean } = {};

  // Action verbs that describe the OUTWARD action, matched against Globex's own
  // tool descriptions. If none of Globex's tools speak to changing a tariff, the
  // work is external — the boundary recognised by not finding itself capable,
  // not by a sentence we wrote into the prompt.
  const NEED_VERBS = ["change a line", "change a tariff", "upgrade a plan", "switch the tariff", "modify a subscription"];

  // (1) Inward gap detection, as a step the AGENT takes: ask Globex's OWN tools
  // what they can do. If none changes a tariff, the work is external — the
  // boundary recognised by not finding itself capable, not by a prompt sentence.
  const gapCheck = async (): Promise<{ internal_tools: string[]; matches: string[]; verdict: "internal" | "external" }> => {
    s.gapChecked = true;
    const listed = await dirMcp.listTools();
    const names = listed.tools.map((t) => t.name);
    const matches = listed.tools
      .filter((t) => {
        const hay = `${t.name} ${t.description ?? ""}`.toLowerCase();
        return NEED_VERBS.some((v) => hay.includes(v));
      })
      .map((t) => t.name);
    onLog({
      channel: "boundary",
      text:
        `gap check — Globex's own capabilities [${names.join(", ")}]: ` +
        (matches.length
          ? `handled internally by ${matches.join(", ")}`
          : `none performs "change a tariff", so this belongs to an external organization`),
      data: { internal_tools: names, matches, need: "tariff-change" },
    });
    return { internal_tools: names, matches, verdict: matches.length ? "internal" : "external" };
  };

  // (2) The governed permission, as a step the AGENT takes: ask Globex's OWN
  // resolver (not the open Internet). On yes it stashes a scoped, short-lived
  // grant the agent cannot mint itself; on no, "no" is a request to a human.
  const requestAuthorization = async (
    outcome: string,
  ): Promise<
    | { allowed: true; grant_id: string; scopes: string[]; expires_in_s: number; limits?: Record<string, number> }
    | { allowed: false; reason: string }
  > => {
    onLog({
      channel: "resolver",
      text: `asking Globex's policy resolver: am I cleared to reach ${ticket.operator_name} for "${outcome}"?`,
      data: { partner_domain: ticket.operator_domain, outcome },
    });
    const dec = (await mcpCallJson(resolverMcp, "authorize_external", {
      partner_domain: ticket.operator_domain,
      outcome,
    })) as {
      allowed: boolean;
      reason?: string;
      partner_name?: string;
      scopes?: string[];
      limits?: Record<string, number>;
      grant?: Grant;
    };
    if (!dec.allowed || !dec.grant) {
      onLog({
        channel: "resolver",
        text: `resolver DENIED — ${dec.reason ?? "not permitted"} → this becomes a request to a human, not an error`,
        data: dec,
      });
      return { allowed: false, reason: dec.reason ?? "not permitted by Globex policy" };
    }
    s.grant = dec.grant;
    const ttl = Math.max(0, Math.round((dec.grant.expires_at - Date.now()) / 1000));
    onLog({
      channel: "resolver",
      text:
        `resolver authorized — ${dec.partner_name}, scopes [${(dec.scopes ?? []).join(", ")}]` +
        `${dec.limits ? `, limits ${JSON.stringify(dec.limits)}` : ""}; grant ${dec.grant.id} (expires in ${ttl}s). ` +
        `The outward call carries this grant and is refused without it.`,
      data: dec,
    });
    return { allowed: true, grant_id: dec.grant.id, scopes: dec.scopes ?? [], expires_in_s: ttl, limits: dec.limits };
  };

  // Discover the operator's agent from its domain — the real robots→well-known→
  // capabilities walk, each step logged as an outward (different-org) hop.
  const discoverOperator = async (): Promise<{ endpoint: string; caps: Capability[] }> => {
    if (s.endpoint && s.caps) return { endpoint: s.endpoint, caps: s.caps };
    onLog({ channel: "boundary", text: `this belongs to ${ticket.operator_name} — reaching its published agent (agent-to-agent)` });
    const found = await discover(ticket.operator_domain, {
      onEvent: (e) => {
        if (e.step === "fetch-robots") onLog({ channel: "http", text: `GET ${e.url}`, data: { request: e.url } });
        if (e.step === "found-agent-path") onLog({ channel: "http", text: `Agent: ${e.agentUrl}`, data: { agentUrl: e.agentUrl } });
        if (e.step === "fetch-manifest") onLog({ channel: "http", text: `GET ${e.url}`, data: { request: e.url } });
        if (e.step === "manifest") onLog({ channel: "http", text: `${e.manifest.organization.name}: ${e.manifest.capabilities.length} capabilities`, data: e.manifest });
        if (e.step === "fetch-capability") onLog({ channel: "http", text: `GET ${e.url}`, data: { request: e.url } });
        if (e.step === "capability") onLog({ channel: "http", text: `capability ${e.capability.id} (costs_money=${e.capability.terms.costs_money}, reversible=${e.capability.terms.reversible})`, data: e.capability });
      },
    });
    s.endpoint = found.manifest.agent_endpoint ?? "";
    s.caps = found.capabilities;
    onLog({
      channel: "agent",
      text: `understood ${ticket.operator_name}'s agent — ${s.caps.length} capabilities: ${s.caps.map((c) => `${c.id} (${c.semantics.outcome})`).join(", ")}`,
      data: s.caps.map((c) => ({ id: c.id, outcome: c.semantics.outcome, verbs: c.semantics.verbs, aliases: c.semantics.aliases, input: c.input, terms: c.terms })),
    });
    return { endpoint: s.endpoint, caps: s.caps };
  };

  const fetchOptions = async (): Promise<TariffOption[]> => {
    const { endpoint, caps } = await discoverOperator();
    const cap = matchCapability(caps, { outcome: "tariff-options" })[0];
    if (!cap) return [];
    onLog({
      channel: "agent",
      text: `matched need "available tariffs" → ${cap.id} by meaning (its own local name, no shared vocabulary)`,
      data: { need: "tariff-options", matched: cap.id, semantics: cap.semantics },
    });
    const res = await callExternal(
      s.grant,
      { partner_domain: ticket.operator_domain, agentEndpoint: endpoint, capabilityId: cap.id, outcome: cap.semantics.outcome },
      { line_id: ticket.line_id },
      { secret: resolverSecret(), onEvent: (e) => { if (e.step === "note") onLog({ channel: "http", text: e.message }); } },
    );
    if (isRefused(res)) {
      onLog({ channel: "resolver", text: `call_external refused: ${res.reason}`, data: res });
      return [];
    }
    const tariffs = ((res.body as { tariffs?: TariffOption[] }).tariffs ?? []) as TariffOption[];
    onLog({
      channel: "http",
      text: `queried ${cap.id} → ${tariffs.map((t) => t.name).join(", ") || "none"}`,
      data: { request: { capability: cap.id, input: { line_id: ticket.line_id } }, response: res.body },
    });
    s.options = tariffs;
    return tariffs;
  };

  const tools: ToolDef[] = [
    {
      name: "check_internal_capability",
      description:
        "FIRST STEP before any outward reach. Check whether Globex can perform the requested action " +
        "with its OWN tools. Returns Globex's internal capabilities and whether any of them changes a " +
        "tariff. If nothing internal fits (verdict 'external'), the action belongs to another " +
        "organization and you must get authorization before reaching out.",
      input: {},
      run: async () => gapCheck(),
    },
    {
      name: "authorize_external",
      description:
        "Ask Globex's OWN policy resolver for permission to reach the operator for an outcome — " +
        "'tariff-options' to read plans, 'tariff-change' to change one. Returns a scoped, short-lived " +
        "grant if Globex permits it, or a denial (which you take to a human, not treat as an error). " +
        "You cannot reach the operator without a grant, so call this after confirming the action is " +
        "external and before query_available_tariffs or apply_change.",
      input: { outcome: { type: "string", required: true, description: "tariff-options or tariff-change" } },
      run: async (args) => requestAuthorization(String(args.outcome || "tariff-change")),
    },
    {
      name: "query_available_tariffs",
      description:
        "Ask the operator's agent (agent-to-agent) which tariffs this line can move up to. Use to " +
        "answer 'what options are available?'. Requires a grant from authorize_external. Returns the options.",
      input: {},
      run: async () => ({ tariffs: await fetchOptions() }),
    },
    {
      name: "escalate_to_manager",
      description:
        "Send this upgrade to a manager for approval, WITH the available tariff options (fetched " +
        "from the operator) for the manager to choose from. Operations cannot approve its own change.",
      input: {},
      run: async () => {
        const options = s.options ?? (await fetchOptions());
        const e = createEscalation({ ticket_id: ticket.id, employee: ticket.subscriber, summary: ticket.request, options });
        onLog({ channel: "policy", text: `escalated to manager with ${options.length} options — ${e.id}`, data: { escalation: e.id, options } });
        return { escalation_id: e.id, status: e.status, options };
      },
    },
    {
      name: "check_manager_decision",
      description: "Check the manager's decision and chosen tariff for this ticket.",
      input: {},
      run: async () => {
        const e = forTicket(ticket.id);
        onLog({ channel: "policy", text: `manager: ${e?.status ?? "none"}${e?.chosen_tariff_id ? " → " + e.chosen_tariff_id : ""}` });
        return { status: e?.status ?? "none", chosen_tariff_id: e?.chosen_tariff_id };
      },
    },
    {
      name: "apply_change",
      description:
        "After the manager approved and chose a tariff, perform the change on the operator's agent " +
        "(agent-to-agent) and close the ticket. Refused unless approved.",
      input: {},
      run: async () => {
        const e = forTicket(ticket.id);
        if (!e || e.status !== "approved") {
          onLog({ channel: "policy", text: "cannot apply — the manager hasn't approved" });
          return { ok: false, reason: "not approved" };
        }
        const target = e.chosen_tariff_id;
        if (!target) {
          onLog({ channel: "policy", text: "cannot apply — the manager approved but chose no tariff" });
          return { ok: false, reason: "no chosen tariff" };
        }
        const { endpoint, caps } = await discoverOperator();
        const cap = matchCapability(caps, { outcome: "tariff-change" })[0];
        if (!cap) return { ok: false, reason: "operator offers no change capability" };
        onLog({
          channel: "agent",
          text: `matched need "change tariff" → ${cap.id} by meaning; its terms say costs_money=${cap.terms.costs_money}, reversible=${cap.terms.reversible}`,
          data: { need: "tariff-change", matched: cap.id, semantics: cap.semantics, terms: cap.terms },
        });
        const res = await callExternal(
          s.grant,
          { partner_domain: ticket.operator_domain, agentEndpoint: endpoint, capabilityId: cap.id, outcome: cap.semantics.outcome },
          { line_id: ticket.line_id, target_tariff_id: target },
          { secret: resolverSecret(), onEvent: (ev) => { if (ev.step === "note") onLog({ channel: "http", text: ev.message }); } },
        );
        if (isRefused(res)) {
          onLog({ channel: "resolver", text: `call_external refused: ${res.reason}`, data: res });
          return { ok: false, reason: res.reason };
        }
        const body = res.body as { ok?: boolean; to?: string; reason?: string };
        onLog({
          channel: "http",
          text: `change ${cap.id} → ${res.status} ${JSON.stringify(res.body)}`,
          data: { request: { capability: cap.id, input: { line_id: ticket.line_id, target_tariff_id: target } }, response: res.body },
        });
        if (!body.ok) {
          if (res.status === 409) onLog({ channel: "policy", text: `refused: ${body.reason}` });
          return { ok: false, status: res.status, ...(res.body as object) };
        }
        resolveTicket(ticket.id, `Upgraded to ${body.to} agent-to-agent (manager-approved).`);
        onLog({ channel: "policy", text: `ticket ${ticket.id} closed — now on ${body.to}` });
        return { ok: true, to: body.to, status: "done" };
      },
    },
  ];

  const provider = opts.provider ??
    scriptedProvider("deterministic", (ctx) => {
      const last = [...ctx.messages].reverse().find((m) => m.role === "user")?.content ?? message;
      const current = getTicket(ticket.id);
      if (current?.status === "done") return { text: `Ticket ${ticket.id} is closed — the change is applied.` };
      const esc = forTicket(ticket.id);
      const wantsApply = /\b(upgrade|apply|proceed|do it|change it|make the change|yükselt|uygula|geçir)\b/i.test(last);
      const wantsEscalate = /\b(escalate|manager|confirm|approval|onay|yönetici)\b/i.test(last);
      const wantsOptions = /\b(tariff|available|option|package|plan|paket|hangi|which|current)\b/i.test(last);
      const reachingOut = wantsApply || wantsEscalate || wantsOptions;
      const grantValid = !!s.grant && s.grant.expires_at > Date.now() + 5000;

      // Agent-driven boundary: confirm it's external, then get a grant, before reaching out.
      if (reachingOut && !s.gapChecked) return { toolCall: { tool: "check_internal_capability", args: {} } };
      if (reachingOut && !grantValid)
        return { toolCall: { tool: "authorize_external", args: { outcome: wantsApply ? "tariff-change" : "tariff-options" } } };

      if (wantsApply && esc?.status === "approved") return { toolCall: { tool: "apply_change", args: {} } };
      if (wantsEscalate && !esc) return { toolCall: { tool: "escalate_to_manager", args: {} } };
      if (wantsOptions && !s.options) return { toolCall: { tool: "query_available_tariffs", args: {} } };
      if (wantsOptions && s.options) {
        const opts2 = s.options.map((o) => `${o.name} (${o.data_gb}GB/${o.mins}m, $${o.price_usd})`).join(", ");
        const tail = esc
          ? esc.status === "approved"
            ? ` The manager approved ${esc.chosen_tariff_id} — say "apply the upgrade" and I'll make the change.`
            : esc.status === "rejected"
              ? " The manager rejected this."
              : " Escalated, awaiting the manager's choice."
          : " Shall I escalate these to a manager for approval?";
        return { text: `Options for ${ticket.line_id}: ${opts2}.${tail}` };
      }
      if (!esc) return { text: `This needs ${ticket.operator_name}. Ask "which tariffs are available?" and I'll fetch them agent-to-agent, or say "escalate to a manager".` };
      if (esc.status === "approved") return { text: `The manager approved ${esc.chosen_tariff_id}. Say "apply the upgrade" and I'll make the change agent-to-agent.` };
      if (esc.status === "rejected") return { text: "The manager rejected this request — nothing will change." };
      return { text: `Escalated with options (${esc.id}). Waiting on the manager's decision.` };
    });

  const escNow = forTicket(ticket.id);
  const statusLine = !escNow
    ? "CURRENT STATUS: not yet escalated. Fetch options from the operator, then escalate to a manager with them."
    : escNow.status === "approved"
      ? `CURRENT STATUS: the manager APPROVED and chose tariff ${escNow.chosen_tariff_id}. On the operator's go-ahead, call apply_change to perform it agent-to-agent (this closes the ticket). Do not escalate again.`
      : escNow.status === "rejected"
        ? "CURRENT STATUS: the manager REJECTED this. Do not change anything."
        : `CURRENT STATUS: escalated (${escNow.id}), awaiting the manager's decision. Do not apply changes yet; do not escalate again.`;

  await runAgent({
    provider,
    history: opts.history,
    preToolUse: (tool) => {
      // Any tool that reaches the operator must hold a valid, in-scope grant.
      const needs =
        tool === "apply_change"
          ? "tariff-change"
          : tool === "query_available_tariffs" || tool === "escalate_to_manager"
            ? "tariff-options"
            : null;
      if (needs) {
        const v = verifyGrant(s.grant, { secret: resolverSecret() });
        if (!v.ok || !s.grant?.scopes.includes(needs)) {
          return { allow: false, reason: `no valid grant for "${needs}" — call authorize_external first (${v.reason ?? "grant out of scope"})` };
        }
      }
      if (tool === "apply_change") {
        const e = forTicket(ticket.id);
        if (!e || e.status !== "approved") return { allow: false, reason: "manager approval required before any change" };
        return { allow: true, reason: `grant + manager-approved${e.chosen_tariff_id ? " · " + e.chosen_tariff_id : ""}` };
      }
      if (needs) return { allow: true, reason: `grant covers ${needs}` };
    },
    system:
      `You are Globex operations' assistant for ticket ${ticket.id}: ${ticket.subscriber}, line ${ticket.line_id} on ${ticket.operator_name}, request "${ticket.request}". This is the AGENT-TO-AGENT flow. ` +
      "You reach the operator's OWN agent for everything — you never drive a human portal. You do not decide on your own that reaching out is allowed: Globex's own policy resolver clears WHETHER you may reach this partner and issues a short-lived scoped grant (your outward calls carry it and are refused without it), and a Globex manager makes the human decision on WHICH tariff. Follow this order: " +
      "(1) check_internal_capability — confirm Globex can't do this itself, so it is external; " +
      "(2) authorize_external with the outcome you need ('tariff-options' to read plans, 'tariff-change' to change one) to get a grant — you cannot reach the operator without one, and a denial goes to a human; " +
      "(3) query_available_tariffs to fetch the options; " +
      "(4) escalate_to_manager with those options for the manager to choose and approve or reject; " +
      "(5) once approved, on the operator's go-ahead, apply_change to perform the manager's chosen tariff, which closes the ticket. " +
      "If a grant has expired, call authorize_external again before reaching out. Never apply a change the manager hasn't approved. Keep replies short and plain. " +
      statusLine,
    tools,
    message,
    onEvent: agentEvents(onLog),
    maxSteps: 10,
  });

  await dirMcp.close();
  await resolverMcp.close();
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
