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
  "Globex Marketing": {
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
      title: "Look up a subscriber's mobile line",
      description:
        "Return the line id, current operator, and operator domain for a Globex team or employee.",
      inputSchema: { subscriber: z.string() },
    },
    async ({ subscriber }) => {
      const rec = DIRECTORY[subscriber];
      const text = rec ? JSON.stringify(rec) : JSON.stringify({ error: "unknown subscriber" });
      return { content: [{ type: "text" as const, text }] };
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
