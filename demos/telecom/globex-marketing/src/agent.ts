import { runAgent, scriptedProvider, type ToolDef, type LLMProvider } from "@ail/agent-core";
import { discover, matchCapability, callCapability } from "@ail/capability-client";
import { connectGlobexMcp, mcpCallJson } from "@ail/mcp-servers";
import type { Capability } from "@ail/shared";
import { createTicket, getTicket, resolveTicket, type Ticket } from "./tickets";

/**
 * Two phases, matching the design: a Globex employee can't change their own line.
 *   intake  — employee asks; the assistant finds the line (MCP) and opens a ticket.
 *   resolve — operations approves; the assistant works with the operator's agent.
 *
 * Both emit one unified stream of typed log entries — what the log panel shows.
 */

export type LogChannel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant";
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

export async function runIntake(opts: {
  subscriber: string;
  message: string;
  onLog: OnLog;
  provider?: LLMProvider;
}): Promise<Ticket | undefined> {
  const { subscriber, message, onLog } = opts;
  const mcp = await connectGlobexMcp();
  const s: { line?: { line_id: string; operator_name: string; operator_domain: string }; ticket?: Ticket } = {};

  const tools: ToolDef[] = [
    {
      name: "lookup_line",
      description: "Find the employee's mobile line and current operator.",
      input: { subscriber: { type: "string", required: true } },
      run: async (args) => {
        onLog({ channel: "mcp", text: `call lookup_line(${JSON.stringify(args)})` });
        const rec = (await mcpCallJson(mcp, "lookup_line", args)) as typeof s.line;
        onLog({ channel: "mcp", text: `response ${JSON.stringify(rec)}`, data: rec });
        s.line = rec!;
        return rec;
      },
    },
    {
      name: "open_ticket",
      description: "Log the request for operations to review. Employees cannot self-serve.",
      input: { request: { type: "string", required: true } },
      run: async (args) => {
        s.ticket = createTicket({
          subscriber,
          line_id: s.line!.line_id,
          operator_name: s.line!.operator_name,
          operator_domain: s.line!.operator_domain,
          request: String(args.request),
        });
        return { ticket_id: s.ticket.id, status: s.ticket.status };
      },
    },
  ];

  const provider = opts.provider ??
    scriptedProvider("deterministic", () => {
      if (!s.line) return { toolCall: { tool: "lookup_line", args: { subscriber } } };
      if (!s.ticket) return { toolCall: { tool: "open_ticket", args: { request: message } } };
      return { text: `Logged as ${s.ticket.id}. Operations will review it — you can't change the line yourself.` };
    });

  await runAgent({
    provider,
    system: "You are Globex's internal assistant. Find the line and open a ticket. Never change a line directly.",
    tools,
    message,
    onEvent: agentEvents(onLog),
  });

  await mcp.close();
  return s.ticket;
}

/* --------------------------------------------------------------- resolve --- */

export async function runResolve(opts: {
  ticketId: string;
  onLog: OnLog;
  provider?: LLMProvider;
}): Promise<Ticket | undefined> {
  const { ticketId, onLog } = opts;
  const ticket = getTicket(ticketId);
  if (!ticket) {
    onLog({ channel: "policy", text: `unknown ticket ${ticketId}` });
    return undefined;
  }

  const s: {
    agent_endpoint?: string;
    capabilities?: Capability[];
    options?: { id: string; name: string; price_usd: number }[];
    triedDowngrade?: boolean;
    upgraded?: boolean;
    to?: string;
  } = {};

  const tools: ToolDef[] = [
    {
      name: "discover_operator",
      description: "Discover the operator's agent from its domain and learn its capabilities.",
      input: { domain: { type: "string", required: true } },
      run: async (args) => {
        const found = await discover(String(args.domain), {
          onEvent: (e) => {
            if (e.step === "fetch-robots") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "found-agent-path") onLog({ channel: "http", text: `Agent: ${e.agentUrl}` });
            if (e.step === "fetch-manifest") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "manifest") onLog({ channel: "http", text: `${e.manifest.organization.name}: ${e.manifest.capabilities.length} capabilities` });
            if (e.step === "fetch-capability") onLog({ channel: "http", text: `GET ${e.url}` });
            if (e.step === "capability") onLog({ channel: "http", text: `${e.capability.id} (costs_money=${e.capability.terms.costs_money})` });
          },
        });
        s.agent_endpoint = found.manifest.agent_endpoint;
        s.capabilities = found.capabilities;
        return { agent_endpoint: s.agent_endpoint, capabilities: found.capabilities.map((c) => c.id) };
      },
    },
    {
      name: "query_tariffs",
      description: "Ask the operator which tariffs the line can move to.",
      input: { line_id: { type: "string", required: true } },
      run: async (args) => {
        const cap = matchCapability(s.capabilities ?? [], { outcome: "tariff-options" })[0]!;
        const res = await callCapability(s.agent_endpoint!, cap.id, { line_id: args.line_id });
        const tariffs = (res.body as { tariffs: typeof s.options }).tariffs ?? [];
        s.options = tariffs;
        return { tariffs };
      },
    },
    {
      name: "change_tariff",
      description: "Change the line to a target tariff. Downgrades are refused by the operator.",
      input: { line_id: { type: "string", required: true }, target_tariff_id: { type: "string", required: true } },
      run: async (args) => {
        const res = await callCapability(s.agent_endpoint!, "telecom.line.tariff.change", {
          line_id: args.line_id,
          target_tariff_id: args.target_tariff_id,
        });
        if (res.status === 409) onLog({ channel: "policy", text: `refused: ${(res.body as { reason: string }).reason}` });
        return { status: res.status, ...(res.body as object) };
      },
    },
  ];

  const provider = opts.provider ??
    scriptedProvider("deterministic", () => {
      if (!s.agent_endpoint) return { toolCall: { tool: "discover_operator", args: { domain: ticket.operator_domain } } };
      if (!s.options) return { toolCall: { tool: "query_tariffs", args: { line_id: ticket.line_id } } };
      if (!s.triedDowngrade) {
        s.triedDowngrade = true;
        return { toolCall: { tool: "change_tariff", args: { line_id: ticket.line_id, target_tariff_id: "starter" } } };
      }
      if (!s.upgraded) {
        s.upgraded = true;
        const pick = s.options.at(-1)!;
        s.to = pick.name;
        return { toolCall: { tool: "change_tariff", args: { line_id: ticket.line_id, target_tariff_id: pick.id } } };
      }
      return { text: `Approved and done. ${ticket.line_id} moved to ${s.to} on ${ticket.operator_name}.` };
    });

  const reply = await runAgent({
    provider,
    system: "You are Globex operations. Resolve the ticket via the operator's agent. Refuse downgrades.",
    tools,
    message: `Resolve ticket ${ticket.id}: ${ticket.request}`,
    onEvent: agentEvents(onLog),
  });

  return resolveTicket(ticket.id, reply);
}
