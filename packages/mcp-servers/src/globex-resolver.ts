import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { signGrant, hostOf, resolverSecret } from "@ail/shared";

/**
 * Globex's own policy resolver, exposed as a real MCP server.
 *
 * This is the "permission to reach out" from the notebook made into a running
 * thing (assumptions/how-an-agent-decides-to-reach-out.md). It is NOT a shared
 * directory and it answers no "who can do X" question — only, for a partner
 * Globex ALREADY deals with: am I cleared to act outside for this, and with what
 * scope? It is the machine-readable form of the list every company already keeps
 * — approved vendors, egress policy, spend limits.
 *
 * On "yes" it hands back a scoped, short-lived grant the agent cannot mint
 * itself. On "no", "no" is not an error — it is the point where the request
 * turns into a typed request to a human.
 */

interface PartnerPolicy {
  name: string;
  /** The capability outcomes Globex permits with this partner. */
  scopes: string[];
  limits?: Record<string, number>;
}

/** Globex-private approved-partner + egress policy. Keyed by host. */
const APPROVED: Record<string, PartnerPolicy> = {
  [hostOf(process.env.ACME_URL ?? "http://localhost:3001")]: {
    name: "Acme Telecom",
    // Globex is Acme's account holder — cleared to read options and change a
    // tariff, but only AUTONOMOUSLY up to a spend cap. A change above the cap is
    // not refused outright — it needs a human sign-off (a request to a human).
    scopes: ["tariff-options", "tariff-change"],
    limits: { max_price_usd: 50 },
  },
};

export interface AuthorizeDecision {
  allowed: boolean;
  reason?: string;
  partner_name?: string;
  partner_domain?: string;
  scopes?: string[];
  limits?: Record<string, number>;
  grant?: ReturnType<typeof signGrant>;
}

export function buildGlobexResolver(): McpServer {
  const server = new McpServer({ name: "globex-resolver", version: "0.1.0" });

  server.registerTool(
    "authorize_external",
    {
      title: "Authorize reaching an external organization",
      description:
        "Globex's private policy check before any outward action. Given a partner domain Globex " +
        "already deals with and the outcome the agent wants (e.g. 'tariff-change'), decide whether " +
        "Globex permits it, and if so return a scoped, short-lived grant. Denial is not an error — " +
        "it becomes a request to a human. Never answers 'who can do X'.",
      inputSchema: {
        partner_domain: z.string(),
        outcome: z.string().optional(),
      },
    },
    async ({ partner_domain, outcome }) => {
      const host = hostOf(partner_domain);
      const policy = APPROVED[host];
      const decide = (): AuthorizeDecision => {
        if (!policy) {
          return { allowed: false, reason: `${host} is not on Globex's approved-partner list` };
        }
        if (outcome && !policy.scopes.includes(outcome)) {
          return {
            allowed: false,
            reason: `Globex policy does not permit "${outcome}" with ${policy.name}`,
            partner_name: policy.name,
          };
        }
        const grant = signGrant(
          {
            issuer: "globex-marketing.resolver",
            partner_domain: host,
            scopes: policy.scopes,
            limits: policy.limits,
            ttl_ms: 5 * 60 * 1000,
          },
          resolverSecret(),
        );
        return {
          allowed: true,
          partner_name: policy.name,
          partner_domain: host,
          scopes: policy.scopes,
          limits: policy.limits,
          grant,
        };
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(decide()) }] };
    },
  );

  return server;
}

/** Stand up the resolver + a connected client over an in-memory transport. */
export async function connectGlobexResolver(): Promise<Client> {
  const server = buildGlobexResolver();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "globex-agent", version: "0.1.0" });
  await client.connect(clientTransport);
  return client;
}
