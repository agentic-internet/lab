import { runAgent, scriptedProvider, toolResultCount, type ToolDef, type LLMProvider } from "@ail/agent-core";
import { discover, matchCapability, callCapability } from "@ail/capability-client";
import { connectGlobexMcp, mcpCallJson } from "@ail/mcp-servers";
import type { Capability } from "@ail/shared";

/**
 * Globex's internal chatbot, resolving a tariff-upgrade request in AGENT->AGENT
 * mode: MCP to find the employee's line/operator, discover the operator's agent,
 * ask what tariffs the line can move to, and (with operations' approval) make
 * the change — refusing a downgrade along the way.
 *
 * Emits one unified stream of typed log entries — exactly what the log panel
 * shows. The LLM is pluggable; the deterministic provider drives it at zero cost.
 */

export type LogChannel = "user" | "agent" | "tool" | "mcp" | "http" | "policy" | "assistant";
export interface LogEntry {
  channel: LogChannel;
  text: string;
  data?: unknown;
}
export type OnLog = (e: LogEntry) => void;

interface Scratch {
  subscriber: string;
  line_id?: string;
  operator_name?: string;
  operator_domain?: string;
  agent_endpoint?: string;
  capabilities?: Capability[];
  options?: { id: string; name: string; price_usd: number }[];
  triedDowngrade?: boolean;
  upgraded?: boolean;
}

export async function runTelecomAgent(opts: {
  subscriber: string;
  message: string;
  onLog: OnLog;
  provider?: LLMProvider; // default: deterministic
}): Promise<string> {
  const { subscriber, message, onLog } = opts;
  const s: Scratch = { subscriber };
  const mcp = await connectGlobexMcp();

  const tools: ToolDef[] = [
    {
      name: "lookup_line",
      description: "Find the employee's mobile line and current operator (internal directory).",
      input: { subscriber: { type: "string", required: true } },
      run: async (args) => {
        onLog({ channel: "mcp", text: `call lookup_line(${JSON.stringify(args)})` });
        const rec = (await mcpCallJson(mcp, "lookup_line", args)) as Scratch;
        onLog({ channel: "mcp", text: `response ${JSON.stringify(rec)}`, data: rec });
        s.line_id = rec.line_id;
        s.operator_name = rec.operator_name;
        s.operator_domain = rec.operator_domain;
        return rec;
      },
    },
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
        const tariffs = (res.body as { tariffs: Scratch["options"] }).tariffs ?? [];
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
        if (res.status === 409) {
          onLog({ channel: "policy", text: `refused: ${(res.body as { reason: string }).reason}`, data: res.body });
        }
        return { status: res.status, ...(res.body as object) };
      },
    },
  ];

  // deterministic orchestration: lookup -> discover -> query -> (downgrade,refused) -> upgrade -> reply
  const provider = opts.provider ??
    scriptedProvider("deterministic", () => {
      if (!s.line_id) return { toolCall: { tool: "lookup_line", args: { subscriber } } };
      if (!s.agent_endpoint) return { toolCall: { tool: "discover_operator", args: { domain: s.operator_domain } } };
      if (!s.options) return { toolCall: { tool: "query_tariffs", args: { line_id: s.line_id } } };
      if (!s.triedDowngrade) {
        s.triedDowngrade = true;
        return { toolCall: { tool: "change_tariff", args: { line_id: s.line_id, target_tariff_id: "starter" } } };
      }
      if (!s.upgraded) {
        s.upgraded = true;
        const pick = s.options.at(-1)!;
        return { toolCall: { tool: "change_tariff", args: { line_id: s.line_id, target_tariff_id: pick.id } } };
      }
      const to = s.options.at(-1)!;
      return { text: `Done. ${s.line_id} moved to ${to.name} on ${s.operator_name}, with operations' approval.` };
    });

  const reply = await runAgent({
    provider,
    system: "You are Globex's internal assistant. Resolve tariff requests via the operator's agent. Never downgrade without approval.",
    tools,
    message,
    onEvent: (e) => {
      if (e.type === "user") onLog({ channel: "user", text: e.text });
      if (e.type === "tool-call") onLog({ channel: "tool", text: `${e.tool}(${JSON.stringify(e.args)})` });
      if (e.type === "tool-result") onLog({ channel: "tool", text: `${e.tool} -> ${JSON.stringify(e.result)}`, data: e.result });
      if (e.type === "assistant") onLog({ channel: "assistant", text: e.text });
    },
  });

  await mcp.close();
  return reply;
}
