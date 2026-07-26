import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

/**
 * Globex's internal directory, exposed as a real MCP server. The internal
 * chatbot reaches it over MCP (in-memory transport, so no subprocess) — which
 * is exactly what the log panel shows: "MCP call -> MCP response".
 *
 * This is deliberately the thing that already exists inside a company: who has
 * which line, and which operator it's on.
 */

const DIRECTORY: Record<
  string,
  { line_id: string; operator_name: string; operator_domain: string }
> = {
  // Keyed by the employee — the same person who appears on Acme's account as the
  // holder of GLX-4471. Keeps the two platforms aligned on one named individual.
  "Jordan Blake": {
    line_id: "GLX-4471",
    operator_name: "Acme Telecom",
    operator_domain: process.env.ACME_URL ?? "http://localhost:3001",
  },
};

export function buildGlobexServer(): McpServer {
  const server = new McpServer({ name: "globex-directory", version: "0.1.0" });

  server.registerTool(
    "lookup_line",
    {
      title: "Look up an employee's mobile line and current plan",
      description:
        "Return the line id, operator, operator domain, and the current package (data, minutes, " +
        "price) for a Globex employee. Use this to answer questions about someone's current plan.",
      inputSchema: { subscriber: z.string() },
    },
    async ({ subscriber }) => {
      const rec = DIRECTORY[subscriber];
      if (!rec) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: "unknown subscriber" }) }] };
      }
      // Enrich with the live current package from the operator's customer API —
      // Globex is the account holder, so this is its own account data.
      let current: unknown = null;
      try {
        const data = (await fetch(`${rec.operator_domain}/admin/api/lines`, { cache: "no-store" }).then((r) =>
          r.json(),
        )) as { lines?: { line_id: string; tariff_id: string; tariff_name?: string }[]; tariffs?: { id: string; name: string; data_gb: number; mins: number; price_usd: number }[] };
        const line = (data.lines ?? []).find((l) => l.line_id === rec.line_id);
        const tariff = (data.tariffs ?? []).find((t) => t.id === line?.tariff_id);
        if (tariff) {
          current = { tariff: tariff.name, data_gb: tariff.data_gb, mins: tariff.mins, price_usd: tariff.price_usd };
        } else if (line?.tariff_name) {
          current = { tariff: line.tariff_name };
        }
      } catch {
        // operator API unreachable — return the line without the live plan
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ ...rec, current }) }] };
    },
  );

  return server;
}

/** Stand up the server + a connected client over an in-memory transport. */
export async function connectGlobexMcp(): Promise<Client> {
  const server = buildGlobexServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "globex-agent", version: "0.1.0" });
  await client.connect(clientTransport);
  return client;
}

/** Call an MCP tool and parse its text result back to an object. */
export async function mcpCallJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as Array<{ type: string; text?: string }>;
  const first = content?.[0];
  return first?.text ? JSON.parse(first.text) : undefined;
}
