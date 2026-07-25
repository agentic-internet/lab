import { buildManifest, WELL_KNOWN } from "@ail/capability-manifest";
import { ORG, CAPABILITIES } from "@/src/data";

export function GET(request: Request) {
  const origin = new URL(request.url).origin;

  const manifest = buildManifest({
    version: "0.1",
    organization: {
      name: ORG.name,
      domain: origin,
      description: ORG.description,
    },
    agent_endpoint: `${origin}/agent`,
    capabilities: CAPABILITIES.map((c) => ({
      id: c.id,
      detail: `${origin}${WELL_KNOWN.capability(c.id)}`,
    })),
    interaction: [{ type: "agent", target: `${origin}/agent`, protocol: "unspecified" }],
    policies: { accepts_automated_requests: true, contact: "agents@acme-telecom.example" },
  });

  return Response.json(manifest, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
