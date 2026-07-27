import {
  type Capability,
  type OrgManifest,
  type Grant,
  OrgManifest as OrgManifestSchema,
  Capability as CapabilitySchema,
  verifyGrant,
  hostOf,
} from "@ail/shared";
import { WELL_KNOWN } from "@ail/capability-manifest";

/**
 * The consumer side: how an agent that has never met an organization discovers
 * what it can do, starting from just a domain.
 *
 *   domain -> GET /robots.txt        -> find the `Agent:` line
 *          -> GET /.well-known/agent -> the OrgManifest (who + what + how)
 *          -> GET each capability    -> the full terms before acting
 *
 * Every step here is a real HTTP fetch. This runs the same in every mode — it
 * is the "always real" mechanic, independent of the LLM.
 */

/** A fetch function so callers can inject logging / their own client. */
export type Fetcher = (url: string) => Promise<{ status: number; text: string }>;

/** An event emitted for each real step — the demo's log panel subscribes to this. */
export type DiscoveryEvent =
  | { step: "fetch-robots"; url: string }
  | { step: "found-agent-path"; agentUrl: string }
  | { step: "fetch-manifest"; url: string }
  | { step: "manifest"; manifest: OrgManifest }
  | { step: "fetch-capability"; id: string; url: string }
  | { step: "capability"; capability: Capability }
  | { step: "note"; message: string };

export type OnEvent = (e: DiscoveryEvent) => void;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  return { status: res.status, text: await res.text() };
};

function base(domain: string): string {
  return domain.startsWith("http") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

/** Parse the `Agent:` line out of a robots.txt body. */
export function parseAgentLine(robots: string): string | undefined {
  for (const line of robots.split("\n")) {
    const m = line.match(/^\s*Agent:\s*(\S+)/i);
    if (m) return m[1];
  }
  return undefined;
}

export interface Discovered {
  manifest: OrgManifest;
  capabilities: Capability[];
}

/**
 * Full discovery from a bare domain. Returns the org manifest + every capability
 * it points at, all validated against the shared contract.
 */
export async function discover(
  domain: string,
  opts: { fetch?: Fetcher; onEvent?: OnEvent } = {},
): Promise<Discovered> {
  const get = opts.fetch ?? defaultFetcher;
  const emit = opts.onEvent ?? (() => {});
  const root = base(domain);

  const robotsUrl = `${root}${WELL_KNOWN.robots}`;
  emit({ step: "fetch-robots", url: robotsUrl });
  const robots = await get(robotsUrl);
  const agentUrl = parseAgentLine(robots.text) ?? `${root}${WELL_KNOWN.agent}`;
  emit({ step: "found-agent-path", agentUrl });

  emit({ step: "fetch-manifest", url: agentUrl });
  const manifestRes = await get(agentUrl);
  const manifest = OrgManifestSchema.parse(JSON.parse(manifestRes.text));
  emit({ step: "manifest", manifest });

  const capabilities: Capability[] = [];
  for (const ref of manifest.capabilities) {
    const url = ref.detail.startsWith("http") ? ref.detail : `${root}${ref.detail}`;
    emit({ step: "fetch-capability", id: ref.id, url });
    const capRes = await get(url);
    const capability = CapabilitySchema.parse(JSON.parse(capRes.text));
    capabilities.push(capability);
    emit({ step: "capability", capability });
  }

  return { manifest, capabilities };
}

/**
 * Invoke a discovered capability against the org's agent endpoint.
 * The manifest's agent_endpoint is where capability calls are POSTed.
 */
export async function callCapability(
  agentEndpoint: string,
  capabilityId: string,
  input: Record<string, unknown>,
  opts: { onEvent?: OnEvent } = {},
): Promise<{ status: number; body: unknown }> {
  const emit = opts.onEvent ?? (() => {});
  emit({ step: "note", message: `call ${capabilityId} → ${agentEndpoint}` });
  const res = await fetch(agentEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability: capabilityId, input }),
  });
  const body = await res.json().catch(() => ({}));
  emit({ step: "note", message: `← ${res.status} ${JSON.stringify(body)}` });
  return { status: res.status, body };
}

/** What comes back when the client refuses to make an unauthorized call. */
export interface Refused {
  refused: true;
  reason: string;
}

export function isRefused(x: unknown): x is Refused {
  return typeof x === "object" && x !== null && (x as Refused).refused === true;
}

/**
 * The ONLY outward-acting call an adopting agent gets. There is no generic
 * "fetch any URL" — the enforcement lives here, in the provided client library
 * (the notebook's decision: enforcement in the library, not a mandatory broker).
 *
 * It refuses BEFORE any network happens unless the grant is valid, unexpired,
 * for THIS partner, and covers THIS outcome. No grant, no call.
 */
export async function callExternal(
  grant: Grant | undefined,
  target: {
    /** The partner domain the resolver authorized (host-compared to the grant). */
    partner_domain: string;
    /** Where discovered capability calls are POSTed. */
    agentEndpoint: string;
    /** The discovered capability's id. */
    capabilityId: string;
    /** The capability's semantic outcome — matched against the grant's scopes. */
    outcome: string;
  },
  input: Record<string, unknown>,
  opts: { secret?: string; onEvent?: OnEvent } = {},
): Promise<{ status: number; body: unknown } | Refused> {
  const emit = opts.onEvent ?? (() => {});
  const v = verifyGrant(grant, { secret: opts.secret });
  if (!v.ok) {
    emit({ step: "note", message: `call refused — ${v.reason}` });
    return { refused: true, reason: v.reason! };
  }
  if (hostOf(grant!.partner_domain) !== hostOf(target.partner_domain)) {
    const reason = `grant is for ${grant!.partner_domain}, not ${target.partner_domain}`;
    emit({ step: "note", message: `call refused — ${reason}` });
    return { refused: true, reason };
  }
  if (!grant!.scopes.includes(target.outcome)) {
    const reason = `grant does not cover "${target.outcome}" (allows ${grant!.scopes.join(", ") || "nothing"})`;
    emit({ step: "note", message: `call refused — ${reason}` });
    return { refused: true, reason };
  }
  return callCapability(target.agentEndpoint, target.capabilityId, input, opts);
}

/** Rough meaning-based match: does this capability fit what the caller wants? */
export function matchCapability(
  capabilities: Capability[],
  want: { outcome?: string; text?: string },
): Capability[] {
  const text = (want.text ?? "").toLowerCase();
  return capabilities
    .map((c) => {
      let score = 0;
      if (want.outcome && c.semantics.outcome === want.outcome) score += 3;
      for (const v of [...c.semantics.verbs, ...c.semantics.aliases]) {
        if (text.includes(v.toLowerCase())) score += 1;
      }
      if (text.includes(c.semantics.domain.toLowerCase())) score += 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);
}
