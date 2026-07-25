import { type Capability, type OrgManifest, OrgManifest as OrgManifestSchema, Capability as CapabilitySchema } from "@ail/shared";

/**
 * The producer side: how an organization publishes what it can do.
 *
 * No framework, no registry. An org exposes:
 *   /robots.txt                          -> one line pointing at the agent path
 *   /.well-known/agent                   -> the OrgManifest
 *   /.well-known/agent/capabilities/<id> -> each Capability
 *
 * Any web server can serve these. This package just builds and validates the
 * documents so the shape always matches the shared contract.
 */

export interface ManifestSources {
  manifest: OrgManifest;
  capabilities: Capability[];
}

/** The `Agent:` line for robots.txt (alongside Sitemap:). */
export function robotsAgentLine(agentUrl: string): string {
  return `Agent: ${agentUrl}`;
}

/** A minimal robots.txt that announces the agent path. */
export function buildRobotsTxt(opts: {
  agentUrl: string;
  disallow?: string[];
  sitemap?: string;
}): string {
  const lines = ["User-agent: *"];
  for (const d of opts.disallow ?? []) lines.push(`Disallow: ${d}`);
  lines.push("");
  if (opts.sitemap) lines.push(`Sitemap: ${opts.sitemap}`);
  lines.push(robotsAgentLine(opts.agentUrl));
  return lines.join("\n") + "\n";
}

/** Validate + return the org manifest (served at /.well-known/agent). */
export function buildManifest(manifest: OrgManifest): OrgManifest {
  return OrgManifestSchema.parse(manifest);
}

/** Validate + return a capability (served at /.well-known/agent/capabilities/<id>). */
export function buildCapability(capability: Capability): Capability {
  return CapabilitySchema.parse(capability);
}

/** Convenience: validate a whole set at once. */
export function buildAll(sources: ManifestSources): ManifestSources {
  return {
    manifest: buildManifest(sources.manifest),
    capabilities: sources.capabilities.map(buildCapability),
  };
}

/** The conventional paths, in one place so producer and consumer agree. */
export const WELL_KNOWN = {
  agent: "/.well-known/agent",
  capability: (id: string) => `/.well-known/agent/capabilities/${id}`,
  robots: "/robots.txt",
} as const;
